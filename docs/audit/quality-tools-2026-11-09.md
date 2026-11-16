# Quality tools audit — 2026-11-09

## Scope and assurance

Bounded repair of chapter conformance and review of all eight Studio Quality tools. No manuscript edits, full-book live analysis, provider/model configuration changes, database restart, commit, or push were performed for this task. Static tracing is not equivalent to independent authorization or live-provider certification.

## Findings repaired

- **Conformance identity mismatch:** MCP treated manuscript chapter UUIDs as outline-node IDs. Chapter validation now reads the chapter in the gated Work book and resolves scenes with `OutlineRepo.scenes_for_chapter`. Existing EDIT authorization and uniform inaccessible-resource errors remain intact (`services/composition-service/app/mcp/server.py`, `app/routers/actions.py`).
- **Missing chapter execution path:** the confirmed job now judges anchored saved manuscript scenes and returns the durable trace in `generation_job.result` (`app/engine/motif_conformance_run.py`). Missing bindings, inaccessible motifs, missing prose, and unavailable judgments have explicit per-scene statuses. No content is generated or automatically bound.
- **Result freshness:** REST overlays the last explicit chapter check only when planned inputs and source SHA256 match. Changed text or plan produces a stale status, not an apparently current verdict (`app/routers/conformance.py`). Snapshot metadata remains visible. This is not a proof of freshness for every mutable motif-definition field.
- **Frontend conformance lifecycle:** full model descriptors, chapter pagination, prerequisite/loading/error states, and scope-bound proposal/confirmation handling replace the blank/error-prone flow (`frontend/src/features/studio/panels/QualityConformancePanel.tsx`, `features/composition/motif/`). Strings cover English and all 17 other locales.
- **Promises:** preserves inherited platform-model descriptors; paginates chapters; counts rejected, empty and degraded batch calls as failures; ignores late assistant responses from another scope. Reports are ephemeral rather than persisted as user data in localStorage (`QualityPromisesPanel.tsx`).
- **Coverage:** Work/auth changes clear old reports, and stale/superseded responses cannot populate the new scope (`useBookPromiseCoverage.ts`). Failed LLM windows are reported through `coverage_unavailable`, `failed_windows`, and `total_windows`, preserving observed evidence without claiming completeness (`app/engine/quality_report.py`).

Backend paths abbreviated above are relative to `services/composition-service/`; panel paths are relative to `frontend/src/features/studio/panels/`.

## Eight-tool matrix

| Tool | UI → execution / result | Assurance in this task |
| --- | --- | --- |
| Promises | `QualityPromisesPanel.tsx` → assistant/detect/adopt in `app/routers/engine.py:465,605,632`; `_gate_work` at `:293`, called at `:485,616,651` | Focused lifecycle, batch-failure and model repairs tested; no live-provider acceptance. |
| Critic | `QualityCriticPanel.tsx:120–132,226` → `compositionApi.qualityReport` → `app/routers/plan.py:260` | Traced; existing lifecycle regression exercised. No independent end-to-end authorization certification. |
| Coverage | `useBookPromiseCoverage.ts` → `app/routers/plan.py:365–428` → window merge in `app/engine/quality_report.py` | Focused scope and failed-window regressions passed. Upstream draft omissions remain below. |
| Canon | `useQualityCanon.ts:83–98` combines composition rule violations/issues and knowledge flags; `app/routers/outline.py:556,573` | Traced only; knowledge-service authorization path not independently audited. |
| Canon rules | `QualityCanonRulesPanel.tsx` → rule-management surface → `app/routers/canon.py:114,134,152,186,203`; by-ID scope bootstrap `:101–110` | Traced only; no fresh CRUD/grant regression run. |
| Corrections | `features/composition/hooks/useCorrectionStats.ts:10–12` → statistics `app/routers/engine.py:2523`; capture `:2442` | Traced only; no fresh capture/statistics execution test. |
| Heal | `QualityHealPanel.tsx:69–78,95`, `usePolishProposals.ts:41–49` → proposals `app/routers/plan.py:188`; explicit draft patch | Traced only; no live write/conflict test, and no prose applied. |
| Conformance | `QualityConformancePanel.tsx` → MCP proposal → action confirmation → chapter worker → durable result → REST trace | Focused backend identity/access/worker/freshness tests; frontend and deployed UI verification recorded below when complete. |

Line references are audit-time navigation hints, not permanent symbol identities. The matrix deliberately distinguishes review coverage from execution coverage.

## Remaining debt and recommendations

1. **P1 — Coverage corpus completeness. Confirmed static defect.** `services/composition-service/app/routers/plan.py:386–401` skips `BookClientError` while reading chapter drafts (`:396–397`) and computes coverage over the remaining corpus. The repaired failed-window merge cannot detect an upstream omitted chapter. Return explicit failed chapter counts/IDs within authorized scope, propagate incompleteness through worker and UI, and add a draft-fetch failure regression. Do not certify a partial corpus as complete.
2. **P2 — Durable report lifecycle.** Promises reports no longer use localStorage, but server-owned report history and cross-device retrieval remain unbuilt. Design scoped input-pinned reports with provenance, completeness and expiry rather than introducing another browser-only store.
3. **P2 — Execution spine fragmentation.** Quality mixes immediate HTTP analyses, durable confirmed jobs, and agent-assisted proposals. Consolidate shared lifecycle contracts incrementally; do not introduce a universal framework without demonstrated common requirements. Promises assistant uses a structured raw-prompt pass at `engine.py:504–515`: classify whether it is an exempt fixed pipeline or agentic behavior requiring MCP migration before claiming a standards violation. Live successor parity was not established.
4. **P2 — Oversized controllers/MCP module.** Promises remains an oversized component/controller; conformance worker currently reuses a REST trace assembler and a private beat helper. Move pure domain assembly/beat lookup into shared engine modules in a separate tested refactor. Keep authorization at entry points, and avoid a broad mechanical rewrite during the incident fix.
5. **P2 — Freshness completeness.** Chapter source hashes and planned binding equality protect text/plan changes, but do not fingerprint all current motif-definition/profile changes. A future report contract should freeze all evaluation inputs and expose their version/fingerprint.
6. **Verification gap.** Pagination and assistant scope fixes have limited dedicated navigation regression coverage. Canon, rules, corrections and heal were traced, not independently live-tested. No full eight-tool security or paid-provider certification is claimed.

## Verification evidence

- Backend focused regression command: `.venv/bin/python -m pytest tests/unit/test_conformance_run_worker.py tests/unit/test_mcp_arc_structure.py tests/unit/test_prose_doc.py tests/unit/test_motif_conformance.py tests/unit/test_motif_conformance_producer.py tests/unit/test_quality_report.py -q` — **115 passed**, one existing Pydantic unresolved `lifespan` forward-reference warning.
- Source/plan freshness non-vacuity: temporarily replace the snapshot matching predicate with `if True`; **2 failed, 1 passed**, both failures asserting that old conformance must be `None` after prose/plan changes. Restored in `finally`; focused backend run above passed afterwards.
- Coverage stale-response non-vacuity: disabling the guard caused **1 failure**, `expected { tracked_count: 7 } to be null`; restored and rerun green.
- Failed-window non-vacuity: disabling the incompleteness marker caused **1 failure**, `KeyError: 'error'`; restored and rerun green.
- Promises batch non-vacuity: disabling failure handling caused **3 failures** for degraded, empty and rejected calls; restored and rerun green.
- Promises/coverage frontend slice: **17 tests passed** across `qualityLifecycle.test.tsx`, `QualityPromisesAssistant.test.tsx`, and `QualityPromisesPanel.test.tsx`.
- `npm run i18n:check` — **passed**, 36 namespaces × 17 locales aligned to English.
- `npm run build` — **passed**, including `tsc --noEmit` and Vite production build.
- Combined frontend regression: **51 files, 289 tests passed**. The first run had one stale assertion forbidding the now-required `modelSource`; updated it to assert forwarding `platform_model`, then reran green. Existing unrelated motif translation mocks emit React Query undefined-data warnings.
- Conformance hook non-vacuity: removing request/generation protection caused **1 failure / 6 passes**; disabling scope-generation tracking caused **5 failures / 2 passes** across chapter/project/auth/model/source changes. Both restored; **7/7 passed** afterwards.
- Final timestamp display contract uses REST `computed_at`; TypeScript and **14 focused view/hook tests passed** after this correction.
- Targeted Docker build and `up -d --no-deps` for composition-service, composition-worker and frontend completed successfully. The final frontend-only timestamp correction rebuild and restart also completed successfully (exit 0).
- Initial browser smoke opened Conformance; further interaction stopped when the shared page changed externally. Subsequent explicitly authorized live acceptance is recorded below.

## Authorized live rerun acceptance

- UI proposal succeeded on the existing selected chapter and configured model. The estimate displayed USD 0.50 (estimate only, not evidence of a charge).
- Live confirmation exposed missing `get_book_client` and `get_pool` imports in the chapter confirmation branch. Fixed and deployed only composition-service/worker. Added eight chapter-confirm cases: focused worker file **19 passed**; combined with MCP actions **52 passed**. Removing either required import independently caused the success-path regression to fail with the corresponding `NameError`; both restored.
- Confirmation then returned HTTP 200. Job `01a1c07b-998c-7f8b-815a-16af8e4692a8` completed for chapter `019fce7d-5eda-7e07-9c82-cc538cae5b95`, with status `no_bound_motif`, at `2026-11-09T13:24:48.477282+00:00`.
- After a full page reload and chapter reselection, the UI displayed that timestamp and the prerequisite to bind a motif. This verifies UI proposal → confirmation → worker → durable result → REST → refreshed UI for the prerequisite branch.
- Read-only checks in composition-service's own database found **25 active scenes, zero motif-bound scenes**, including no archived bound candidates. Therefore no chapter in this Work can exercise the paid motif judge without changing book planning data. No provider call was made by this rerun, and provider/billing success is **not certified**. No synthetic bindings or manuscript edits were created to force a paid test.
- Remaining acceptance prerequisite: an author-approved scene/motif binding with anchored saved prose (or an explicitly approved separate test fixture). Then execute at most one selected-chapter judge run on the configured provider and verify its durable verdict. No full-book run, provider/model changes, commit or push occurred.

## Scene inspector and contextual motif editor

- Motif candidates and committed binding reads now request the UI display language; binding responses expose localized role labels. Query identities include authorization and language. Translation fallback remains explicit rather than rewriting authored motif text.
- Scene links use readable titles or localized scene-number/chapter context instead of UUIDs. Loading, failed reads and unavailable targets are distinct. Outline/link queries no longer carry another scope's previous data and include authorization scope.
- Grounding availability now counts graph-backed semantic bios. Explicit cast glossary anchors are resolved to knowledge graph IDs through the registered project-scoped entity browse contract before detail retrieval. The client reads all pages and discards partial results on a later-page failure. The global-only browse route was not used.
- Grounding UI no longer equates failed/empty scene retrieval with graph absence. It distinguishes transport failure, an explicitly unlinked knowledge project and limited scene retrieval, with retry.
- A shared contextual motif dialog is available from Conformance and the inspector. It supports localized search/preview, role assignment, local draft state, explicit Save/Cancel, dirty-close confirmation, duplicate-submit protection, scoped completion guards and partial-save recovery. Separate existing writes are not presented as an atomic transaction. Open editor sessions retain their original scene context across selection changes; authentication changes clear the session.
- Backend combined verification: **152 passed**, with existing Starlette/httpx and Pydantic lifespan warnings. Frontend combined snapshot: **52 files / 313 tests passed**; post-controller-extraction focused run: **28 passed**. The final combined frontend run also passed all **313 tests**. TypeScript, i18n parity (36 namespaces × 17 non-English locales), production build and `git diff --check` passed.
- Mechanical non-vacuity: restoring UUID labels/scope carryover caused **6 failures**; restoring the original semantic availability flag caused **1 failure** (`assert False is True`); bypassing anchor resolution and truncating entity pagination each caused their regression to fail; removing duplicate-save protection caused **1 failure** (expected one write, received two). Each mutation was restored and its focused suite rerun green.
- All 18 locales contain translated editor, scene-link and grounding messages. No real-book binding/prose writes, provider calls, provider configuration changes, database restart, commit or push were performed during this follow-up. Live browser acceptance is not inferred from unit tests or production builds.
- Targeted Docker builds and `up -d --no-deps` completed successfully for composition-service, composition-worker and frontend. Composition-service was healthy and the worker running after deployment; no unrelated containers were restarted.
- Deployed browser acceptance confirmed Russian motif names, selected motif description, beat and role labels, readable entity choices, the explicit unsaved-change status after local selection, and the dirty-close confirmation after Cancel. Save was not clicked. The initial observed page already had the contextual dialog open over Conformance, so this pass does not independently certify the opening action.
- The discard click timed out; a fresh observation showed no dialogs and the page had switched to Plot Completeness outside this interaction. Browser work stopped to avoid interfering with concurrent activity. Final discard behavior, direct Conformance opening, scene-link rendering and grounding rendering remain live-acceptance gaps; their automated regressions passed. No visual-layout acceptance is claimed.
