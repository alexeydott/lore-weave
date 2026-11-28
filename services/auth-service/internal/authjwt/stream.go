package authjwt

import (
	"time"

	"github.com/google/uuid"
	"github.com/loreweave/foundation/contracts/platformjwt"
)

// Stream tickets (from upstream 6c8b23925): short-lived typ=stream JWTs for
// WS/SSE query strings and private media URLs, so long-lived access tokens
// stop leaking into proxy logs.
//
// P1b dedup (2026-11-27): the sign/parse implementation moved to
// contracts/platformjwt (SDK-tier — book-service verifies the same tickets);
// this package keeps the auth-service-facing surface.

const StreamTokenType = platformjwt.StreamTokenType

type StreamClaims = platformjwt.StreamClaims

func SignStream(secret []byte, userID uuid.UUID, ttl time.Duration) (string, error) {
	return platformjwt.SignStreamToken(secret, userID, ttl)
}

// ParseUserID accepts a short-lived stream ticket or a normal access token.
func ParseUserID(secret []byte, tokenStr string) (uuid.UUID, error) {
	return platformjwt.ParseUserID(secret, tokenStr)
}
