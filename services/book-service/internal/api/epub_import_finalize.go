package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type epubStagingPayload struct {
	SourceKey  string          `json:"source_key"`
	Title      string          `json:"title"`
	TiptapJSON json.RawMessage `json:"tiptap_json"`
	Scenes     []struct {
		SortOrder   int    `json:"sort_order"`
		Path        string `json:"path"`
		LeafText    string `json:"leaf_text"`
		ContentHash string `json:"content_hash"`
	} `json:"scenes"`
}

func (s *Server) finalizeEPUBImport(w http.ResponseWriter, r *http.Request) {
	jobID, ok := parseEPUBImportJobID(w, r)
	if !ok {
		return
	}
	created, err := s.materializeEPUBImport(r.Context(), jobID)
	if err != nil {
		writeError(w, http.StatusConflict, "IMPORT_FINALIZE_FAILED", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"job_id": jobID, "chapters_created": created, "status": "completed"})
}

// materializeEPUBImport is idempotent by immutable chapter provenance. It is
// intentionally Book-owned: workers submit staging JSON but never write book
// tables directly.
func (s *Server) materializeEPUBImport(ctx context.Context, jobID uuid.UUID) (int, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	var bookID, sourceID, userID uuid.UUID
	var sourceSHA, language, status string
	var progressTotal int
	err = tx.QueryRow(ctx, `
SELECT j.book_id,j.source_id,j.user_id,s.sha256,COALESCE(s.metadata_json->>'language','und'),j.status,j.progress_total
FROM import_jobs j JOIN import_sources s ON s.id=j.source_id
WHERE j.id=$1 AND j.pipeline_version=$2 FOR UPDATE`, jobID, epubImportPipelineVersion).
		Scan(&bookID, &sourceID, &userID, &sourceSHA, &language, &status, &progressTotal)
	if err != nil {
		return 0, fmt.Errorf("load import job: %w", err)
	}
	if status == "completed" || status == "completed_with_warnings" {
		var existing int
		_ = tx.QueryRow(ctx, `SELECT chapters_created FROM import_jobs WHERE id=$1`, jobID).Scan(&existing)
		return existing, tx.Commit(ctx)
	}
	var pending, failed int
	if err := tx.QueryRow(ctx, `SELECT count(*) FILTER (WHERE selected AND status IN ('pending','processing')), count(*) FILTER (WHERE selected AND status='failed') FROM import_job_items WHERE job_id=$1`, jobID).Scan(&pending, &failed); err != nil {
		return 0, err
	}
	if pending != 0 || failed != 0 {
		return 0, fmt.Errorf("import items are not ready")
	}
	var nextSort int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(sort_order),0)+1 FROM chapters WHERE book_id=$1 AND lifecycle_state='active'`, bookID).Scan(&nextSort); err != nil {
		return 0, err
	}
	rows, err := tx.Query(ctx, `
SELECT id,source_key,COALESCE(title,''),source_href,source_fragment,source_hash,staging_payload
FROM import_job_items
WHERE job_id=$1 AND selected AND status='import_ready'
ORDER BY ordinal
`, jobID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	created := 0
	for rows.Next() {
		var itemID uuid.UUID
		var sourceKey, title string
		var sourceHref, sourceFragment, sourceHash *string
		var raw []byte
		if err := rows.Scan(&itemID, &sourceKey, &title, &sourceHref, &sourceFragment, &sourceHash, &raw); err != nil {
			return 0, err
		}
		var existing uuid.UUID
		err := tx.QueryRow(ctx, `SELECT chapter_id FROM chapter_import_provenance WHERE book_id=$1 AND source_sha256=$2 AND source_key=$3`, bookID, sourceSHA, sourceKey).Scan(&existing)
		if err == nil {
			if _, err := tx.Exec(ctx, `UPDATE import_job_items SET chapter_id=$2,status='active',updated_at=now() WHERE id=$1`, itemID, existing); err != nil {
				return 0, err
			}
			continue
		}
		if err != pgx.ErrNoRows {
			return 0, err
		}
		var staging epubStagingPayload
		if err := json.Unmarshal(raw, &staging); err != nil || !json.Valid(staging.TiptapJSON) {
			return 0, fmt.Errorf("invalid staging payload")
		}
		if staging.Title != "" {
			title = staging.Title
		}
		chapterID := uuid.New()
		storageKey := fmt.Sprintf("chapters/%s/import-%s-%d", bookID, jobID, nextSort)
		if _, err := tx.Exec(ctx, `INSERT INTO chapters(id,book_id,title,original_filename,original_language,content_type,byte_size,sort_order,storage_key,lifecycle_state,draft_updated_at,updated_at) VALUES($1,$2,$3,$4,$5,'application/json',$6,$7,$8,'active',now(),now())`, chapterID, bookID, nullableString(title), "epub-import.epub", importedLanguage(language), len(staging.TiptapJSON), nextSort, storageKey); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO chapter_drafts(chapter_id,body,draft_format,draft_updated_at,draft_version) VALUES($1,$2,'json',now(),1)`, chapterID, staging.TiptapJSON); err != nil {
			return 0, err
		}
		var revisionID uuid.UUID
		if err := tx.QueryRow(ctx, `INSERT INTO chapter_revisions(chapter_id,body,body_format,message,author_user_id) VALUES($1,$2,'json','imported from EPUB',$3) RETURNING id`, chapterID, staging.TiptapJSON, userID).Scan(&revisionID); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `UPDATE chapters SET draft_revision_count=1,editorial_status='published',published_revision_id=$2,kg_indexed_revision_id=$2,last_parsed_revision_id=$2 WHERE id=$1`, chapterID, revisionID); err != nil {
			return 0, err
		}
		for _, scene := range staging.Scenes {
			if _, err := tx.Exec(ctx, `INSERT INTO scenes(chapter_id,book_id,sort_order,path,leaf_text,content_hash,parse_version) VALUES($1,$2,$3,$4,$5,$6,1)`, chapterID, bookID, scene.SortOrder, scene.Path, scene.LeafText, scene.ContentHash); err != nil {
				return 0, err
			}
		}
		if _, err := tx.Exec(ctx, `
INSERT INTO chapter_import_provenance(
  chapter_id,book_id,import_job_id,import_item_id,source_id,source_sha256,source_key,
  source_href,source_fragment,source_hash,finalized_at
) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
`, chapterID, bookID, jobID, itemID, sourceID, sourceSHA, sourceKey, sourceHref, sourceFragment, sourceHash); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `UPDATE import_job_items SET chapter_id=$2,status='active',updated_at=now() WHERE id=$1`, itemID, chapterID); err != nil {
			return 0, err
		}
		created++
		nextSort++
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	var warningCount int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM import_job_items WHERE job_id=$1 AND selected AND jsonb_array_length(warnings_json)>0`, jobID).Scan(&warningCount); err != nil {
		return 0, err
	}
	finalStatus := "completed"
	if warningCount > 0 {
		finalStatus = "completed_with_warnings"
	}
	report, _ := json.Marshal(map[string]any{"job_id": jobID, "status": finalStatus, "chapters_created": created, "warnings": []any{}, "errors": []any{}, "metadata_applied": []string{}})
	if _, err := tx.Exec(ctx, `UPDATE import_jobs SET status=$2,chapters_created=$3,report_json=$4,finalized_at=now(),completed_at=now(),updated_at=now() WHERE id=$1`, jobID, finalStatus, created, report); err != nil {
		return 0, err
	}
	if err := emitJobEvent(ctx, tx, jobID, userID, "book_import", finalStatus, map[string]any{"progress": map[string]any{"done": progressTotal, "total": progressTotal}}); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return created, nil
}
