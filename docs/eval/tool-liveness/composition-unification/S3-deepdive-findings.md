# S3 deep-dive — auditing the "honest engineering calls"

**Date:** 2026-07-25 · prompted by: *"deep dive this before continue"* — a challenge to the
"leave separate" verdicts, in case they were rationalized laziness rather than real judgment.

## What was audited

Every S3 decision to NOT merge, re-verified against code (not memory):

1. **authoring_run tier-split — CONFIRMED sound.** Verified all 5 W ops
   (create/start/resume/gate/revert_all) mint a confirm-token (`gate_or_confirm`/
   `mint_confirm_token`) and all 4 A ops (pause/close/accept_unit/reject_unit) call `svc.<op>()`
   immediately. The tier boundary is genuinely behavioral; merging W+A would break gating.

2. **arc-engine / motif adopt+mine / conformance / reference / work — CONFIRMED separate.**
   Mixed tier+scope, distinct transforms, or true singletons (reference has only find+update;
   work has only create+get+switch — no CRUD pair).

3. **derivative family — my verdict was RIGHT but my REASON was wrong, and there was a real bug behind it.**

## Two real findings (the value of the push)

### Finding A — a shipped correctness bug: `motif_edit` op=patch lost null-clear

`motif_patch` builds its SQL SET clause from `model_dump(exclude_unset=True)`, so an **explicit
null clears the column** (`emotion_target=null` → `SET emotion_target = NULL`). But `motif_edit`
forwarded patch fields with `_present` (drop-None), which collapses absent-vs-null — so through
the unified tool you could **not clear a nullable field the legacy tool can**. A flat op superset
can't distinguish the two by value; you must route the caller's own `model_fields_set`.

**Fix:** new `_passed(args, *names)` forwards fields by `model_fields_set` (preserving explicit
None). Applied to `motif_edit` op=patch. The other 6 merged update handlers use the
`if value is not None` pattern (None = unchanged, never clears) — audited, `_present` stays
correct for them. Test + mutation (reverting to `_present` reds the null-clear test).
**LIVE-VERIFIED:** motif `emotion_target='dread'` → `motif_edit op=patch emotion_target=null` →
column NULL.

### Finding B — a family the prefix-based survey MISSED: derivative CRUD

My family survey grouped by name-prefix (`arc_*`, `motif_*`), so it never bucketed
`archive_derivative` + `divergence_spec_update` together — yet both are A/book, both keyed by the
derivative's own `project_id`, both reject the canonical Work: **soft-DELETE + UPDATE on the same
entity.** I had dismissed them as "unrelated semantics" (wrong) and later thought null-clear made
them unmergeable (also wrong — `_passed` solves it).

**Action:** merged into `composition_derivative_edit(op=archive|update_spec)` [A/book], using
`_passed` so the documented `pov_anchor=null` clear survives. `create_derivative` stays separate
(W/confirm-gated); `switch_active_work` stays separate (a per-user active-work PREF keyed by
`book_id` over any Work, not derivative-CRUD). Live: both ops reach their handlers (the
`NOT_A_DERIVATIVE` domain rejection on a canonical Work proves dispatch + arg-forwarding);
validation clean; legacy hidden.

## Method correction (so it doesn't recur)

- **Survey CRUD families by the ENTITY an op mutates, not by name-prefix** — same-entity ops with
  divergent names (`archive_derivative` vs `divergence_spec_update`) hide from a prefix scan.
- **op-dispatch + a PATCH handler that uses `exclude_unset`/`model_fields_set` ⇒ forward by
  `model_fields_set` (`_passed`), never drop-None** — else explicit-null clears are silently lost.

## Net

- 1 real correctness bug found + fixed (motif null-clear), live-verified.
- 1 genuinely-missed family recovered (derivative_edit).
- 3 "leave separate" verdicts re-confirmed with correct reasons.
- Composition default discovery: **96 → 50** (9 families, 48 legacy write tools → 13 unified).
