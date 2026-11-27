package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/loreweave/auth-service/internal/config"
)

// The internal user-lookup routes previously rode on network isolation alone
// (upstream 6c8b23925 hardening). They must now fail closed without the
// platform service token.
func TestInternalRoutesRequireToken(t *testing.T) {
	cfg := &config.Config{
		JWTSecret:            "test-jwt-secret-at-least-32-characters-long",
		InternalServiceToken: "test-internal-token-for-routes",
	}
	s := NewServer(nil, cfg)
	handler := s.Router()

	paths := []string{
		"/internal/users/00000000-0000-0000-0000-000000000001/profile",
		"/internal/users/by-email?email=a%40b.co",
	}

	for _, path := range paths {
		t.Run("missing token "+path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d", rec.Code)
			}
		})

		t.Run("wrong token "+path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.Header.Set("X-Internal-Token", "wrong-token")
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d", rec.Code)
			}
		})

		t.Run("valid token passes middleware "+path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.Header.Set("X-Internal-Token", "test-internal-token-for-routes")
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			// Without DB pool the handler 500s — anything but 401 proves the
			// middleware admitted the request.
			if rec.Code == http.StatusUnauthorized {
				t.Fatalf("valid token should not return 401, got %d", rec.Code)
			}
		})
	}
}
