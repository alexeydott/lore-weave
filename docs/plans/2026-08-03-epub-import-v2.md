# EPUB Import V2 — implementation plan and status

**Spec:** [`docs/specs/2026-08-03-epub-import-v2.md`](../specs/2026-08-03-epub-import-v2.md)
**Status:** implementation landed; follow-up verification remains.

## Delivered

- The shared EPUB parser preserves EPUB 3 `nav`, EPUB 2 NCX, and spine fallback
  hierarchy instead of flattening a source into one chapter.
- Book Service owns inspection, durable jobs/items, chapter provenance, assets,
  metadata/cover journals, finalize, resume, cancel, and rollback.
- Worker-infra claims/checkpoints items, reclaims idle Redis deliveries, and
  forwards only opaque scene and hierarchy mappings across service boundaries.
- Composition persists the lossless ToC closure and projects manuscript-part
  mappings without writing Book Service tables.
- The Chapters tab exposes the retained-source inspection and selection wizard,
  including title overrides and durable progress/recovery/report state.
- FB2 remains a separate import path and is not routed through the EPUB pipeline.

## Verification snapshot

The current handoff records passing targeted Go parser/service tests and frontend
build checks. Full Knowledge pytest still has unrelated pre-existing failures and
the Book OpenAPI Spectral run is blocked by duplicate FB2 response keys in the
base contract; these are tracked separately and are not EPUB V2 regressions.

## Next checks

1. Add wizard localization and focused UI tests for selection, title overrides,
   retry/resume, rollback confirmation, and error states.
2. Exercise strategy/asset cleanup and Composition outage/retry behaviour with
   durable integration fixtures.
3. Run a browser smoke test on a real EPUB with nested ToC nodes and verify the
   resulting chapter count, titles, hierarchy, provenance, and activity/report
   records.
4. Keep the legacy combined-HTML chapter path disabled for EPUB V2 and retain
   the opt-in rollout guard until those checks are green.
