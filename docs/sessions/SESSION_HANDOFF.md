# ▶▶ NEXT SESSION STARTS HERE

## EPUB IMPORT V2 — STRUCTURE-PRESERVING FOUNDATION IMPLEMENTED (2026-08-03)

Spec: `docs/specs/2026-08-03-epub-import-v2.md`. The new pipeline is feature-flagged and keeps
the Book Service as the only owner of Book database writes. EPUB inspection persists the source
and its SHA-256; `pkg/epubimport` validates bounded archives, reads OPF/nav/NCX/spine structure,
and performs DOM-based chapter-range extraction. The worker claims and stages one logical EPUB
chapter at a time through Book Service internal endpoints; it does not write Book tables directly.

Book Service materializes staging payloads idempotently with immutable chapter provenance. It now
exposes inspect, start, status/items, resume, cancel, rollback, and report endpoints. Rollback
requires explicit confirmation, is safe to retry, removes only chapters owned by the job, and
retains a chapter that changed after finalization as a durable warning. Reports aggregate current
item, asset, and rollback state rather than relying on a stale finalization JSON snapshot.

The Knowledge parser has a preserve-boundary chapter mode: EPUB defines chapters, while parsing
only discovers scenes inside the supplied chapter. The existing import dialog shows durable queued
worker state without a fixed client timeout. Local Docker Compose raises PostgreSQL
`max_connections` to 300 for the multi-service development stack.

**Asset and link checkpoint (2026-08-03):** the shared EPUB package now resolves supported local
and data-URI images by DOM, validates their declared type against byte signatures, hashes them,
and rewrites source references only after worker-infra uploads to a deterministic Book-owned
object key. Book Service records the asset provenance idempotently and returns the public media
URL. Unsupported, external, missing, or invalid assets produce typed item warnings. Worker also
records normalized internal EPUB href/fragment intents. During Book-owned finalize, only the
matching TipTap link marks in newly materialized chapters are rewritten to reader routes after all
chapter IDs exist; external links are untouched and excluded/missing targets remain intact with a
warning. The asset endpoint additionally constrains object keys to the source SHA-256 namespace
and MIME-specific digest filename.

**Cover checkpoint (2026-08-03):** finalize now applies a validated EPUB cover to a newly created
book by default, or to an existing book only when `metadata_policy.cover=use_source`. It journals
the complete prior cover before mutation. Rollback restores the journaled cover unless its
`updated_at` proves a user changed it after import finalization; that case is retained as a
rollback conflict. Cover extraction rejects absent, undeclared, oversized, or MIME-spoofed bytes
as a non-critical import warning.

**Composition scene checkpoint (2026-08-03):** after a V2 job is finalized, worker-infra invokes
Composition's deterministic scene decompiler and forwards only its returned mappings to Book
Service's new internal job-scoped endpoint. Book Service verifies immutable import provenance,
fills only empty `scenes.source_scene_id` fields, and emits `chapter.scenes_linked` atomically.
Composition unavailability is logged as best-effort and does not roll back completed chapters.
**P0 reliability checkpoint (2026-08-03):** finalize now applies journaled title/description/language/
subject metadata policies, archives `replace_all` chapters with rollback conflict protection,
recomputes asset reference counts, and aggregates worker/item/asset/link/rollback warnings. Book
rollback restores job-owned chapter hierarchy assignments and calls Composition's idempotent
`DELETE /internal/composition/books/{book_id}/epub-import-hierarchy/{job_id}` cleanup seam. A
Composition materialization failure is persisted as a retryable job warning rather than remaining
only in worker logs. Full strategy/E2E and outage evidence is still required before Task 10/11 gates
can be marked complete.

**P0 verification checkpoint (2026-08-03):** DB-gated Book tests now cover `replace_all` archival,
effect idempotency, metadata merge/user-conflict rollback, durable worker warnings, and asset
reference convergence. Worker HTTP contract tests cover Composition outage warning persistence and
successful retry mapping. Book Service runs a configurable EPUB asset retention sweeper
(`EPUB_IMPORT_ASSET_RETENTION_HOURS`, default 168h) that deletes only old, unreferenced orphaned
objects and leaves failed MinIO deletes for retry. The DB suites require a throwaway
`BOOK_TEST_DATABASE_URL`; without it they skip safely.

**EPUB recovery E2E checkpoint (2026-08-04):** against the isolated
`loreweave_book_test` PostgreSQL database, an HTTP+DB scenario proves that cancelling an
already claimed item reaches `cancelled`, `resume` releases that in-flight item back to
`pending`, and a transient parser failure can be resumed and finalized. Repeating the
Book internal finalize command creates one chapter/provenance record. The worker contract
also replays the same V2 event: the replay makes no additional parser or staging call and
only repeats the idempotent finalize command. The DB run exposed and fixed cursors left
open across follow-up statements in finalize and strategy/metadata rollback paths. Task 10
is complete: a live BFF-authenticated import with an automatically registered disposable
user reached finalization, then two confirmed public rollback requests each returned the
same durable one-chapter rollback result. The persisted report showed `rolled_back`, zero
active imported chapters, and one rolled-back chapter. This live run also exposed a
`warnings_json = null` finalization failure; finalization now treats non-array warning JSON
as no warnings, and the DB E2E regression covers that representation.

**EPUB Composition materialization E2E checkpoint (2026-08-04):** a disposable
BFF-authenticated user created a canonical Composition Work and imported a nested EPUB
with one Part and two selected chapters. The live flow proved the three-node lossless
Composition hierarchy, Book's application of the returned part mapping to both chapters,
two Composition scene outline nodes, and two Book `source_scene_id` backlinks. The test
exposed a zero-based parser ordinal at the worker-to-Composition boundary; it is now
normalized to the one-based Composition contract and covered by a worker regression test.
A local Composition outage was exercised after Book job creation: the worker logged both
scene and hierarchy connection failures, Book finalization retained its chapters, and the
retryable `composition_materialization_pending` warning was recorded. Composition was then
restored and is healthy. Task 11 is complete.

**EPUB wizard checkpoint (2026-08-04):** Task 12 is complete. The EPUB wizard uses the same durable-job principle as the existing FB2/TXT flow while retaining EPUB-specific inspection, nested selection, hierarchy roles, title overrides, metadata policies, source-cover candidate preview, import options, explicit replace-all acknowledgement, and server-authoritative recovery/report actions. New UI text is available in English and Russian; the browser test uses locale-independent test IDs. A stored job ID restores server progress or the persisted report after reload. No EPUB import invokes a model: extraction and other AI actions are separate confirmed workflows. New-book EPUB finalization also triggers an idempotent internal Glossary bootstrap of current system genres, kinds, and attributes; source subjects can join only when they match system genre codes. Targeted wizard tests, frontend build, Chrome Playwright smoke, and worker Lore-redelivery regression passed.

**Rollout checkpoint (2026-08-03):** `EPUB_IMPORT_V2_MODE=shadow` now persists a source-scoped,
durable legacy document-order versus V2 navigation comparison without creating jobs or chapters.
The comparison is available through `GET /v1/epub-imports/{source_id}/shadow-comparison` and is
covered by API/unit contract tests. `opt_in`, `default`, and `legacy_disabled` continue to route
new EPUB jobs through the V2 worker. Promotion still requires live shadow corpus evidence and a
documented default-mode decision; shadow is not treated as proof of semantic equivalence.
Local Docker Compose now uses `EPUB_IMPORT_V2_MODE=opt_in` by default; production deployments
must set the mode explicitly during staged rollout.

**Live shadow evidence (2026-08-03):** rebuilt and started the local Book Service with
`EPUB_IMPORT_V2_MODE=shadow`; `/health` returned `ok`, `/metrics` exposed all EPUB counters and
histograms, and container inspection confirmed shadow mode plus asset retention. The Dockerfile
was corrected to include the `pkg/epubimport` replacement target. No authenticated upload was
generated in this check, so metric counters remain zero; authenticated corpus evidence is still
required before production promotion. Safe rollout order is `shadow` → small `opt_in` cohort →
reviewed `default` → `legacy_disabled`, with rollback to `shadow` at each gate.

**Authenticated corpus shadow evidence (2026-08-04):** every EPUB in the mounted
Vasilyev-Andrey corpus (20 files) was submitted to the local Book Service in `shadow` mode using
an authenticated disposable account. All inspections and source-scoped comparisons completed;
legacy projected 588 chapters and V2 projected 570 (net delta -18). Thirteen files had no
recorded differences, five had `logical_navigation_count_differs_from_document_projection`, and
two same-count files had `navigation_fallback_used`. The
disposable account still had zero books, proving the run created neither imports nor chapters.
Book Service has been restored to `EPUB_IMPORT_V2_MODE=opt_in` and its health check returned
`ok`. The seven local differences are classified in the EPUB runbook as five
NCX-authoritative logical-chapter differences and two count-preserving spine
fallbacks. Production-cohort differences still need the same source-scoped
classification before an `opt_in` cohort can be promoted to `default`; this
local corpus run is not production approval.

**EPUB reliability and observability checkpoint (2026-08-04):** Task 13 is
complete. The parser package passed its full suite, including malformed,
compression-bomb, traversal, DRM, MIME, missing-asset, and operational
self-closing-XHTML cases. Worker tests passed for transient MinIO recovery,
Redis redelivery without duplicate parsing/staging, Composition outage, and the
no-provider boundary. Book DB tests passed for cancel/resume/parser recovery,
idempotent finalization, and retrying an orphaned MinIO object deletion. The
live Book Service metrics endpoint exposed the documented bounded-label EPUB
counters and histograms. Parser-only `Inspect` benchmarks after the XHTML fix
measured 123 ms / 85.46 MiB/s for 50 chapters / 10 MiB and 1.25 s / 83.76 MiB/s
for 500 chapters / 100 MiB; see `docs/runbooks/epub-import-v2.md`.

**EPUB authenticated retry checkpoint (2026-08-04):** the previously failed
local job `2099d4aa-4ba8-496b-a420-13716c581b03` was resumed from an
authenticated browser session via the normal public endpoint. It completed
with 8/8 selected items active, 13 unselected items still skipped, 8 created
chapters, 8 provenance records, and no persisted report errors. The generic
Jobs page now renders Resume for failed or cancelled Book imports and forwards
it through an internal Book Service command that revalidates the durable owner.

**Worker recovery checkpoint (2026-08-03):** Redis Stream consumers now use a hostname-qualified
consumer ID and scan the group PENDING list with `XAUTOCLAIM` only after a 15-minute idle period.
This lets a restarted worker reclaim stranded import jobs without racing a healthy worker. Book
finalize treats `processing` items as unfinished, so a redelivered message cannot activate a
partial import while another worker owns its current item. The original message is acknowledged
only after durable finalize; retryable Book/MinIO/parser failures remain pending for reclaim.

**Verified:** `go test ./...` passes for Book Service, worker-infra, and `pkg/epubimport`; `pnpm build`
passes for the frontend; BFF dependencies were installed with `npm ci`, then `npm test` passed
(14 suites, 201 tests) and `npm run build` passed. Targeted Knowledge parser tests pass (12). Full Knowledge pytest currently reports
`4080 passed, 561 skipped, 9 failed`; failures are unrelated router/test-double compatibility in
`test_causal_edges`, `test_motif_*`, `test_tag_beats`, `test_thread_tag`, and
`test_internal_job_control`. The Book OpenAPI Spectral run is also blocked by pre-existing duplicate FB2 response keys in the
base contract; do not conflate those failures with EPUB V2.

**EPUB V2 local closure (2026-08-04):** Task 14 is complete for this
early-stage refactor. Shared parser, Book API throwaway-DB, worker, and Jobs
Resume suites passed; the wizard component regression, frontend build,
all-locale EPUB key parity, and Chrome smoke against fresh Vite also passed.
English and Russian are translated; other locales explicitly use the English
EPUB fallback. The global localization parity command remains red for
pre-existing non-EPUB namespace gaps.
Keep `EPUB_IMPORT_V2_MODE=opt_in`; production promotion is a separate future
operations decision. Do not reintroduce the legacy combined-HTML chapter path.

## 📚 FB2 BOOK IMPORT — SOURCE IMPLEMENTED, LIVE UI CHECK PENDING (2026-08-02)

Spec: `docs/specs/2026-08-02-fb2-book-import.md`. FB2 is a direct bounded parser in
`worker-infra`, beside EPUB structure preservation; it does not flatten source sections through
Pandoc. Existing-book import is `POST /v1/books/{book_id}/import` with `.fb2`. New-book import
is `POST /v1/books/import/fb2`: book + queued import job are created together, then the worker
creates chapters/scenes and applies source title, annotation, language, genres, and a valid cover.

The source metadata is retained per job in `book_import_metadata`. Crucial ownership rule:
existing-book mode records provenance but does **not** overwrite a user's title, description,
language, genres, or cover; only create-mode projects those fields. The FB2 2.2 schema family is
vendored at `contracts/schemas/fb2/2.2/` with checksums and original licence notices.

**Evidence so far:** worker parser tests cover hierarchy, metadata, inline images, malformed XML,
wrong namespace, DTD rejection, and binary limits; six supplied local FB2 samples parsed
successfully. Go package suites and frontend TypeScript compile are green; rebuilt `book-service`,
`worker-infra`, and frontend images start successfully, and the gateway returns 401 for the new
route without authentication. A live authenticated browser upload of a supplied FB2 completed with
20 chapters, source title, annotation, language, and genres. The source contains `cover.jpg`, but
the created book still shows no cover: treat cover persistence as an open defect. The FB2 dialog
also has no chapter-selection control, so importing only selected chapters requires follow-up work.
Do not copy supplied source books into Git.

## 🗳️ ENTITY KIND: FIRST-WRITER-WINS → A RESOLVED VOTE (2026-08-02)

Spec: `docs/specs/2026-08-02-entity-kind-resolution.md`. PO chose **all three** directions
(vote · sub-kinds · facets) plus re-kind-by-mode. **M1–M3 shipped; M4 is the remainder.**

**The estimator.** `entity_kind_votes(entity_id, kind_id, votes)` — one ledger, two jobs: the
argmax is the **primary** kind, everything else above a floor is a **facet**. That is why all
three directions fit one table; multi-label is the same rows read at a looser threshold.
`glossary_entities.kind_id` **stays a scalar** (≈470 Go sites, KG's `NOT NULL` mirror, Neo4j) —
it just stops being frozen. `domain.ResolveKind` is pure, so it is tested without a pool.

Rules, each with a test that reds when the mechanism is removed:
- **hysteresis** (`>1.5×`, `≥2` votes) — one stray observation must not re-kind; a near-tie
  must not flip (every flip re-emits to the KG).
- **refinement is exempt** — parent→descendant loses no information, so `terminology →
  technique` needs no majority. This is the only way a corrected ontology can correct the data
  the wrong one produced.
- **roll-up + strict-majority descent** — `{technique 7, power_system 7}` beats `character 8`
  as a branch, but an even split between siblings resolves to the **parent**. "If unsure, use
  the generic kind" is now a rule, not a hope.
- **a challenger that leads and loses is RECORDED** (`kind_conflict_id`) — the writeback said
  `updated` and never `conflict`, so a standing disagreement was invisible.

**Hierarchy** (`parent_kind_id` × 3 tiers): `terminology → {technique, power_system}`. This
**describes** what the model already did — terminology collected 崑崙之妙術, 土遁, 五行方位.

**Applied, on 封神演義:** 77 re-kinds + 77 outbox events (KG re-syncs through the existing
path), then **idempotent** (a re-run applies 0). 姜子牙 **species → character**, keeping
`species` as a *facet* — the second reading survives instead of being erased. 武王 → character.
八九變化 → **technique**, as a refinement. 西岐 → organization **+ location**. Book-wide:
character 272→302, species 227→202, organization 112→96, location 92→108. **399 entities carry
a facet, 33 carry a live conflict.**

**A re-kind is not always a MOVE — 17 of them are MERGES.** The dedup key is
`(book_id, kind_id, normalized_name, scope_label)`, so moving into a kind that already holds
that name is a unique violation. The first backfill aborted its whole transaction on one. Now
detected, skipped, recorded as a conflict, and reported as `blocked_by_duplicate` — the run's
output does not overstate what it did.

**Three of my own defects, found by using it:** the alias-folded `loadKindMap` inverted to
`generic` (an alias of `terminology`) and that value was going out to the KG as the entity's
kind · pgx cannot bind `[]uuid.UUID` into `uuid[]`, failing opaquely where the same statement
worked by hand · the import INCREMENTED, so four runs inflated 姜子牙's ledger 84 → 321 (ratios
survived, the numbers were fiction) — it now RESTATES absolutely.

**Verified** — glossary `internal/...` all green (`-count=1`) · translation **1117 passed** ·
`tsc` clean · ai-provider-gate + db-safety-gate OK · bite-tested hysteresis / refinement /
roll-up, each red when removed · live: backfill + a real extraction recording votes through the
**writeback** path (20 new ledger rows).

**M4 — the facets are now VISIBLE (API + FE).** `kind_labels` / `kind_conflict` ride the entity
list *and* detail as one query each (a JSON sub-select, not an N+1). The list shows the primary
badge solid, each secondary faded, and a standing disagreement as a **dashed outline with a
`?`** — a genuine "we are not sure" that reads as one. Proven by effect in a browser, not by a
green unit test: 陳塘關 renders `🏛 Organization` + `📍 Location?`, 姜子牙 renders
`👤 Character` + a faded `🧬 Species / Race`, and the 9 event rows beside them carry no badge
at all, so the overlay is signal rather than decoration.
- Decoding is deliberately **tolerant** — a malformed facet yields no badge rather than a 500.
  It is an advisory overlay on a kind the row already carries; a list that fails to load
  because a badge could not be built would be strictly worse than a missing badge.

**▶ NEXT, two decisions that are yours because both touch data:**
1. **The 17 blocked merges.** A re-kind into a kind that already holds that name is a MERGE of
   two entities, and merging is destructive. The pairs are recorded (`kind_conflict_id`) and
   listed by `--apply` under `blocked_by_duplicate`.
2. **`D-KG-KIND-FACETS`** — knowledge-service still mirrors ONE `kind_code TEXT NOT NULL`, so
   the graph cannot filter on a facet. **Deliberately deferred** (defer-gate #1, out of scope):
   it is a cross-service contract change, and you have a glossary↔KG entity-consistency
   refactor coming that will re-cut this seam. Trigger: that refactor.

**Follow-up fix — transaction and outbox truth are now aligned (2026-08-02).** A review found
two holes in the just-shipped path, both now covered by real PostgreSQL HTTP regressions:
- a duplicate target can block a re-kind (correct: it needs a destructive merge decision), but
  extraction previously returned the candidate kind and emitted it to KG anyway. It now reports
  and emits only a **persisted** move; a blocked re-kind retains the glossary kind, records its
  conflict, and emits no false `glossary.entity_updated` event.
- the backfill's default preview previously committed its vote ledger. It now resolves against a
  transaction and rolls it back; only `--apply` persists votes, re-kinds, and emits outbox rows.

**Verified fresh:** both new DB regressions red before the fix and green after; glossary
`internal/...` passed against isolated `loreweave_glossary_test`.

## 🧭 THE KIND WAS WRONG, AND SO WAS MY READING OF ITS ZERO (2026-08-02)

The PO challenged a claim rather than a line of code, and was right on both counts.

**1 · `power_system` was two concepts sharing a code.** Its name reads as a graded ladder —
練氣/築基/金丹, 大羅金仙 — the thing a model trained on this genre will look for. Its
description, written the day before, said the opposite in as many words: *"the name says
system but one art is enough."* Name and definition were arguing; the model followed the
name, so individual arts (崑崙之妙術) went to `terminology` instead. **A misfile can be a
missing-category error rather than a judgement error** (`BTG-A64`).
- **Split at the System tier**: new `technique` kind (migrations `0056`+`0057`), and
  `power_system` rewritten to mean the ladder — with an explicit licence to return **none**,
  so a story without one is not pressured into filling it. `type`/`user`/`effects` retired
  (soft, `deprecated_at`); `tiers`/`entry_requirement`/`capabilities` added.
- **Verified live end-to-end**: adopt copied `technique` into a book, and **G5 sync**
  surfaced 5 `update_available` rows for the redefinition and applied them.

**2 · I read `power_system = 0` as a defect twice, and never checked the corpus.** The
document argued first that it was a coverage gap, then that it was a typing failure, and
produced a plausible mechanism for each. The marker count that seemed to settle it counted
變化 · 陣 · 符 · 遁 — **arts, not tiers**. Re-scanned for the ladder itself, chapters 88–92
of 封神演義 contain **零** 境界 · 修為 · 品階 · 等級 · 階級 · 層次 · 果位 · 金仙 · 大羅 ·
天仙 · 太乙. There is no ladder in that book. **`power_system = 0` is the correct answer**
(`BTG-A63`: *a zero is only evidence once you have shown the thing could have been there*).

**3 · …and the split changed nothing, for a structural reason worth knowing** (`BTG-A65`).
Re-run on the corrected catalogue: still zero. The stage-1 sweep cited **95 mentions** and
one art-like string; 縱地行之術 · 陰符之術 never reached stage 2, which types only what
stage 1 cites. **Under `edc_cited` the ontology can change TYPING but never RECALL.** A user
who adds a kind and re-extracts will see the ontology change and the results not. The
batched shape does not have this property — part of what its 7.4× input is buying, and it
was not priced in when the cheap shapes were ranked.

**4 · The sweep is cached now** (the gap left open yesterday). It was the one call nothing
keyed: `prefer_cache` reported 100% of batches served and still spent 12,622 tokens. Keyed
on the rendered sweep prompt, not the extraction shape hash — the sweep is handed no kinds,
so busting it on a definition edit would re-spend for an answer that cannot change.
- **Measured**: `always_refresh` 25,971 in / 6 executed → `prefer_cache` **0 tokens, 6/6
  cached** → after the definition edit, `refresh_if_stale` **3 cached (the sweeps) / 3
  executed (the typing)**, automatically, with no flag.

**5 · Two of my own defects, found on the way.**
- **Replay was fully broken and nothing went red.** Folding strategy + descriptions into
  `profile_hash` left the consumer recomputing a bare `sha256(profile)`, so every replay
  answered `profile_drifted`. The test computed the same bare hash the consumer did — both
  mirroring a producer that had moved on. Fixed by decomposing the hash and storing the one
  component that cannot be recomputed (`defs_hash` on the row, because glossary's
  definitions drift); tests now call the production function.
- **`SeedGenreKindAttr` seeded NULL descriptions** — `var desc *string // DefaultKinds carry
  no per-attr description today`, stale since the field was added. Existing DBs were covered
  by the one-shot 0036 backfill, which hid it; a **fresh** database would have seeded 93
  nameless attributes while the Go struct held all 93 definitions. This also corrects
  yesterday's overstatement that *"every extraction prompt this platform has ever sent was a
  list of naked codes"* — the live path had attribute descriptions since 2026-06-22.

**Verified** — translation-service **1117 passed** · glossary `internal/...` all green ·
frontend `tsc` clean · ai-provider-gate + db-safety-gate OK · bite-tested ×3 (drop the
`batch_idx>=0` filter → sweep leaks into replay; force the legacy hash path → replay reds;
restore the old power_system wording → the ladder guard reds) · **live smoke** across
translation + glossary as above.

**6 · MEASURED under `batched` (ch90/92/94/96) — the model is right, the STORE overwrites it.**
`technique` alone on ch96 returned three real arts (五雷正法, 土遁, 妖風). Tracing each to its
stored row: 五雷正法 → **`power_system`** (first seen 08:20, under the definition this work
deleted) · 土遁 → **`terminology`** (14:15) · 遁龍樁 → **`item`** (07:56) · 八九變化 →
**`terminology`** (18:21, *the same run*, by an earlier batch) · 妖風 → `technique` ✓ — the
only name nobody had claimed before. **One in five, and the one that worked was new.**
- `findEntityCrossKind` is **oldest-wins** and returns the STORED kind by design, so the
  first run that ever names a thing decides its kind permanently and later runs are
  discarded silently (`updated`, never `conflict`). **`BTG-A66`: correcting an ontology
  cannot correct the data the wrong ontology produced** — and that data is now the authority.
- Within one run the batch order decides it: `terminology` is batch 1, `technique` batch 2.
  Not a model preference. A for-loop.

**▶ NEXT — the decision this leaves you (PO call, it mutates data):** fix `BTG-A49`. Options
are (a) let a later extraction re-kind when the stored kind's own definition has changed
since (the `defs_hash`/`source_hash` needed for that now exists), (b) record a kind CONFLICT
instead of silently updating, so it surfaces for review, or (c) a one-off re-kind pass for
the arts currently frozen under `power_system`/`terminology`/`item`. Until then, every
kind-accuracy number this project quotes measures **arrival order**, not the model.

**Also open:** the `event`/`terminology`/`power_system` batch **truncated on every chapter
tested** (`finish_reason=length` at 133, 148, 233 entities). 233 entities from one chapter is
degenerate output, and its results are missing from the cached rows entirely.

## 🔗 GLOSSARY↔KG LINKAGE — both holes closed + backfilled (2026-08-01)

Cleared before the entity-consistency refactor, because both defects corrupt the data that
refactor would build on.

**1 · 96% of one kind had no name.** The writeback resolved an entity's display attribute
with a hardcoded `attrDefMap[kindID+":name"]`; every read path and the DB trigger use
`code IN ('name','term')`. `terminology` is the only kind whose display attribute is
`term`, so the lookup missed — and `if ok { … }` turned that into a **silent skip**: no
`entity_attribute_values` row at all. One causal chain, three equal numbers: **215 of 224**
had no `term` row → no `cached_name` → no `normalized_name`. That last one is the **dedup
key** (`findEntityByNameOrAlias`/`findEntityCrossKind`), so every re-encounter created
ANOTHER nameless row. Evidence and translations were lost too — both hang off the name's
`attr_value_id`.
- **…212940 tokens truncated…the BFF `/v1/kal/*` (now live).
>
> **▶ REMAINING = the consumer/FE FANOUT (parallel worktree agents, the locked strategy):**
> X1 composition→KAL (+fix `_cast_roster` cursor drain) · X2 lore-enrichment→KAL · X3 wiki→KAL (kill direct-EAV) ·
> X4 chat→KAL · X5 translation→KAL (as-of inject + immutable-once cache) · X6 FE temporal surfaces (canonical card,
> time slider, change timeline, diff, retrieval) + migrate FE reads to KAL · X7 flip BOTH INV-KAL lints (table-read +
> the new HTTP-surface lint) to ENFORCING. Each binds ONLY to the frozen `kal.v1.yaml` → provably disjoint, parallel-safe.

> **▶ Shipped this run (production-ready, all verified on real DB / build / tests):**
> - **F1d (producer)** `d5662b64` — facts FLOW from extraction: translation worker passes `chapter_ordinal`,
>   glossary writeback ingests the episode + opens append-only facts per written attr, idempotent. (`TestBulkExtract_EmitsTemporalFacts`)
> - **F4-live core** `c13d11bb` — glossary `/internal/facts/*`: GET facts/timeline/attr-values (bounded, as-of) + POST
>   episode/append/retract; KAL paths aligned. (`TestFactsHTTP`: append supersedes, retract restitches over the router)
> - **F4-writes** `41070247` — internal merge/resolve-entity/split routes + KAL wiring (resolve-or-create idempotent).
> - **in-story dates** `a5d0d80e` (merged) — `event_date_iso` additive valid-time on KG facts/relations (19 tests; chapter-ordinal stays primary).
> - **prod bugfix** `94caea91` — world-timeline `NameError: q` (pre-existing crash) fixed.
>
> **▶ Remaining foundation (then fanout):**
> - **F2-app — fold handler:** dirty queue + canonical_snapshot write + lazy rebuild-on-read + ordinal-bucketed re-ground
>   (B1) + compare-and-clear + backoff. LLM via provider-registry (likely a worker/knowledge pass like #26/#7 summarize).
>   Makes `get_canonical` return the FOLDED canonical (today it serves canon-content). Adds the KAL `fold` route.
> - **F1g — bi-temporal names:** name as `fact_kind='name'` (single) + aliases as `'alias'` (multi); as-of-name; resolver
>   matches the across-time alias set. RECONCILE: migration 0048 converts the cold-start/F1d `attribute` name/aliases
>   facts → name/alias kind, and `refreshEAVProjection` + the D5 check must project name-kind facts to the name EAV.
> - then **fanout X1–X7** (parallel worktree agents per the locked strategy).


> **What this branch is:** implementing the Incremental Temporal Knowledge Architecture
> ([spec](../specs/2026-06-29-incremental-temporal-knowledge-architecture.md) §12/§12.7.8 govern;
> [plan](../plans/2026-06-30-temporal-knowledge-architecture-impl.md)). Append-only bi-temporal facts as the
> sole SSOT (INV-FACTS §12.0); everything else a rebuildable cache. Execution = **serial foundation → parallel
> fanout** (user-directed: build foundation serially, checkpoint, then fan out consumer migrations).
>
> **▶ Shipped this session — the SSOT substrate spine, all real-DB verified on `loreweave_glossary`:**
> - **F0** `fc4c9a80` — froze the **KAL v1 contract** (`contracts/api/knowledge-gateway/kal.v1.yaml`), the keystone
>   every consumer binds to; `knowledge-gateway: missing` row in `language-rule.yaml` (→ typescript at F4 scaffold).
> - **F1a** `ae6f17fd` — `0044` **entity_facts + episodes** bi-temporal SSOT schema (content-addressed natural key,
>   `valid_to_eff` INT64_MAX null-sink, `coverage_xid` xid8, merge_journal fact/episode-move cols). Idempotent 2×.
> - **F1b** `728efaf9` — `0045` **maintain_chain** the single `valid_to` writer (§12.3.3). Verified all 3 scenarios:
>   out-of-order backfill (A2), retract restitch (A3), oscillation (A4).
> - **F1c** `8a2b8e6d` — **fact core** Go (`facts.go`): appendFact (idempotent NK), retractFacts (restitch),
>   ingestEpisode, refreshEAVProjection (repair/cutover), per-(entity,attr) chain lock. `TestFactCore` PASSES (real DB).
> - **F1h** `8eb419f9` — `0046` **cold-start seed**: 22,056 facts seeded from live EAV; **projection==flat_eav 0 mismatches** (§12.5.4/D5).
> - **F2 schema** `fdf6c0d8` — `0047` **canonical versioned-cache** tables (canonical_snapshot + canonical_fold_state), §12.1.
>
> ⚠ Migrations **0044–0047 are applied to the running dev `loreweave_glossary`** (by F1c's `RunChain`); a fresh stack
> picks them up from the ledger on boot.
>
> **▶ PARALLEL track (background agent, worktree):** **F3 — KG ordinal valid-time unify** in `knowledge-service`
> (Python/Neo4j) — substrate-independent from glossary. Ordinal valid-time unified with `from_order`, ordinal-aware
> close (A2 on the KG side), extraction-driven invalidate/retract, quote-on-citation, per-entity ordinal snapshot.
> **Merge its worktree branch at the integration node before F4.**
>
> **▶ F3 — KG ordinal valid-time unify — MERGED `f2d5ca3e`** (was a parallel worktree agent); 24 F3 unit tests
> re-verified green post-merge. All under `services/knowledge-service/` (disjoint from glossary).
>
> **▶ F1f — fact-chain merge + split (DONE):** `ecc7e587` **merge** (§12.4.1, `mergeFactChains`/`revertFactChains`,
> journal `repointed_fact_ids`+`invalidated_fact_ids`, same-ordinal tiebreak, chain locks both sides) +
> `f52e50f7` **split** (§12.4.2, `splitFactsByEpisode` re-attribute-by-provenance, originals reason='split').
> `TestMergeFactChains`/`TestSplitFactsByEpisode` green; existing Merge/Revert/Dedup suites green (no regression).
>
> **▶ F4 — KAL gateway service + INV-KAL lint (DONE, structure):**
> - `2ab5f710` **KAL NestJS service** (`services/knowledge-gateway`) implementing `kal.v1.yaml`: config/main/health +
>   `KalReadController` (get_canonical/get_facts/timeline/list_attr_values/roster/search/neighborhood/retrieve, each with
>   per-substrate `temporal_capability`, KG `as_of` dropped when `temporal_unsupported`) + `KalWriteController`
>   (append/close/retract/merge/split/fold/ingest_episode/resolve_entity forwarding to glossary `/internal/facts/*`).
>   **Verified: npm install + nest build clean; boots + serves /health + /health/ready (kgTemporal=ordinal_valid_time),
>   16 routes mapped.** `language-rule.yaml` `missing`→`typescript`; lint PASS.
> - `434894d8` **INV-KAL table-read lint** (`scripts/knowledge-access-gate.py`, wired into `.githooks/pre-commit`): no
>   consumer reads the glossary EAV / Neo4j directly. Full-scan PASS.
>
> **▶ NEXT — F4-FOLLOW-ON + remaining foundation, then fanout:**
> 1. **F4-follow-on (live writes):** add the glossary **`/internal/facts/*` HTTP routes** (Go handlers wrapping the F1c/F1f
>    fact core — appendFact/retract/mergeFactChains/splitFactsByEpisode/fold) so the KAL write verbs hit a real target;
>    then a **cross-service live-smoke** (KAL → glossary fact route → DB) + verify the read endpoints' downstream path
>    mapping against the actual glossary/KG routes. (KAL reads/writes build + the service boots; full delegation is the
>    cross-service smoke, currently unverified end-to-end.)
> 2. **F2 app** — the fold handler: lazy rebuild-on-read + ordinal-bucketed re-ground (B1) + compare-and-clear + backoff
>    (needs a provider-registry LLM call). Enhances `get_canonical` behind the frozen contract.
> 3. **F1g** — bi-temporal name/aliases (§12.4.3) + as-of-name. **Value partly gated on F1d** (deferred writeback wiring);
>    reconciles `D-TK-F1G-NAME-RECONCILE`.
> 4. **CHECKPOINT** → then parallel **fanout** X1–X7 (consumer migrations onto the KAL, FE temporal surfaces).
>
> **▶ SCOPE (locked 2026-06-30): this branch is the PRODUCTION-READY refactor — NO deferrals.** Everything below is
> in-branch work to COMPLETE (the repo adopts the KAL immediately after merge, so nothing core may be stubbed/parked).
> Includes the full consumer + FE fanout (X1–X7) and both INV-KAL lints flipped to ENFORCING. The items that were
> "deferred" are now must-complete work:
> - **F1d — writeback Path-A emission (must complete):** wire fact emission into the glossary writeback; extend the
>   bulk-extract request with `chapter_ordinal` and update the translation-service extraction caller to pass it.
> - **F4-live — glossary `/internal/facts/*` HTTP routes** wrapping the Go fact core (append/close/retract/merge/split/
>   fold/ingest_episode/resolve_entity) so the KAL writes are real; cross-service KAL→glossary→DB live-smoke.
> - **F2-app — fold handler:** lazy rebuild-on-read + ordinal-bucketed re-ground (B1) + compare-and-clear + backoff (LLM via provider-registry).
> - **F1g — bi-temporal name/aliases** (§12.4.3) + as-of-name + RECONCILE the cold-start name/aliases representation
>   (supersede the cold-start `attribute` name/alias facts → `name`/`alias` kind facts; the old `D-TK-F1G-NAME-RECONCILE`).
> - **In-story dates (must build — user pulled into v1):** detected in-story time (`event_date_iso`) as an additional KG
>   valid-time source (spec §9 dec-3). Knowledge-service.
> - **Fanout X1–X7 (in-branch):** migrate composition, chat, lore-enrichment, translation, wiki, FE to read/write through
>   the KAL; kill every direct EAV/KG read; flip BOTH INV-KAL lints (table-read + HTTP-surface) to ENFORCING.
>
> **▶ /review-impl (2026-06-30) — 7 findings, ALL FIXED (no HIGH):** MED-1 same-ordinal single-valued conflict → last-write-wins supersede + deterministic projection tiebreak (`TestFactSameOrdinalConflict`); MED-2 unenforced chain-lock → strengthened contract doc + `TestFactChainLockSerializes` (same-chain blocks, disjoint free); LOW-2 cold-start ordinal `0→-1` (chapter_index is 0-based); LOW-5 targeted `ON CONFLICT` on the natural-key expression index; LOW-3 `refreshEAVProjection` attr_def_id-coupling doc; LOW-4 `reconcileEpisode` F1d-obligation doc + now exercised; LOW-1 → `D-TK-F1G-NAME-RECONCILE` above. All 3 facts tests green on real DB; cold-start re-verified `projection==flat_eav` 0 mismatches with the `-1` sentinel.

---

# ▶▶ (prior) **Motif book-collaboration tier (model B) + shared-graph links + MCP edit SHIPPED** · branch `feat/narrative-pattern-library` · HEAD `8c4c45c2`+ · 2026-06-29

> **▶ MERGE 2026-06-29:** `origin/main` merged into this branch (179 commits — the **public-MCP gateway + lazy tool-loading** track, critical-UX fixes, glossary/knowledge/campaign work). Conflicts resolved (composition `actions.py` confirm = JWT-identity ∪ public-MCP spend-attribution; engine `plan.py`/`stitch.py` signatures = both; studio panels = `canonview` ∪ `motifs`/`conformance`; gateway test `mcpPublicGatewayUrl`). The motif MCP tools are exposed to the public-MCP gateway: `find_tools` (lazy discovery) picks them up dynamically from the federation catalog, and they are classified in the edge `TOOL_POLICY` allowlist (commit `2aa65765`). Below is this branch's motif work; the merged-in main tracks + all prior history are archived (see the pointer at the bottom).

> **▶ Follow-up this session (2nd commit) — both model-B deferrals CLOSED:** `D-MOTIF-LINK-SHARED-TIER` (shared-graph link editing — guard rewrite + repo/MCP book_id paths) and `D-MOTIF-MCP-PATCH-SHARED` (the `composition_motif_patch` MCP edit tool). Details in the "Deferred … BOTH NOW CLEARED" block below. 150 motif unit tests + 38 motif DB integration tests green; migration re-smoked idempotent on real `loreweave_composition`; provider-gate clean.

> **▶ Shipped this session — the two NEW future-feature rows (now CLOSED):**
> - **`D-MOTIF-ADOPT-BOOK-COLLAB-TIER` (model B) — a THIRD tenancy tier (the book SHARED library).** Spec: [docs/specs/2026-06-29-motif-book-collab-tier.md](../specs/2026-06-29-motif-book-collab-tier.md). A `motif.book_shared=true` row is owned by its creator (attribution) but VISIBLE to the book's VIEW-grantees and WRITABLE by its EDIT-grantees — access is the **book grant resolved at the caller**, never row ownership. User decisions (this session): **context-scoped reads** (per-book gate, no global "all my books"), **any-EDIT-grantee writes** (edit + archive), **adopt + create + mine** all produce shared rows. The base read predicate is **UNCHANGED** (a foreign shared row is fail-closed invisible to get_visible/list_for_caller/catalog/get_by_codes); shared rows surface ONLY through the gated book-context methods. Touch-points: schema (`book_shared` col + `motif_book_shared_shape` CHECK [shared ⇒ book+owner+private, the public-catalog-orthogonality guard] + per-book `uq_motif_book_shared` + re-narrowed `uq_motif_user_book WHERE …AND NOT book_shared`); repo (`clone/adopt/create/_clone_with_code` thread book_shared; new `list_in_book/get_in_book/patch_shared/archive_shared`; adopt locks per-BOOK + dedups per-(book,code) for the shared tier); MCP (`adopt target=book_shared`, `create target=book_shared`, `mine promote_target=book_shared`, `archive book_id=`, new `composition_motif_book_list`); confirm dispatch (`book_shared` rides the payload, re-gated EDIT); FE (3rd adopt target "Share with collaborators" + `Shared` badge).
> - **`D-MOTIF-HTTP-ADOPT-BOOK` — HTTP parity.** `POST /motifs/{id}/adopt` now takes `target=user|book|book_shared`+`book_id`, **EDIT-gated before the clone** (no softer than MCP); `GET /motifs/book/{id}` (VIEW-gated list); `PATCH`/`DELETE …?book_id=` (EDIT-gated shared edit/archive, visibility-flip refused 400). A book-shared pattern root does NOT auto-adopt its members (the half-shared-pattern guard).
>
> **VERIFY:** 90 motif unit tests + new repo/mcp/router cases green; **integration (real PG)**: new `test_motif_book_shared_db.py` (shape CHECK, per-book dedup, list/get scoping, any-grantee patch/archive) + 32 existing motif DB tests pass on a throwaway DB; **migration live-smoked idempotent on the REAL existing model-A `loreweave_composition`** (added book_shared col + CHECK + uq_motif_book_shared + re-narrowed uq_motif_user_book; two runs, no error). FE 152 motif tests + tsc + provider-gate clean. **`/review-impl` adversarial tenancy review: 0 HIGH / 0 MED** — all 9 read/write/leak/confirm/dedup checks PASS with file:line evidence; 3 LOW/COSMETIC notes (deferred below).
>
> **▶ Deferred (from the model-B review — BOTH NOW CLEARED 2026-06-29):**
> - ✅ **`D-MOTIF-LINK-SHARED-TIER`** — **CLEARED:** the `motif_link_guard` was rewritten (NULL-safe) to a precise 3-arm same-tier rule — both SYSTEM, or both the SAME book's SHARED tier (owners may differ — the point of a collaborator graph), or both the SAME user's PRIVATE tier. A shared↔private/system/cross-book link is rejected at the DB. Repo `list_links/create_link/delete_link` gained a `book_id` path (anchor via get_in_book; both endpoints must be `book_shared AND book_id`); MCP link tools take `book_id` (VIEW for list, EDIT for create/delete). Live-PG tested (same-book allowed, 3 cross-tier rejections, 3rd-grantee list/delete) + migration re-smoked idempotent on real `loreweave_composition`. **Caught+fixed a SQL three-valued-logic bug**: `owner = owner` with a NULL operand yields NULL so `IF NOT NULL` wouldn't fire (a user→system link would have slipped) — every arm is now NULL-guarded.
> - ✅ **`D-MOTIF-MCP-PATCH-SHARED`** — **CLEARED:** new `composition_motif_patch` MCP tool (Tier-A) — owner-keyed by default, or a SHARED-tier edit with `book_id` (EDIT-gated → patch_shared). Optimistic-lock `expected_version` (stale → applied_conflict), visibility/publish deliberately NOT editable (separate flow), honest undo that patches changed fields back to prior values. Owner path denies a foreign row before any write; shared path confirms the row is shared-in-this-book.
>
> ---
>
> # ▶▶ (prior) **Motif library COMPLETE — audit 7/7 closed (WI-1…WI-6)** · HEAD `04bab448`+ · 2026-06-29

> **What this branch is:** the narrative-pattern (motif/arc) library — Tier-W cost-gated MCP flows for mining, conformance, adopt, and 3-way publish-sync, fronted by the FE→MCP-tool bridge. The feature body landed across prior sessions; this session closed the **completeness-audit tail** AND shipped **WI-5 per-book adopt**.
>
> **▶ Shipped this session (all green — 1083+ backend unit + 151 FE motif tests, tsc + provider-gate clean):**
> - **Audit tail (committed `f1157b25`…`b8f0ddb3`):** BYOK model_ref threading through `motif_mine`/`arc_import`; the **tag-beats LLM extractor** (knowledge `POST /internal/extraction/tag-beats` → composition mine pre-pass; cross-tenant injection neutralized); **WI-3 arc semantic retrieve** (`composition_arc_suggest`); **WI-1/WI-2/WI-4 FE** (mine panel, full editor, publish-sync); `/review-impl` fixes (arc back-fill scoped to own/system; editor edit-loss). Completeness audit: [`docs/reports/2026-06-29-motif-completeness-audit.md`](../reports/2026-06-29-motif-completeness-audit.md).
> - **WI-5 per-book adopt (`D-MOTIF-ADOPT-PER-BOOK`) — model A "book-scoped filter" (user-chosen, NOT the tier-reversal):** `motif.book_id` is a per-book LABEL on a clone the adopter still owns. The read predicate + 2-tier tenancy are **UNCHANGED** (book_id only narrows the owner's view, never widens visibility). Design: [`docs/plans/2026-06-29-motif-adopt-per-book.md`](../plans/2026-06-29-motif-adopt-per-book.md). Touch-points: schema (`book_id` col + `uq_motif_user` scoped to `book_id IS NULL` + new `uq_motif_user_book` partial + `idx_motif_book`); `MotifRepo.clone/adopt/_clone_with_code/list_for_caller`; `_MotifAdoptArgs.target=Literal['user','book']`+`book_id` (EDIT-gated at propose **and** confirm); FE adopt-to-book toggle (api/hook/AdoptTargetModal/MotifLibraryView). **Live-smoked** on real `loreweave_composition`: migration idempotent; global+per-book coexist; same-book dup blocked by `uq_motif_user_book`; 0 leaked rows.
> - **WI-6 motif_link edge-walk (`D-MOTIF-LINK-EDGEWALK`) — the FINAL §5 gap, closing the audit 7/7:** 3 MCP tools — `composition_motif_link_list` (R, traverse out/in/both with neighbor code+name), `composition_motif_link_create` + `_delete` (A). User-scoped; WRITE requires **BOTH endpoints owned by the caller** (the system↔system hole the DB `motif_link_guard` same-tier check misses — a user may never reshape the shared graph). `MotifRepo.list_links/create_link/delete_link`. **Live-smoked**: own→own create/list/delete OK; own→system rejected by the guard; 0 leaked rows. The completeness audit is now **7/7 closed, nothing deferred**.
>
> **⚠ Two already-built misfires earlier this session** (memory [[verify-built-before-building]]): `D-W8-MOTIF-BEAT-EXTRACTOR` and `D-MOTIF-SYNC-3WAY-BASE` backend were **already shipped** — I rebuilt a duplicate sync router and reverted it (`a24d99ea`). **Before building ANY "missing"/deferred motif item: `git grep` the route/module/test first.**
>
> **▶ NEXT:** **PR `feat/narrative-pattern-library` → main** — the feature body + audit tail + WI-5 are complete, green, and live-smoked. (Note: the WI-5 migration was applied to the *running* dev `loreweave_composition` by the live-smoke; a fresh stack picks it up from `migrate.py` on boot.)
>
> **▶ Deferred (motif — the §5 audit tail is 7/7 CLOSED; these were NEW future-feature rows):**
> - ✅ **`D-MOTIF-ADOPT-BOOK-COLLAB-TIER`** — **CLEARED (2026-06-29):** model B shipped (see the top block). The shared book tier landed with a 0-HIGH/0-MED adversarial tenancy review.
> - ✅ **`D-MOTIF-HTTP-ADOPT-BOOK`** — **CLEARED (2026-06-29):** the HTTP adopt route exposes `target`+`book_id`, EDIT-gated (see the top block).

---

> **▶ Archived 2026-06-30** — older / other-track handoffs moved to [`SESSION_ARCHIVE.md`](SESSION_ARCHIVE.md) to keep this file to the **active branch** only. The 2026-06-29 merge pulled in main's `Critical UX` + `Public MCP` tracks and all prior session history (glossary / composition / roleplay / extraction / KG / campaign / Sessions 66–71); all of it (incl. each track's open-defer register) lives in the archive and on its own branch + `main`. Search `SESSION_ARCHIVE.md` for a `D-…` id if you need a prior-track defer.
