package platformjwt

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Stream tokens (from upstream 6c8b23925, P1b dedup 2026-11-27): short-lived
// typ=stream JWTs for WS/SSE query strings and private media URLs, so
// long-lived access tokens stop leaking into proxy logs. auth-service mints
// them; book-service (and any other media/WS surface) verifies them.
//
// They live here — the SDK-tier shared module — because auth-service and
// book-service carried byte-identical inline jwt.ParseWithClaims blocks,
// which sdk-duplication-gate correctly flags: the HS256-only keyfunc re-assert
// and the typ=stream check are security logic, and security logic with two
// copies is one copy waiting to drift.

const StreamTokenType = "stream"

// StreamClaims is the claim set of a typ=stream ticket: subject = user id.
type StreamClaims struct {
	Type string `json:"typ"`
	jwt.RegisteredClaims
}

// SignStreamToken mints a typ=stream ticket for userID with the given TTL.
// HS256 only, mirroring Verify's strictness.
func SignStreamToken(secret []byte, userID uuid.UUID, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := StreamClaims{
		Type: StreamTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

// ParseStreamUserID verifies a stream ticket strictly: HS256 only (alg:none
// and RS/EC/PS rejected via WithValidMethods, re-asserted in the keyfunc),
// typ must be "stream", subject must parse as a UUID.
func ParseStreamUserID(secret []byte, tokenStr string) (uuid.UUID, error) {
	tok, err := jwt.ParseWithClaims(tokenStr, &StreamClaims{}, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return secret, nil
	})
	if err != nil {
		return uuid.Nil, err
	}
	claims, ok := tok.Claims.(*StreamClaims)
	if !ok || !tok.Valid || claims.Type != StreamTokenType {
		return uuid.Nil, fmt.Errorf("not a stream ticket")
	}
	return uuid.Parse(claims.Subject)
}

// ParseUserID accepts a short-lived stream ticket or falls back to a normal
// access token — the accept-or-fallback contract auth-service's WS/SSE auth
// had upstream. The access fallback is Verify's strict platform-JWT path.
func ParseUserID(secret []byte, tokenStr string) (uuid.UUID, error) {
	if id, err := ParseStreamUserID(secret, tokenStr); err == nil {
		return id, nil
	}
	claims, err := Verify(tokenStr, secret)
	if err != nil {
		return uuid.Nil, err
	}
	return uuid.Parse(claims.Subject)
}
