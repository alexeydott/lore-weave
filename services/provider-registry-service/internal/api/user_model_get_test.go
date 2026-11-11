package api

// DB-integration tests for the owner-scoped single user-model GET
// (GET /v1/model-registry/user-models/{id}).
//
// Why it exists: knowledge-service's extraction-config save-time validation
// (#user-report 2026-11-08) must check the referenced model is still active
// before accepting a precision_filter.model_ref. No single-read route existed,
// so the check either false-blocked (404 via a wrong-prefix URL,
// #user-report 2026-11-10) or degraded open (405). This pins: owner → 200 with
// is_active present; foreign owner / missing → 404 (the owner scope IS the
// access rule, mirroring patchUserModel). Requires
// TEST_PROVIDER_REGISTRY_DB_URL (see integrationServer); skips otherwise.
// Reuses seedModelWithCapability + signedToken from the capability test.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func getUserModel(t *testing.T, srv *Server, owner, id uuid.UUID) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/v1/model-registry/user-models/"+id.String(), nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, integrationJWTSecret, owner, ""))
	rr := httptest.NewRecorder()
	srv.getUserModel(rr, req)
	return rr
}

func TestGetUserModel_OwnerReadsActiveFlag(t *testing.T) {
	srv, pool := integrationServer(t)
	owner := uuid.New()
	id := seedModelWithCapability(t, pool, owner, "get-model", `{"chat": true}`)

	rr := getUserModel(t, srv, owner, id)
	if rr.Code != http.StatusOK {
		t.Fatalf("getUserModel: expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	var body struct {
		UserModelID string `json:"user_model_id"`
		IsActive    bool   `json:"is_active"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v (%s)", err, rr.Body.String())
	}
	if body.UserModelID != id.String() {
		t.Fatalf("expected user_model_id %s, got %s", id, body.UserModelID)
	}
	if !body.IsActive {
		t.Fatalf("expected is_active=true for a seeded active model")
	}
}

func TestGetUserModel_ForeignOwnerAndMissingAre404(t *testing.T) {
	srv, pool := integrationServer(t)
	owner := uuid.New()
	id := seedModelWithCapability(t, pool, owner, "owned-model", `{"chat": true}`)
	foreign := uuid.New()

	if rr := getUserModel(t, srv, foreign, id); rr.Code != http.StatusNotFound {
		t.Fatalf("foreign owner: expected 404, got %d (%s)", rr.Code, rr.Body.String())
	}
	if rr := getUserModel(t, srv, owner, uuid.New()); rr.Code != http.StatusNotFound {
		t.Fatalf("missing model: expected 404, got %d (%s)", rr.Code, rr.Body.String())
	}
}
