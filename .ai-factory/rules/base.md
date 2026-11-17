# Project Base Rules

> Auto-detected conventions from codebase analysis. Edit as needed.

## Naming Conventions

- Files: follow the owning language and framework; Go uses lowercase snake-case sparingly and `_test.go`, Rust uses `snake_case.rs`, Python uses `snake_case.py`, and TypeScript/React follows the conventions already present in the owning package.
- Variables and functions: use `camelCase` in TypeScript, `snake_case` in Rust and Python, and idiomatic mixedCaps in Go.
- Types, classes, components, and exported symbols: use `PascalCase`; keep stable contract and invariant identifiers unchanged.
- Tests: place tests beside Go source as `*_test.go`, in Rust `tests/` or `#[cfg(test)]` modules, in Python as `test_*.py`, and in TypeScript using the package's existing test suffix.

## Module Structure

- `services/` owns independently deployable services; service-to-language assignments are authoritative in `contracts/language-rule.yaml`.
- `contracts/` owns cross-service wire formats, registries, schemas, and machine-readable invariants.
- Shared reusable code belongs in `crates/`, `pkg/`, `sdks/`, `clients/`, or `packages/`; do not copy shared logic across services.
- `frontend/`, `frontend-game/`, and `cms-frontend/` are separate clients with their own boundaries and build systems.
- `infra/`, `scripts/`, `runbooks/`, and `dashboards/` own deployment, enforcement, operations, and observability artifacts.

## Error Handling

- Return structured, typed errors at service boundaries and preserve canonical error classifications where defined.
- Handle failures explicitly; avoid silent fallbacks and silent no-op capability paths.
- Wrap external dependencies with configured timeouts, retries, circuit breakers, and observable fallback behavior.

## Control Flow

- Prefer flat, readable control flow over deeply nested conditionals. Use guard clauses, early `return`/`continue`, small named helper methods, or explicit classification logic when they make the code easier to follow. Handle edge cases and irrelevant branches early so the main path stays visible.

## Logging

- Use each service's structured logger (`slog`/structured Go logging, `tracing` in Rust, configured Python logging, or the NestJS logger) rather than ad hoc stdout calls.
- Include trace or request identifiers at boundaries and never log credentials, provider secrets, manuscript content, or other sensitive user data.

## Testing

- Follow the owning service's existing test framework and keep unit tests close to the code they prove.
- Add contract, integration, live, or browser tests when behavior crosses a process or UI boundary.
- Any new or changed enforcement gate must be proven non-vacuous by breaking the guarded subject, observing failure, restoring it, and recording the evidence.
