# AGENTS.md

> Maintain this map when project structure or authoritative context changes. Keep it factual, concise, and free of credentials or sensitive working context.

## Project Overview

LoreWeave is a polyglot microservices platform for multilingual novel workflows and shared-world simulation. Detailed local agent context lives in the Git-ignored `.ai-factory/DESCRIPTION.md`.

## Technology Stack

- **Languages:** Go, Rust, Python, and TypeScript
- **Backend frameworks:** Chi, Axum/Tokio, FastAPI/Pydantic, and NestJS
- **Frontend:** React, Vite, and shared TypeScript packages
- **Data and messaging:** PostgreSQL, Neo4j, Redis, MinIO, and RabbitMQ
- **Operations:** Docker Compose, Kubernetes, Terraform, Prometheus, Grafana, and related observability tooling

## Project Structure

```text
services/          # Independently deployable backend and worker services
contracts/         # OpenAPI, event, schema, registry, and invariant sources of truth
crates/            # Shared Rust libraries and simulation/domain kernels
pkg/               # Shared Go packages
sdks/              # Reusable language SDKs
clients/           # Typed service clients
packages/          # Shared TypeScript packages
frontend/          # Novel-workflow React application
frontend-game/     # Living-world game client
cms-frontend/      # Administrative web client
infra/             # Local and production infrastructure configuration
migrations/        # Repository-level migration assets
scripts/            # Validation, generation, and operational tooling
docs/               # Architecture, standards, plans, specifications, and handoffs
runbooks/           # Operational response procedures
.ai-factory/        # Local AI working context; Git-ignored because it may be sensitive
```

## Key Entry Points

| File | Purpose |
|---|---|
| `README.md` | Product overview and local startup guidance |
| `CONTRIBUTING.md` | Contribution, verification, and safe-context guidance |
| `CLAUDE.md` | Always-loaded repository development rules and invariants |
| `contracts/language-rule.yaml` | Authoritative service-to-language ownership map |
| `docs/standards/README.md` | Index of cross-cutting standards and enforcement mechanisms |
| `docs/ARCHITECTURE.md` | Authoritative deployed-service architecture overview |
| `docs/DATA_ARCHITECTURE.md` | Data ownership, persistence, and integration boundaries |
| `docs/FEATURE_INDEX.md` | Frontend feature-to-route-to-service map |
| `docs/sessions/SESSION_HANDOFF.md` | Current session status and next-work handoff |
| `infra/docker-compose.yml` | Default local platform composition |
| `Cargo.toml` | Root Rust workspace |
| `package.json` | Root pnpm workspace commands for the game subtree |

## Documentation

| Document | Path | Description |
|---|---|---|
| README | `README.md` | Product capabilities and quick start |
| Contributing | `CONTRIBUTING.md` | Contribution and safe-context rules |
| Architecture | `docs/ARCHITECTURE.md` | Service architecture and ownership |
| Data Architecture | `docs/DATA_ARCHITECTURE.md` | Data stores, SSOT boundaries, and flows |
| Standards Index | `docs/standards/README.md` | Authoritative cross-cutting rule index |
| Session Handoff | `docs/sessions/SESSION_HANDOFF.md` | Current repository state and continuation point |

## AI Context Files

| File | Purpose |
|---|---|
| `AGENTS.md` | Safe structural map for agents and contributors |
| `.ai-factory/DESCRIPTION.md` | Local detailed project description |
| `.ai-factory/ARCHITECTURE.md` | Local AI Factory architecture guidance |
| `.ai-factory/RULES.md` | Local hard project axioms |
| `.ai-factory/rules/base.md` | Local detected implementation conventions |
| `CLAUDE.md` | Repository-wide development guide and locked rules |

## Agent Rules

- Read `docs/sessions/SESSION_HANDOFF.md`, then the relevant planning and standards documents before substantive work.
- Treat `docs/standards/README.md` as the index for cross-cutting rules; update the index when adding or retiring a standard.
- Keep persisted artifacts, code comments, identifiers, logs, tests, commit messages, and PR text in English.
- Keep machine-local agent state and `.ai-factory/` Git-ignored; safe, portable guidance belongs in tracked project documentation only when it contains no credentials, local endpoints, account data, database IDs, model IDs, or other developer-specific parameters.
- Always push this project to the primary branch `main`; do not push feature or secondary branches.
- Always use `git@github.com:alexeydott/lore-weave.git` as the SSH `origin`; do not replace it with an HTTPS remote.
- Never add a `Co-authored-by` trailer to commit messages.
- Decompose shell operations into separately reviewable commands.
  - Incorrect: `git checkout main && git pull`
  - Correct: first `git checkout main`, then `git pull origin main`.
- Preserve service ownership: external HTTP enters through `api-gateway-bff` except the sanctioned game WebSocket edge; provider calls go through `provider-registry-service`; agentic capabilities use MCP through `ai-gateway`.
- Do not access another service's database directly; communicate through owned contracts, clients, MCP tools, or events.
- Do not add or change a gate without real failure evidence as required by the Non-Vacuity standard.
