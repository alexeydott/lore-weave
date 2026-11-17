# Architecture: Microservices

## Overview

LoreWeave uses a contract-governed polyglot microservices architecture. Independently deployable services own bounded capabilities and their persistence, while reusable kernels, SDKs, clients, and machine-readable contracts provide controlled reuse without collapsing service boundaries.

This pattern matches the existing repository and operational model: numerous independently evolving domains, specialized language assignments, separate scaling characteristics for AI pipelines and real-time simulation, and strict ownership of sensitive provider credentials and authored user data.

## Decision Rationale

- **Project type:** Established multilingual AI writing platform and shared-world simulation system.
- **Technology stack:** Go, Rust, Python, TypeScript, React, PostgreSQL, Neo4j, Redis, RabbitMQ, and MinIO.
- **Key factor:** Domain and operational capabilities require hard ownership boundaries, independent deployment and scaling, and contract-tested polyglot interoperability.

## Repository Structure

```text
services/                    # Independently deployable services and workers
├── api-gateway-bff/         # Primary public HTTP edge (TypeScript/NestJS)
├── game-server/             # Sanctioned public real-time WS edge (TypeScript)
├── ai-gateway/              # Internal MCP federation and routing
├── provider-registry-service/ # Exclusive provider SDK/key owner (Go)
├── glossary-service/        # Authored lore/wiki SSOT (Go)
├── knowledge-service/       # Derived semantic/graph layer (Python)
└── ...                      # Other capability-owned services
contracts/                   # Cross-service machine contracts and registries
├── api/                     # OpenAPI contracts by service domain
├── events/                  # Event registry and generated mirrors
├── migrations/              # Owned schema artifacts
└── language-rule.yaml       # Service-to-language ownership
crates/                      # Shared Rust kernels and infrastructure libraries
pkg/                         # Shared Go packages
sdks/                        # Reusable public/internal SDKs
clients/                     # Typed service clients
packages/                    # Shared TypeScript packages and types
frontend*/                   # Separately built web clients
infra/                       # Compose, Kubernetes, Terraform, and observability
scripts/                     # Contract, invariant, and workflow gates
docs/standards/              # Cross-cutting architecture laws and index
```

Within a service, preserve its existing language/framework conventions rather than imposing one cross-language directory template. New services must follow `contracts/language-rule.yaml` and should adopt the nearest established service structure in the same language and role.

## Dependency Rules

- ✅ Services depend on versioned contracts, generated types, owned SDKs, and typed clients.
- ✅ Public HTTP traffic enters through `api-gateway-bff`; real-time game WebSocket traffic may enter through the explicitly sanctioned `game-server` edge.
- ✅ Agentic behavior is exposed as domain-owned MCP tools and invoked through `ai-gateway`.
- ✅ All model/provider capabilities resolve through `provider-registry-service`, including local and self-hosted providers.
- ✅ Cross-service state changes use typed RPC/MCP calls or registered asynchronous events with transactional outboxes.
- ✅ Each service owns its database/schema and exposes behavior rather than tables.
- ❌ A service must not query or mutate another service's database directly.
- ❌ A service must not import provider SDKs, store provider credentials, or call provider endpoints directly.
- ❌ Consumers must not reach through a gateway or service's internal implementation modules.
- ❌ Shared libraries must not become hidden cross-service orchestration or shared mutable domain state.

## Service Communication

- Use OpenAPI or other machine-readable contracts for synchronous HTTP boundaries and keep generated/handwritten clients aligned with the authoritative schema.
- Use MCP for LLM-directed agent tools; the domain service owns the tool and `ai-gateway` federates it.
- Use RabbitMQ and transactional outboxes for asynchronous jobs/events; consumers must be idempotent under redelivery.
- Propagate authenticated identity, tenant scope, trace identifiers, idempotency keys, and deadlines at every applicable boundary.
- Make failure modes explicit: timeout, retry policy, circuit breaker, fallback, ownership, and runbook must be discoverable from the dependency registry and standards.

## Data Ownership

- PostgreSQL databases are owned per service; cross-database foreign keys and direct cross-service queries are forbidden.
- `glossary-service` is the authored SSOT for lore and wiki content.
- `knowledge-service` owns derived fuzzy/semantic data and Neo4j projections anchored to authored glossary identifiers.
- Redis is ephemeral infrastructure for cache, coordination, and rate limiting, never the sole durable source of user truth.
- MinIO/object storage holds owned binary objects; metadata and lifecycle ownership remain with the responsible service.
- User-visible preferences and content are server-side, tenant-scoped, and observable by effective value/source where configuration resolution applies.

## Key Principles

1. **One capability, one owner:** every data concept and behavior has one authoritative service; other services integrate through contracts.
2. **Contract before consumer:** freeze and validate boundary schemas before wiring callers, clients, or UI flows.
3. **Polyglot by role:** Rust is kernel-derived, Go is domain/meta, Python is AI/LLM, and TypeScript is gateway/realtime, as enforced by the language registry.
4. **Provider isolation:** model backends, credentials, pricing, and model discovery have one home in `provider-registry-service`.
5. **MCP-first agents:** LLM-directed multi-step capabilities are tools, not bespoke raw-prompt HTTP endpoints.
6. **Failure is part of the contract:** retries, idempotency, degradation, observability, and recovery must be designed with the happy path.
7. **Non-vacuous enforcement:** a gate is complete only after a realistic mutation proves it can fail.

## Code Organization Note

- **New features:** Place behavior in the owning service and follow that service's established internal organization and language conventions.
- **Existing code:** Preserve the current structure; do not refactor unrelated services merely to make folder layouts uniform.
- **Interoperability:** Add or extend an authoritative contract and typed client/SDK instead of importing another service's implementation.
- **Shared code:** Extract reusable logic only when it has multiple real adopters; keep domain ownership explicit and avoid orphaned libraries.

## Code Examples

### Go: depend on an owned client interface

```go
type GlossaryReader interface {
	GetEntity(ctx context.Context, entityID uuid.UUID) (GlossaryEntity, error)
}

type Resolver struct {
	glossary GlossaryReader
}

func (r *Resolver) Resolve(ctx context.Context, entityID uuid.UUID) (Result, error) {
	entity, err := r.glossary.GetEntity(ctx, entityID)
	if err != nil {
		return Result{}, fmt.Errorf("read glossary entity: %w", err)
	}
	return buildResult(entity), nil
}
```

The caller depends on a typed boundary and can test behavior without connecting to another service's database.

### Rust: keep a pure domain port inside the owning crate

```rust
pub trait EventStore {
    fn append(&self, stream: StreamId, events: &[DomainEvent]) -> Result<(), StoreError>;
}

pub struct CommitUseCase<S> {
    store: S,
}

impl<S: EventStore> CommitUseCase<S> {
    pub fn execute(&self, command: Command) -> Result<(), CommitError> {
        let events = decide(command)?;
        self.store.append(events.stream_id(), &events)?;
        Ok(())
    }
}
```

Infrastructure implements the port; the decision logic does not import SQL, HTTP, or messaging adapters.

### TypeScript: route through a typed service client

```typescript
@Controller("v1/books")
export class BooksController {
  constructor(private readonly books: BookServiceClient) {}

  @Get(":bookId")
  getBook(@Param("bookId") bookId: string, @CurrentUser() user: UserContext) {
    return this.books.getBook({ bookId, userId: user.id });
  }
}
```

The gateway authenticates and delegates; it does not reproduce book-domain rules or read book tables.

## Anti-Patterns

- ❌ A shared database or cross-service SQL query used as an integration shortcut.
- ❌ Direct provider SDK/API usage outside `provider-registry-service`.
- ❌ Agentic logic exposed as a raw-prompt endpoint instead of a domain-owned MCP tool.
- ❌ Hand-copied wire types or event names that drift from `contracts/`.
- ❌ A new service created because a folder is large rather than because ownership, deployment, or scaling boundaries require it.
- ❌ A shared library that contains mutable business orchestration owned by no service.
- ❌ Retry without idempotency, event consumption without redelivery handling, or fallback without observability.
