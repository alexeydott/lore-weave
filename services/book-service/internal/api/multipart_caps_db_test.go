package api

// Round 2 (G120) — multipart upload handlers must cap the request body
// BEFORE parsing.
//
// ParseMultipartForm's size argument bounds only the in-memory part; the
// rest spools to disk, so without an http.MaxBytesReader wrap an unbounded
// body fills disk — and uploadCover / createChapter then io.ReadAll the
// whole file into memory with no size check at all. uploadChapterMedia and
// uploadWorldMapImageCore do check fh.Size, but only AFTER the spool.
//
// Requires BOOK_TEST_DATABASE_URL (a migrated book DB), else skipped —
// same gating as the other *_db_test.go files in this package. Bodies are
// streamed through an io.Pipe so a 50 MB over-cap file never sits in
// memory whole.

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

// overCapBody streams a multipart body whose file part is fileSize bytes.
// The writer runs in a goroutine and tolerates the server aborting the
// read early (MaxBytesReader closes the body once the cap is hit).
func overCapBody(t *testing.T, fileSize int64, field, filename, contentType string, fields map[string]string) (io.Reader, string) {
	t.Helper()
	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	go func() {
		defer pw.Close()
		defer mw.Close()
		for k, v := range fields {
			_ = mw.WriteField(k, v)
		}
		h := make(map[string][]string)
		h["Content-Disposition"] = []string{fmt.Sprintf(`form-data; name="%s"; filename="%s"`, field, filename)}
		h["Content-Type"] = []string{contentType}
		part, err := mw.CreatePart(h)
		if err != nil {
			return
		}
		// ASCII content, not NUL bytes: a chapter body of NULs becomes
		// invalid jsonb in chapter_drafts and aborts the tx (the control
		// would 500 for the wrong reason).
		chunk := bytes.Repeat([]byte("x"), 32<<10)
		var written int64
		for written < fileSize {
			n := int64(len(chunk))
			if fileSize-written < n {
				n = fileSize - written
			}
			if _, err := part.Write(chunk[:n]); err != nil {
				return
			}
			written += n
		}
	}()
	return pr, mw.FormDataContentType()
}

func TestUploadCover_OverCapRejected413(t *testing.T) {
	s, pool := dbTestServer(t)
	ctx := context.Background()
	owner := uuid.New()
	var bookID uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO books(owner_user_id,title) VALUES($1,'cap') RETURNING id`, owner).Scan(&bookID); err != nil {
		t.Fatalf("seed book: %v", err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM books WHERE id=$1`, bookID) })
	token := mcpJWT(t, owner)

	// Control: a 1 KiB cover is accepted (proves route/auth/DB all work,
	// so the 413 below is the cap, not a setup failure).
	small, smallCT := overCapBody(t, 1024, "file", "cover.png", "image/png", nil)
	req := httptest.NewRequest(http.MethodPost, "/v1/books/"+bookID.String()+"/cover", small)
	req.Header.Set("Content-Type", smallCT)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	s.Router().ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("control cover upload: got %d want 200 (%s)", rr.Code, rr.Body.String())
	}

	// Over the cap: 10 MiB + 128 KiB file (past the 10 MiB + 64 KiB
	// MaxBytesReader cap) must be rejected with 413, not spooled to disk
	// and read whole into memory.
	big, bigCT := overCapBody(t, (10<<20)+(128<<10), "file", "cover.png", "image/png", nil)
	req = httptest.NewRequest(http.MethodPost, "/v1/books/"+bookID.String()+"/cover", big)
	req.Header.Set("Content-Type", bigCT)
	req.Header.Set("Authorization", "Bearer "+token)
	rr = httptest.NewRecorder()
	s.Router().ServeHTTP(rr, req)
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("over-cap cover upload: got %d want 413 (%s)", rr.Code, rr.Body.String())
	}
}

func TestCreateChapterMultipart_OverCapRejected413(t *testing.T) {
	s, pool := dbTestServer(t)
	ctx := context.Background()
	owner := uuid.New()
	var bookID uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO books(owner_user_id,title) VALUES($1,'cap') RETURNING id`, owner).Scan(&bookID); err != nil {
		t.Fatalf("seed book: %v", err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM books WHERE id=$1`, bookID) })
	// The dbTestServer stub resolves every caller as GrantOwner with a FRESH
	// random owner id, and the test config's QuotaBytesDefault is 0 — so a
	// chapter create would 507 on quota before reaching the cap. Pin the
	// resolver to this test's owner and give it headroom.
	s.resolveBook = func(_ context.Context, _, _ uuid.UUID) (GrantLevel, uuid.UUID, string, error) {
		return GrantOwner, owner, "active", nil
	}
	if _, err := pool.Exec(ctx, `INSERT INTO user_storage_quota(owner_user_id, used_bytes, quota_bytes) VALUES($1, 0, $2) ON CONFLICT(owner_user_id) DO UPDATE SET quota_bytes=EXCLUDED.quota_bytes`, owner, 1<<30); err != nil {
		t.Fatalf("seed quota: %v", err)
	}
	token := mcpJWT(t, owner)
	fields := map[string]string{"original_language": "en", "title": "t"}

	// Control: a small chapter upload succeeds (2xx), proving the setup.
	small, smallCT := overCapBody(t, 1024, "file", "ch.txt", "text/plain", fields)
	req := httptest.NewRequest(http.MethodPost, "/v1/books/"+bookID.String()+"/chapters", small)
	req.Header.Set("Content-Type", smallCT)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	s.Router().ServeHTTP(rr, req)
	if rr.Code < 200 || rr.Code >= 300 {
		t.Fatalf("control chapter upload: got %d want 2xx (%s)", rr.Code, rr.Body.String())
	}

	// Over the cap: 50 MiB + 128 KiB file (past the 50 MiB + 64 KiB
	// MaxBytesReader cap) must be rejected with 413.
	big, bigCT := overCapBody(t, (50<<20)+(128<<10), "file", "ch.txt", "text/plain", fields)
	req = httptest.NewRequest(http.MethodPost, "/v1/books/"+bookID.String()+"/chapters", big)
	req.Header.Set("Content-Type", bigCT)
	req.Header.Set("Authorization", "Bearer "+token)
	rr = httptest.NewRecorder()
	s.Router().ServeHTTP(rr, req)
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("over-cap chapter upload: got %d want 413 (%s)", rr.Code, rr.Body.String())
	}
}
