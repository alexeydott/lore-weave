# Implementation Plan: EPUB Import V2 — Structure-Preserving Book Import

Branch: main
Created: 2026-08-03
Status: implementing

## Original Request

> ознакомься с приложенным документом и запланируй реализацию предложенных там фич.

## Settings

- Testing: yes
- Logging: standard structured logs; never log source EPUB bytes, manuscript text, or credentials
- Docs: yes

## Roadmap Linkage

Milestone: "none"
Rationale: no local AI Factory roadmap artifact exists; this cross-service effort is governed by the user-supplied specification and the repository sources below.

## Governing Sources and Current State

- User-supplied **Full EPUB Import** specification, dated 2026-08-03 — primary requested scope.
- `docs/specs/2026-08-02-fb2-book-import.md` — current direct-source import, metadata/provenance, and safety precedent.
- `docs/specs/2026-05-23-p1-structural-decomposer.md` — legacy EPUB heading-based behaviour; its EPUB3-nav deferral is superseded for this effort.
- `docs/03_planning/100_FUTURE_FEATURE_STRUCTURED_IMPORT_EXPORT_MEDIA.md` — media must use MinIO references, never base64 inside chapter bodies.
- `docs/standards/scope-separation.md` and `docs/DATA_ARCHITECTURE.md` — Book Service owns import rows and book data; no cross-service database writes.
- `contracts/language-rule.yaml` — Book Service and worker-infra are Go; knowledge-service and composition-service are Python; BFF/frontend are TypeScript.

Current implementation facts to preserve or replace:

- `services/book-service/internal/api/import.go` persists a basic `import_jobs` row, uploads to MinIO, and emits `import.requested` through its transactional outbox.
- `services/worker-infra/internal/tasks/epub_structure.go` supports NCX and spine fallback only, slices anchors as strings, and has no EPUB fixtures.
- `services/worker-infra/internal/tasks/import_processor.go` concatenates EPUB chapter HTML under synthetic `<h1>` elements, calls `/internal/parse` once, writes generic imports without idempotency, and removes the successful source object.
- The current deterministic parser and scene materializer have no paid-model dependency. Keep that property for EPUB import.

## Delivery Boundaries

### Ownership and tenancy

| Concept | Owner and scope | Other consumers |
|---|---|---|
| EPUB source, inspection, job, item, asset, provenance, chapter mutations, metadata application, rollback journal | Book Service; source is per-user, each job is per-book and grant-gated | worker-infra through authenticated internal contracts; frontend through BFF |
| EPUB ZIP/OPF/navigation/range/sanitization logic | shared deterministic Go package owned with worker-infra implementation | Book Service inspector and worker-infra processor import the package |
| Scene-only parsing | knowledge-service; deterministic internal API | worker-infra calls it once per selected EPUB item |
| Outline hierarchy and scene materialization | composition-service; per-book resources | Book Service/worker invoke authenticated contracts; failures are report warnings |
| Object storage keys and reference lifecycle | Book Service metadata; MinIO stores bytes | worker-infra uses Book-issued/scoped import-object operations, not Book database access |

### Locked design decisions for the build

1. Navigation is authoritative: EPUB3 nav, then EPUB2 NCX, then OPF spine. Heading discovery is fallback-title/scene input only.
2. A selected leaf logical navigation node produces exactly one LoreWeave chapter. Parent nodes become hierarchy only unless the inspection explicitly marks them content-bearing and selected.
3. The source is uploaded before inspection, retained by default, fingerprinted with SHA-256, and reconciled if object upload succeeds while the database transaction fails.
4. New V2 worker writes use Book Service internal commands. Do not extend legacy direct writes to `loreweave_book`.
5. New source/item/asset rows are per-user/per-book; `replace_all` and rollback require explicit confirmation plus an audit record.
6. `EPUB_IMPORT_V2_MODE` and archive ceilings are deployment-wide safety configuration, not user settings. Target, selection, merge policy, and post-import actions remain per-request/per-job user choices.
7. Automatic post-import LLM/KG work is forbidden. Deterministic scene materialization is allowed; every paid action needs a separate user-confirmed job.

## Tasks

### Phase 0: Contract, persistence, and regression foundation

- [x] **Task 1 — Freeze the V2 contract and state model before consumer work.**
  - Create `docs/specs/2026-08-03-epub-import-v2.md` as a concise repository-owned decision record linked to the user specification; declare ownership, state transitions, retention, destructive-action confirmation, and the EPUB3→NCX→spine precedence.
  - Extend `contracts/api/books/v1/openapi.yaml` with inspect, start, status, items, resume, cancel, rollback, and report endpoints; add explicit request/response schemas, closed enums, typed warning/error codes, and `completed_with_warnings` state.
  - Define the internal Book Service command/result contract used by worker-infra for claim/checkpoint/stage/finalize/fail operations; version any `import.requested` event payload change under `contracts/events/` if one exists.
  - Files: `contracts/api/books/v1/openapi.yaml`, `contracts/events/**` as applicable, `docs/specs/2026-08-03-epub-import-v2.md`, generated/typed API mirrors.
  - Observability: document required `job_id`, `source_id`, `book_id`, `item_id`, `source_key`, `stage`, `duration_ms`, and `error_code` fields; never make manuscript content a log field.
  - Depends on: none.

- [x] **Task 2 — Add an executable legal EPUB corpus and regression harness.**
  - Add a minimal EPUB builder plus generated/redistributable fixtures for EPUB2 NCX, EPUB3 nav, nested ToC, spine fallback, same-XHTML anchors, multi-XHTML chapter, percent-encoded/Cyrillic paths, metadata/cover, images, links/footnotes, malformed manifest, encrypted archive, traversal, ZIP bomb, and large-navigation boundary cases.
  - Add golden inspection trees and normalized text digests. Write the pre-fix regressions for malformed anchor slicing and duplicate chapter splitting before changing the implementation.
  - Files: `services/worker-infra/internal/tasks/testdata/epub/**`, `services/worker-infra/internal/tasks/epub_*_test.go`, shared fixture helper package, optional local-smoke env documentation.
  - Observability: fixtures assert warning/error codes, never fixture body text in production logs.
  - Depends on: Task 1 warning/error vocabulary.

- [x] **Task 3 — Persist source, item, asset, staging, and rollback provenance in Book Service.**
  - Add migrations and Go models/repositories for `import_sources`, `import_job_items`, `import_assets`, staged chapter payload/effects, and a job-owned metadata/cover change journal. Extend `import_jobs` with source/target/options/progress/cancel/finalize/rollback/report fields.
  - Keep schema changes additive and document a verified compensating migration or cleanup path for every persisted import artifact.
  - Enforce source uniqueness by `(owner_user_id, sha256)`, item uniqueness by `(job_id, source_key)`, asset uniqueness by `(source_id, source_path)`, and an idempotent chapter provenance boundary `(book_id, source_sha256, source_key)`.
  - Model source retention and object-reference counts so rollback only removes unreferenced job-owned assets and never removes retained source EPUB by default. Guard rollback if a user edited an imported chapter after finalization.
  - Files: `services/book-service/internal/migrate/migrate.go`, new `services/book-service/internal/import/**`, Book Service models/tests.
  - Observability: INFO for durable state transitions and counts; WARN for conflict-preserved user changes; audit every replace/rollback confirmation and result.
  - Depends on: Task 1.

### Phase 1: Deterministic EPUB inspection and structure fidelity

- [x] **Task 4 — Extract a bounded shared EPUB inspector and archive validator.**
  - Move deterministic EPUB parsing out of `worker-infra/internal/tasks/epub_structure.go` into a reusable Go package (for example `pkg/epubimport`). It must validate ZIP signature/mimetype/container/OPF/encryption, canonicalize archive paths, reject traversal/collisions, and enforce compressed/uncompressed/entry/ratio/content/navigation/asset limits while streaming.
  - Parse OPF version, manifest properties, spine and `linear`, package metadata, rendition properties, and cover candidates. Make each limit an environment-backed deploy-time ceiling with a documented safe default.
  - Files: new `pkg/epubimport/**`, `services/worker-infra/internal/tasks/epub_structure.go` compatibility adapter or removal, `services/book-service/internal/api/import*.go`, Compose/config documentation.
  - Observability: INFO inspection summary (counts and format only); WARN per recoverable diagnostic; ERROR with a typed rejection code. Do not log filenames beyond the job-scoped source key if privacy policy requires redaction.
  - Depends on: Tasks 1–3.

- [x] **Task 5 — Implement navigation-normalized logical chapters and DOM range extraction.**
  - Implement EPUB3 `<nav epub:type="toc">`, EPUB2 NCX, and spine fallback in priority order. Preserve parent source key, depth, role, ordinal, title, href/fragment, landmarks/page-list separation, `linear`, and source ranges.
  - Replace regex/byte-offset slicing with DOM-based element-range extraction. Correctly resolve `id`/`name`, decoded fragments, same-document successor boundaries, nested/overlapping navigation, no-fragment links, missing anchors, and one logical chapter spanning adjacent spine documents.
  - Emit validation data proving no selected sibling range loses or duplicates normalized text; surface ambiguous topology as preview warnings rather than silently guessing.
  - Files: `pkg/epubimport/navigation.go`, `pkg/epubimport/ranges.go`, `pkg/epubimport/opf.go`, `services/worker-infra/internal/tasks/epub_*_test.go`.
  - Observability: DEBUG range diagnostics keyed by `source_key`; WARN for missing/overlapping anchors and fallback titles; no document fragments in logs.
  - Depends on: Task 4.

- [x] **Task 6 — Provide inspect and preview APIs plus source-safe upload handling.**
  - Implement `POST /v1/epub-imports/inspect` in Book Service: upload/retain the source, calculate its digest, invoke the shared inspector, persist inspection/metadata/cover candidates, and return a preview tree without creating chapters.
  - Implement source reuse detection per owner and selected target book; ensure failures clean up or enqueue reconciliation for unreferenced objects. Gate existing-book inspection and later start with the same edit/view grants used by imports.
  - Wire the BFF route deliberately (the current `/v1/books/**` proxy does not cover `/v1/epub-imports/**`) and add proxy contract tests.
  - Files: `services/book-service/internal/api/epub_import*.go`, `services/book-service/internal/import/**`, `services/api-gateway-bff/src/gateway-setup.ts`, `services/api-gateway-bff/test/proxy-routing.spec.ts`, `contracts/api/books/v1/openapi.yaml`.
  - Observability: INFO source inspection outcome and duplicate reuse; ERROR typed upload/inspection failure; trace IDs propagate to internal work.
  - Depends on: Tasks 3–5.

### Phase 2: Chapter-safe processing, assets, and finalization

- [x] **Task 7 — Add a chapter-boundary-preserving knowledge parser mode.**
  - Add a typed internal parse request (`/internal/parse/chapter` or compatible versioned option) that accepts sanitized HTML, externally supplied title/source key, and `preserve_chapter_boundary=true`, `extract_scenes_only=true`.
  - Guarantee exactly one chapter result; `<h1>`/`<h2>` cannot create chapters in this mode, while supported scene markers (`<h3>`, `<hr>`, existing deterministic rules) may create scenes. Return fidelity diagnostics and source-safe scene identifiers.
  - Files: `sdks/python/loreweave_parse/_types.py`, `sdks/python/loreweave_parse/html_walker.py`, `services/knowledge-service/app/routers/internal_parse.py`, parser SDK and router tests, worker parse client types/tests.
  - Observability: DEBUG parser mode/counts and WARN fidelity anomalies; no request HTML in logs.
  - Depends on: Tasks 1–2.

- [x] **Task 8 — Build sanitize, asset resolution, and link-rewrite primitives.**
  - Create one EPUB sanitization profile: remove scripts, handlers, forms, unsafe/external URLs and unsupported embeds; retain safe text/formatting/list/table/link/image/footnote content. Normalize XHTML/HTML namespaces before TipTap conversion.
  - Resolve `img`, `srcset`, supported SVG/object/data-URI resources against the content-document path; verify signature/MIME/size; hash/deduplicate; upload under Book-owned keys; persist asset provenance; rewrite the resulting TipTap/HTML URL.
  - Record internal href/fragment intents during item processing, then rewrite them from the finalized `source_key → chapter_id/anchor` map. Warn, do not fail, on excluded/missing targets and non-critical assets.
  - Files: new `pkg/epubimport/sanitize.go`, `pkg/epubimport/assets.go`, `pkg/epubimport/links.go`, `services/worker-infra/internal/tasks/image_extractor.go` replacement/adapters, Book asset endpoints/repositories, tests.
  - Observability: INFO asset counters, WARN typed asset/link failures, ERROR only on mandatory item failure; never log raw assets or data URIs.
  - Depends on: Tasks 3–5 and 7.

- [x] **Task 9 — Replace the generic EPUB worker path with item-level staged processing.**
  - Remove the synthetic combined HTML path for V2. The worker claims one pending item at a time, retrieves its source ranges, resolves assets, sanitizes, calls the chapter parser once, and records staged output through the Book Service internal contract.
  - Check cancellation between items; make MinIO and Book commands retry-safe; do not ACK a Redis event until its durable state is known. Add consumer-group pending-message reclaim and a resume dispatch path so worker restart/redelivery cannot strand jobs or duplicate items.
  - Keep the legacy importer isolated behind the rollout mode; do not alter FB2/PDF behavior incidentally. Explicitly repair or retire the obsolete PDF `parts`/`chapters.part_id` writes because C4 removed that schema.
  - Files: `services/worker-infra/internal/tasks/import_processor.go`, new `import_processor_epub_v2.go`, `outbox_relay.go`/stream consumer code, Book internal client, `import_processor_pdf.go`, worker tests.
  - Observability: structured item start/complete/fail/skip/cancel events with stable IDs, durations and typed errors; aggregate job progress after each durable item.
  - Depends on: Tasks 3–8.

- [x] **Task 10 — Implement idempotent finalize, resume, cancel, and rollback.**
  - Implement allowed state transitions and owner/grant checks for resume/cancel/rollback. Finalize atomically activates staged chapters in source order, applies selected metadata/cover policy, persists the link map/report, and produces `completed` or `completed_with_warnings`.
  - Implement strategies `append`, `replace_all`, and `merge_by_source_key`; require an explicit destructive confirmation/audit record for `replace_all`. Existing-book metadata must default to preserve, matching the FB2 rule.
  - Roll back only job-owned effects, skip user-modified chapters into a conflict result, de-reference eligible assets, and leave the source object retained. All commands must be safe to repeat after timeout/redelivery.
  - Files: `services/book-service/internal/api/epub_import_jobs.go`, `services/book-service/internal/import/finalize.go`, `rollback.go`, migration/repository tests, OpenAPI schemas.
  - Observability: INFO terminal state/report counts; WARN `rollback_conflict_user_modified`; audit actor/action/job/effect counts; ERROR only when finalization cannot reach a safe terminal state.
  - Depends on: Tasks 3, 8–9.

### Phase 3: Composition, frontend, and operations

- [x] **Task 11 — Materialize selected EPUB hierarchy and scenes through Composition Service.**
  - Translate the normalized navigation tree into Composition outline parts/sections using stable source keys, then write only the returned `structure_node_id` through Book Service. Reuse deterministic scene decompilation/materialization with idempotent source mappings.
  - Run this after valid Book finalization as best effort: unavailable Composition Service produces an actionable report warning and retryable materialization state, never rolls back the imported book.
  - Files: `services/composition-service/app/routers/outline.py`, `services/composition-service/app/engine/scene_decompile.py`, new/extended import materialization endpoint/client, Book integration tests.
  - Observability: INFO hierarchy/scene mapping counts, WARN best-effort failures with retry state, trace propagation across the boundary.
  - Depends on: Tasks 3, 5, 10.
  - Implementation checkpoint (2026-08-03): scene materialization now uses `POST /internal/epub-import-jobs/{job_id}/scene-mappings` as the Book-owned mapping write boundary. Worker forwards Composition's `{chapter_id, sort_order, outline_node_id}` response only after Book finalize; Book scopes every mapping to the job's immutable chapter provenance, fills only NULL `scenes.source_scene_id`, and emits `chapter.scenes_linked` in the same transaction.
  - Implementation checkpoint (2026-08-03): Composition now owns a lossless `epub_import_hierarchy_node` tree, keyed by `(book_id, import_job_id, source_key)`. `POST /internal/composition/books/{book_id}/epub-import-hierarchy` accepts the finalized selected ToC closure and returns stable opaque hierarchy/nearest-part mappings. Worker reads Book's job-scoped hierarchy view, calls Composition, then forwards mappings to `POST /internal/epub-import-jobs/{job_id}/hierarchy-mappings`; Book alone updates `chapters.structure_node_id` for chapters whose immutable provenance belongs to that job. The full tree remains separate from the existing flat manuscript-part projection, avoiding data loss for arbitrary EPUB depths. Rollback's user-edit test excludes this system mapping write.
  - Verification checkpoint (2026-08-04): a BFF-authenticated live E2E used a nested EPUB (`Part One` with two selected chapters) and a pre-created canonical Work. It proved the persisted three-node Composition closure, Book's returned part mapping applied to both imported chapters, two scene outline nodes, and two non-null Book `source_scene_id` backlinks. The run exposed a parser-local zero-based ordinal reaching Composition's one-based contract; worker normalization now converts it at the boundary, with a regression test. A local Composition outage was also exercised: worker logs recorded both scene and hierarchy connection failures while Book finalization retained the chapters and recorded the retryable `composition_materialization_pending` warning; Composition was restored healthy afterward.

- [x] **Task 12 — Ship the EPUB import wizard and live job/report UX.**
  - Generalize the PDF wizard shell into an EPUB flow: source upload/inspection, new-vs-existing target, metadata conflict choices, cover preview, selectable nested chapter tree, titles/roles, import options, explicit destructive confirmation, progress, cancel/resume/rollback, and persisted report.
  - Keep TXT batch import and PDF page/caption-specific controls separate. Remove client-side fixed failure timeouts; derive progress and terminal actions from server state and realtime job events. Make post-import AI actions separate opt-in actions with model/cost confirmation.
  - Add all locale strings and ensure stateful wizard components preserve state across steps.
  - Files: new `frontend/src/features/epub-import/**` or a format-neutral import wizard, `frontend/src/features/books/api.ts`, `frontend/src/components/import/ImportDialog.tsx`, `frontend/src/features/pdf-import/**` shared shell, locale files, component/hook tests.
  - Observability: client telemetry only with IDs/status/counts; display backend warning codes without rendering untrusted source HTML.
  - Depends on: Tasks 1, 6, 10–11.
  - Implementation checkpoint (2026-08-03): `frontend/src/features/epub-import/EpubImportWizard.tsx` now provides inspect-before-job upload, source metadata/target selection, nested selectable ToC with title overrides, strategy/cover options, durable progress polling without a fixed timeout, and cancel/resume/rollback/report actions. It is available from Chapters alongside the separate TXT/legacy and PDF import flows. Remaining work: locale expansion, component tests, post-import opt-in AI actions, and full browser/E2E coverage.
  - Verification checkpoint (2026-08-04): the wizard now exposes localized en/ru metadata-conflict policies, source-cover candidate preview, explicit import options, replace-all acknowledgement, stable browser selectors, and local restoration of the durable job/report ID. It never starts a provider action; extraction and other AI actions remain separate user-confirmed workflows. Component regressions cover policy/options submission, restored reports, and resume/rollback controls; a Chrome Playwright smoke covers nested ToC selection through a completed-with-warnings report. New-book EPUB imports also automatically adopt Glossary's current system ontology idempotently after finalization; source subjects are offered only as matching system genre codes.

- [x] **Task 13 — Add security, performance, and observability verification.**
  - Expose the requested import counters/histograms, structured logs, and trace spans; add dashboard/query documentation and bounded worker-concurrency configuration.
  - Run streaming/memory and timing benchmarks for 50-chapter/10 MiB and 500-chapter/100 MiB reference EPUBs. Exercise ZIP bomb, traversal, malformed/encrypted input, MIME spoofing, missing assets, MinIO transient failure, parser failure, Composition outage, worker restart, and Redis redelivery.
  - Assert that no default EPUB action calls a provider/model endpoint; add a negative integration test for this invariant. Apply the Non-Vacuity bite rule to every new gate or enforcement check.
  - Files: `services/worker-infra/**/epub*_test.go`, Book/knowledge/composition integration tests, `infra/prometheus/**`, dashboards/runbooks, CI scripts as needed.
  - Observability: validate metrics labels/cardinality and test logs for absence of source content.
  - Depends on: Tasks 4–12.

- [x] **Task 14 — Complete local acceptance evidence for the EPUB V2 refactor.**
  - Implement `EPUB_IMPORT_V2_MODE=off|shadow|opt_in|default|legacy_disabled`; in shadow mode persist inspection comparison only, never chapters. Add a deterministic legacy-vs-V2 comparison result that records structure/count differences without treating legacy headings as authority.
  - In `opt_in`, run and record the local acceptance matrix over a small fixed test corpus: structure and selection, import/report, failed-job Resume in generic Jobs, cancel/rollback/retry idempotency, assets/links/metadata, Composition degradation, security limits, and reload/localized UI behavior. Fix every discovered defect before completion.
  - The V2 refactor is complete when this matrix passes on isolated local infrastructure and its results are documented. It does not require production traffic, a production shadow cohort, `default`, `legacy_disabled`, or legacy-path deletion.
  - Update import docs, Book Service API documentation, frontend feature index, session handoff, and runbooks with actual local acceptance evidence rather than plan claims.
  - Files: `infra/docker-compose.yml`, service config loaders, `services/book-service/**`, `services/worker-infra/**`, `docs/specs/2026-08-03-epub-import-v2.md`, `docs/FEATURE_INDEX.md`, `docs/sessions/SESSION_HANDOFF.md`, relevant runbooks.
  - Evidence checkpoint (2026-08-04): all 20 EPUBs in the mounted Vasilyev-Andrey corpus completed authenticated local `shadow` inspection. Legacy projected 588 chapters and V2 570 (net -18); 13 files had no recorded difference, 5 count deltas, and 7 structural differences. The seven local differences are classified in the EPUB operations runbook as five NCX-authoritative logical-chapter differences and two count-preserving spine fallbacks. The disposable account retained zero books, and Book Service was restored to `opt_in`.
  - Verification checkpoint (2026-08-04): the shared parser, full Book API suite against `loreweave_book_test`, full worker suite, and Jobs Resume control suite passed. The EPUB wizard's four component regressions, TypeScript/Vite build, all-locale EPUB key parity, and Chrome smoke against a fresh Vite build passed. English and Russian have translated EPUB copy; the remaining locales carry the explicit English fallback. The global localization parity gate remains red only for pre-existing non-EPUB namespace gaps and is not an EPUB V2 blocker.
  - Observability: INFO rollout mode at startup; shadow comparison metrics; WARN on semantic divergence; no source text in comparison logs.
  - Depends on: Tasks 2–13.

### Deferred operational follow-up

When a production environment and real cohort become in scope, run a separate
deployment decision: production `shadow` evidence, a bounded `opt_in` cohort,
review before `default`, and only then a retained-source recovery plan and
stability window for `legacy_disabled`. This operational rollout is not an
acceptance condition for the early-stage EPUB V2 refactor.

## Acceptance Evidence by Release Gate

| Gate | Required evidence |
|---|---|
| Structure | EPUB2 NCX, EPUB3 nav, and spine-only fixtures prove selected logical-chapter count/order; nested tree retained; inner headings cannot create chapters; range text union equals selected source text without overlap. |
| Content and parser | The exact chapter parser call returns one chapter; scene-only splits work; sanitizer preserves approved semantic content and removes executable/unsafe content. |
| Source and metadata | Source SHA and retained MinIO object are durable; new-book metadata and cover projection work; existing books retain fields unless policy explicitly applies them. |
| Assets and links | Hash-deduplicated supported assets render through Book-owned URLs; unresolved resources and excluded link targets are report warnings; finalized internal links map to target chapters. |
| Reliability | Re-delivery, worker restart, resume, cancel, retry, and repeated finalize do not duplicate records; rollback affects only job-owned, unmodified effects. |
| Boundaries | No new worker-infra direct Book database write; all public endpoints appear in OpenAPI and BFF routing tests; Composition failure is best effort. |
| Security and performance | All archive-limit/path/DRM fixtures fail with typed codes; benchmark/memory targets are measured; no automatic paid AI calls occur. |
| UX | Preview selection and metadata choices survive reload; progress/report reflect backend state; destructive actions have explicit confirmation; report remains available after completion. |

## Commit Plan

- **Commit 1** (Tasks 1–3): `feat(import): add EPUB v2 contracts and provenance model`
- **Commit 2** (Tasks 4–6): `feat(import): inspect EPUB navigation and source previews`
- **Commit 3** (Tasks 7–10): `feat(import): process EPUB items with staging and recovery`
- **Commit 4** (Tasks 11–12): `feat(import): materialize EPUB hierarchy and wizard`
- **Commit 5** (Tasks 13–14): `feat(import): harden and roll out EPUB v2`

## Deferred by Design

- CSS fidelity, embedded fonts, audio/video, JavaScript execution, fixed-layout rendering, DRM bypass, and editable complex SVG remain explicitly unsupported. The report must surface them as typed warnings/errors; none may silently degrade into executable or externally fetched content.
- Post-import Knowledge Graph, extraction, summaries, wiki, translation, and model configuration are separate user-confirmed workflows, not a continuation of EPUB import.
