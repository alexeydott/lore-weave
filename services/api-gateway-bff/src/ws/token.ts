import * as jwtModule from 'jsonwebtoken';
// CRITICAL interop fix (2026-10-24): under node's ESM the namespace import of
// this CJS `export =` package has NO named members (the lexer cannot see
// through `module.exports = { decode: require('./decode'), ... }`), so
// `jwt.verify` would be undefined at runtime. The default binding IS
// module.exports in both node and jest — resolve to it explicitly.
const jwt = ((jwtModule as { default?: unknown }).default ?? jwtModule) as typeof import('jsonwebtoken');

/**
 * Shared WS/SSE stream-token resolution (from upstream 6c8b23925).
 *
 * The WS gateway and the SSE notifications endpoint used to accept ANY valid
 * access JWT in the `?token=` query string. Short-lived typ=stream tickets let
 * deployments retire long-lived access JWTs from URLs (proxy logs!) without
 * breaking the browser's EventSource/WebSocket, which cannot set headers.
 *
 * Keeps the P3 HS256 allow-list (alg-confusion / alg:none defense) both
 * verifiers already pinned.
 */
export function requireStreamTicketEnforced(): boolean {
  return process.env.BFF_REQUIRE_STREAM_TICKET === 'true';
}

export function resolveUserIdFromToken(token: string, jwtSecret: string): string {
  const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as {
    typ?: string;
    sub?: string;
  };
  if (!decoded.sub) {
    throw new Error('missing sub');
  }
  if (requireStreamTicketEnforced()) {
    // Strict mode (BFF_REQUIRE_STREAM_TICKET=true): only stream tickets.
    if (decoded.typ !== 'stream') {
      throw new Error('invalid token type');
    }
  } else if (decoded.typ && decoded.typ !== 'stream') {
    // Default mode: access JWTs still work (rolling upgrades), but a token
    // explicitly typed as something else is not a valid stream credential.
    throw new Error('invalid token type');
  }
  return decoded.sub;
}
