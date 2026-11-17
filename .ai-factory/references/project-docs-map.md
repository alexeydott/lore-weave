# LoreWeave Documentation Map Reference

> Sources: `docs/` repository documentation tree
> Created: 2026-08-02
> Updated: 2026-08-02

## Overview

The `docs/` tree contains 2,222 files spanning current handoffs, strategic roadmaps, active and completed implementation plans, standards, architecture maps, audits, research, QA evidence, runbooks, and a large separate MMO-RPG design track. It is not a single linear plan and must be read through a freshness and authority hierarchy.

This reference routes AI Factory workflows to the smallest authoritative document set for the current task. It does not replace the source documents and must not be used as proof that planned work is implemented.

## Authority and Freshness Hierarchy

Use this order when sources disagree:

1. **Current code, machine contracts, tests, gates, Git history, and runtime evidence** — implementation truth.
2. **Top `▶ NEXT SESSION` block in `docs/sessions/SESSION_HANDOFF.md`** — current work status and immediate continuation; verify claims against level 1.
3. **The explicitly selected active dated plan/spec and its run-state/handoff** — task scope and sealed decisions for the work in flight.
4. **`docs/standards/README.md` and linked standards/contracts** — current cross-cutting laws and enforcement.
5. **Current architecture ownership maps** — `docs/ARCHITECTURE.md`, `docs/DATA_ARCHITECTURE.md`, `docs/FEATURE_INDEX.md`, and `contracts/language-rule.yaml`.
6. **`docs/deferred/DEFERRED.md` and the relevant handoff Deferred section** — tracked debt and wake-up triggers; validate that a supposedly open item is not already fixed.
7. **Strategic snapshots** — `docs/MILESTONE.md` and `docs/03_planning/09_ROADMAP_OVERVIEW.md`; useful for direction, not proof of current status.
8. **`docs/00_index/00_DOCUMENT_CATALOG.md`** — historical navigation and metadata; useful for locating module packs, but its catalog state can lag newer plans and implementation.

Document labels such as `Approved`, `Active`, `GO`, or a checked box prove governance state only. They do not prove code exists, tests pass, runtime behavior works, or the document is the newest authority.

## Core Working Sources

| Question | Read first | Then verify with |
|---|---|---|
| What should happen next? | Top block of `docs/sessions/SESSION_HANDOFF.md` | Git status/log, current code, active plan/run-state |
| What is implemented now? | Current code and tests | Git history, runtime/live evidence, relevant handoff section |
| What is the strategic direction? | `docs/MILESTONE.md`, then `docs/03_planning/09_ROADMAP_OVERVIEW.md` | Current handoff and newer dated plans |
| Which plan governs this task? | User-selected plan or branch/task-matching file under `docs/plans/` or `docs/03_planning/<TRACK>/` | Its referenced spec, run-state, contracts, and current code |
| Which rules apply? | `docs/standards/README.md` quick-nav | Linked standard, machine contract, and enforcement script |
| Who owns a service/capability? | `docs/ARCHITECTURE.md` | `contracts/language-rule.yaml` and actual service tree |
| Who owns data and what is SSOT? | `docs/DATA_ARCHITECTURE.md` | Migrations, service code, DB initialization, contracts |
| Which frontend feature owns a route? | `docs/FEATURE_INDEX.md` | Actual frontend route/API client and gateway mapping |
| What is intentionally deferred? | Relevant handoff Deferred section and `docs/deferred/DEFERRED.md` | Code search, mechanism/trigger, deferral gate |
| What acceptance evidence is required? | Active plan/spec and `docs/05_qa/` or track testing strategy | Fresh test/live output and current contracts |
| How is production operated? | `docs/runbooks/`, `docs/sre/`, and root `runbooks/` | Infra config, dashboards, alerts, deployment workflows |

## Documentation Families

### Foundation and Governance

- `docs/00_index/`: historical catalog and reading order.
- `docs/01_foundation/`: product scope, organization, V1 boundaries, and early stack/service matrix.
- `docs/02_governance/`: operating model, RACI, accessibility, admin actions, cross-instance access, UI copy, and context architecture.
- Prefer newer authoritative architecture/standards/contracts when early foundation documents conflict with current reality.

### Strategic Planning

- `docs/MILESTONE.md`: compact milestone snapshot, but its named active session can become stale.
- `docs/03_planning/09_ROADMAP_OVERVIEW.md`: phase/module roadmap and historical checkpoints.
- `docs/03_planning/`: large module packs, ADRs, detailed designs, readiness gates, and long-running track documents.
- Strategic sources define intent and dependency ordering; always reconcile them with the current handoff and implementation evidence.

### Active and Dated Plans

- `docs/plans/YYYY-MM-DD-*.md`: dated implementation plans and specifications for concrete efforts.
- `docs/specs/YYYY-MM-DD-*.md`: current design specifications and locked decisions.
- A plan is active only when selected by the user/current handoff/run-state or matched unambiguously to the task. Directory presence alone does not make it active.
- Read the plan's referenced sources rather than scanning unrelated plans.

### Implementation State

- `docs/sessions/SESSION_HANDOFF.md`: current and historical execution records; only the top current block is session-start context by default.
- `docs/implementation/*SITUATION_AND_TODO.md`: module-specific implementation snapshots; verify their dates and validation posture before use.
- `docs/implementation/*PLAN.md`: implementation slicing, not completion evidence.
- `docs/MILESTONE.md`: high-level status summary that must be freshness-checked against the current handoff.

### Architecture and Ownership

- `docs/ARCHITECTURE.md`: service purposes, system topology, stack, ports, and drift checks.
- `docs/DATA_ARCHITECTURE.md`: storage topology, SSOT/derived layers, database ownership, integration patterns, flows, and drift checks.
- `docs/FEATURE_INDEX.md`: frontend feature folders, routes, backing services, MVC convention, and non-obvious routing.
- `docs/standards/README.md`: authoritative index of cross-cutting standards, contracts, invariants, enforcement, and known gaps.
- `contracts/language-rule.yaml`: machine-enforced service-language ownership and the final authority for language assignment.

### Deferred Work

- `docs/deferred/DEFERRED.md`: durable project debt registry, including resolved history and workstream sections.
- The relevant current handoff may contain the immediate Deferred subset.
- Do not load the full registry for every task. Search by ID, service, track, or trigger.
- A prose row may be stale. Confirm the wake-up mechanism and current code before treating it as open.

### Evidence, Audits, and Research

- `docs/05_qa/`, `docs/test/`, `docs/eval/`, and `docs/dogfood/`: test strategies, scenarios, evaluations, and user-journey evidence.
- `docs/audit/` and `docs/reviews/`: historical review outputs; useful for recurring failure patterns, not automatically current findings.
- `docs/research/`, `docs/analysis/`, and `docs/04_analysis/`: research and analysis; distinguish hypotheses from accepted decisions.
- `docs/bugs/`: issue dossiers; verify open/closed state in current code and handoff.

### Operations

- `docs/runbooks/`, root `runbooks/`, `docs/sre/`, and `docs/governance/`: operational procedures and governance catalogs.
- Runtime truth also requires checking `infra/`, `.github/workflows/`, dashboards, alerts, and scripts.

### MMO-RPG Track

- `docs/03_planning/LLM_MMO_RPG/` is a separate, very large sub-project with its own indexes, boundaries, foundation invariants, feature packs, and work tracks.
- Start with its local README/index and `_boundaries/` ownership files, then load only the active feature/cycle documents.
- Do not confuse `docs/03_planning/LLM_MMO_RPG/features/` design documents with shipped `frontend/src/features/` code.
- MMO foundation/service work may have separate data planes, run-states, plans, and session handoffs; use the track-local source named by the current task.

## AI Factory Usage Patterns

### Planning

1. Read the current handoff top block.
2. Identify the exact track/module/capability.
3. Locate one active plan/spec; do not infer activity from filename recency alone.
4. Load applicable standards through the standards index.
5. Load architecture/data/frontend ownership maps only for affected boundaries.
6. Search Deferred by relevant IDs/services/triggers.
7. Verify all implementation claims against code/contracts/tests/Git.
8. Produce the local AI Factory plan as an execution view that links to source docs without rewriting them.

### Implementation

1. Re-read the active plan and sealed decisions.
2. Check current code because plans and handoffs can lag.
3. Follow the referenced standards and ownership maps.
4. Update source documentation only when the implementation changes its owned truth.
5. Record current evidence and continuation in the correct handoff.

### Roadmap Work

1. Treat `docs/MILESTONE.md` and `09_ROADMAP_OVERVIEW.md` as inputs, not an automatically current roadmap.
2. Reconcile milestones with the current handoff, dated plans/specs, Git, code, and tests.
3. Keep `.ai-factory/ROADMAP.md` as a compact local execution index, with links to authoritative docs and explicit evidence/freshness fields.
4. Do not mark a milestone complete from prose or file existence alone.

### Verification and Review

1. Convert plan/acceptance claims into executable checks.
2. Use fresh command/runtime output as proof.
3. Report documentation drift separately from implementation failure.
4. Update the authoritative source named by the ownership map, not every document mentioning the concept.

## Best Practices

1. Read indexes and top/current sections before deep documents.
2. Search by task ID, service, invariant, or contract name instead of reading whole directories.
3. Prefer links over duplicated doctrine; `docs/standards/README.md` is intentionally an index.
4. Record source path, status metadata, last-updated date, and evidence when summarizing a plan.
5. Separate `planned`, `implemented`, `verified`, `shipped`, and `deferred`; never collapse them into one “done” state.
6. Verify tables and inventories using their documented drift-check commands.
7. Keep active context narrow enough that historical plans and audits cannot silently override current decisions.

## Common Pitfalls

- Treating the newest filename as the active plan without handoff/user/run-state evidence.
- Treating `Approved` or a readiness `GO` as implementation completion.
- Treating a historical audit finding as still open without checking code.
- Treating a handoff claim as proof without current Git/test/runtime evidence.
- Reading the full 5,000+ line handoff instead of its top current block and targeted historical sections.
- Using the March document catalog as a complete index of later work.
- Using the old phase roadmap as the sole source of current priorities.
- Mixing the novel-platform frontend feature tree with MMO feature design documents.
- Copying large plans into AI Factory artifacts and creating another stale source of truth.

## Maintenance

Refresh this reference when documentation ownership, primary indexes, session protocol, or roadmap locations change. Source documents remain authoritative; this map should only describe how to find and adjudicate them.
