# LoreWeave Project Description

## Overview

LoreWeave is a self-hosted, multilingual AI-assisted platform for novel writing, translation, lore management, knowledge extraction, and shared-world roleplay. It is an established polyglot microservices monorepo with contract-governed service boundaries and multiple web clients.

## Core Capabilities

- Lore-grounded writing, editing, translation, and AI assistance.
- Authored glossary and wiki as canon source of truth, with a derived semantic knowledge layer.
- Model-agnostic BYOK inference routed through a centralized provider registry.
- Agent capabilities exposed through MCP and federated by the AI gateway.
- Living-world simulation, rules, projections, and real-time gameplay services.
- Multi-tenant persistence, collaboration, operational tooling, and observability.

## Technology Stack

- **Go:** domain, metadata, worker, operational, and authored-lore services; Chi is the common HTTP router.
- **Rust:** simulation/kernel-derived crates and world, travel, tilemap, roleplay, and commit services; Axum and Tokio are used at HTTP/runtime boundaries.
- **Python:** AI/LLM pipelines and workers; FastAPI and Pydantic are common service foundations.
- **TypeScript:** NestJS gateways and real-time transport; React/Vite clients and shared frontend packages.
- **Persistence:** PostgreSQL with database ownership per service; Neo4j for derived knowledge-graph data; Redis for cache and rate limiting; MinIO for objects.
- **Messaging:** RabbitMQ and transactional outbox patterns for asynchronous jobs and events.
- **Delivery and operations:** Docker Compose for local development, Kubernetes/Terraform infrastructure, Prometheus/Grafana/Loki/Tempo-style observability components.

## Established Architecture

- Independently deployable services are organized under `services/`; reusable language-specific components live in `crates/`, `pkg/`, `sdks/`, `clients/`, and `packages/`.
- Machine-readable cross-service contracts live under `contracts/` and are validated by repository gates.
- `api-gateway-bff` is the primary external HTTP entry point; `game-server` is the sanctioned real-time WebSocket edge.
- Each service owns its data. Cross-service behavior uses typed HTTP/MCP contracts or asynchronous events rather than shared-table access.
- `provider-registry-service` exclusively owns provider integrations and credentials.
- `glossary-service` owns authored lore; `knowledge-service` owns the derived semantic layer.
- The standards index at `docs/standards/README.md` is the authoritative navigation surface for cross-cutting invariants.

## Non-Functional Requirements

- **Security:** Preserve tenant boundaries, keep provider credentials centralized, scan external agent capabilities, track only the `.ai-factory/` baseline from `upstream/main`, and never commit local AI Factory working state that may contain sensitive context.
- **Reliability:** Use idempotency, transactional outboxes, explicit retries/timeouts, graceful degradation, and non-vacuous verification gates.
- **Observability:** Emit structured logs, propagate trace identifiers, expose metrics, and make effective configuration sources observable.
- **Compatibility:** Freeze and validate contracts before consumers; keep polyglot mirrors and SDKs synchronized.
- **Accessibility and localization:** User-facing web features target WCAG 2.2 AA and the repository's multilingual UI requirements.
- **Artifacts:** Persisted project artifacts, code comments, identifiers, logs, tests, commits, and PR text are written in English.

## Architecture

See `.ai-factory/ARCHITECTURE.md` for detailed architecture guidelines.

**Pattern:** Microservices
