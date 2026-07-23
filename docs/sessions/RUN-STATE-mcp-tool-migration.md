# RUN-STATE — MCP tool-catalog migration close-out

**Purpose:** the open-items ledger for the tool-unification effort, so nothing drifts across
compaction. **Re-read this file first after any compaction, before `git log`.**
Branch `feat/frontend-tools-mcp-migration`. Opened 2026-07-23.

**Rule:** an item is `DONE` only with an **evidence string** (a measured number, a DB row, a
pasted output). "Looks right" / "tests pass" is not evidence for a cross-service claim — that
is exactly what let `Items any` de-federate 54 tools with every gate green.

---

## Slice board

| # | Slice | Status | Evidence |
|---|---|---|---|
| S1 | Live-smoke the 5 KG merges (`kg_build`, `kg_graph_query`, `kg_ontology_propose`, `kg_view_edit`, `kg_add_nodes`) | **DONE** | 12 branches through ai-gateway: **9 executed w/ real effect, 2 correct preconditions, 1 unreachable-on-fixture, 0 defects**. `kg_view_edit` upsert→delete round-trip; `kg_add_nodes from_glossary` = `nodes_created:16`. `docs/eval/tool-liveness/kg-unification/LIVE-SMOKE.md` |
| S2 | Dedup identical duplicate tool calls | **DONE (partial, honest)** | Split into TWO defects. **S2a** same-pass collapse: 6 unit tests, ⚠️ not yet live-exercised. **S2b** `created:0` read as failure: retries **3→2**, user now told *"Lâm Uyên is already in the glossary"* instead of *"I can't save that"*. `docs/eval/tool-liveness/duplicate-tool-calls/RESULTS.md` |
| S3 | composition-service unification (~89 tools) | **NEXT** | — |

### Closed earlier this session (evidence recorded)
- Glossary de-federation (`Items any`) — FIXED + gated. `235 PARTIAL → 289 tools`; `0 → 54` glossary_*. `3e6df3a56`
- Federation-safety guard on all 10 providers — SDK panic (Go×5) + shared checker (Py×5). Live scan `0` real violations. `4d6f5e2fd`
- Outage visibility F1–F4 — agent now says "temporarily unavailable" instead of blaming the user; `/health/federation` 200→200→**503**→200. `4abda32b7`
- Placeholder-id silent no-op + skill drift — 13→3 calls; entity `019f8cbe-…` DB-verified. `6ba95f4ef`

---

## Known-open register (NOT drift — deliberately parked, with the reason)

| ID | Item | Why parked |
|---|---|---|
| K1 | 24 pre-existing chat-service test failures (incl. `TestGenericFrontendTools` ×2, `ui_navigate` absent from core) | Pre-existing; reproduced with all changes stashed. Different track. |
| K2 | `composition_task_provide_input` carries no `_meta.tier` | Pre-existing; composition track. |
| K3 | Go SDK federation guard only takes effect on REBUILD — book/catalog/agent-registry/provider-registry still run pre-guard images | Preventive, not a live defect (all 10 providers federate clean today). |
| K4 | Envelope long-tail `ambient_book`/`ambient_project` tagging | Parked by user decision — do at schema-drop time. |
| K5 | A real unified cross-store search | Verified it does NOT exist; separate feature, never built. |
| K6 | `kg_ontology_propose op=sync_apply` + `op=schema_edit` not executed end-to-end | Blocked by fixture state (no adopted ontology / no upstream drift). Dispatch proven by 3 distinct op-specific cores answering. Needs a confirm-redemption path (review surface), which is a GUI/chat test, not an MCP one. |
| K8 | One `propose_entities` retry survives the SUCCESS guidance (2 calls, was 3) | Closing it needs cross-iteration same-args suppression, which would block legitimate retries (state can change between iterations) — a worse failure than one wasted call. Conscious won't-fix for now. |
| K9 | S2a same-pass collapse never fired in a live run | The pattern is real (4x at iteration 0 in two recorded sessions) but neither post-fix run reproduced it. Unit-proven only. |
| K7 | `kg_build target=graph` not executed | Project has no embedding model configured; the tool says so with the exact remedy chain. Would need `kg_project_set_embedding_model` + `kg_run_benchmark` on the fixture first. |

## Drift log (near-misses — an empty log here would be dishonest)
- **Plan F3 was wrong.** "Fail the healthcheck on PARTIAL" would have deadlocked: `glossary-service`
  declares `depends_on: ai-gateway: service_healthy`. Caught by checking `depends_on` before writing.
- **First federation-guard walker had a false positive.** Flagged 12 boolean `default:` values as
  subschemas; shipped as written it would have panicked services at boot — worse than the bug.
  Caught by scanning all 10 live providers before wiring it in.
- **Claimed "the skill fix will change S00b behavior."** It could not: S00b runs `enabled_skills: []`.
  Corrected after measuring, not before.
- **Claimed the duplicate calls were "all parallel at iteration 0."** Wrong for session 019f8dda —
  those were sequential RETRIES (iterations 1,2,3) with a different root cause (`created:0` reading as
  failure). Collapsing them would have been incorrect. Caught by querying the `iteration` field instead
  of trusting the earlier reading.
- **Claimed ai-gateway "degrades silently."** Too coarse — the signal existed and was plumbed; it was
  wired only to the F17-retired path. Corrected after reading the code.
