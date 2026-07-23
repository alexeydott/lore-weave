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
| S4 | **Depth-first: clear the red baseline** (old bugs corrupt every new measurement) | **DONE** | **25 → 0. chat-service 1860 pass / 0 fail.** 4 real product bugs found + fixed (browser-executed conflation ×4 consumers, incl. a subagent tool-scope leak). Runtime-verified + E2E (`max_consec` 3→1). |
| S5 | **Pay the coverage debt** — kill-switches untested in either state | **6 of 8 PAID + GATED** | Audited 15 boolean flags: **8 had zero coverage**. Now covered both-state: `compact_studio_panel_desc`, `studio_panel_intent_gated`, `compact_task_elastic_enabled`, `compact_breadcrumb_enabled` (mutation-proven), `compact_recovery_hint_enabled`, `compact_persist_enabled`, `lazy_workflow_directive`. Debt down 7 → 2 rows. A **gate** fails any NEW untested flag (proven). chat-service **1886 pass / 0 fail**. |
| S3 | composition-service unification (~89 tools) | DEFERRED — do after S5 debt burn-down | — |

### Closed earlier this session (evidence recorded)
- Glossary de-federation (`Items any`) — FIXED + gated. `235 PARTIAL → 289 tools`; `0 → 54` glossary_*. `3e6df3a56`
- Federation-safety guard on all 10 providers — SDK panic (Go×5) + shared checker (Py×5). Live scan `0` real violations. `4d6f5e2fd`
- Outage visibility F1–F4 — agent now says "temporarily unavailable" instead of blaming the user; `/health/federation` 200→200→**503**→200. `4abda32b7`
- Placeholder-id silent no-op + skill drift — 13→3 calls; entity `019f8cbe-…` DB-verified. `6ba95f4ef`

---

## Known-open register (NOT drift — deliberately parked, with the reason)

| ID | Item | Why parked |
|---|---|---|
| K1 | ~~24 pre-existing chat-service failures~~ → **being cleared in S4** (25 → 16) | Was mis-parked as "different track". It is the measurement-corrupting bug class: a permanently red suite makes a new regression indistinguishable from old noise. |
| ~~K2~~ | **RESOLVED + it was bigger than recorded.** Not one tool: ALL THREE `*_task_provide_input` (book/composition/glossary) carried NO tier, and `tool_tier()` defaults missing→"R" (inert), so all three **passed the ask-mode read-only filter** — a read-only turn could drive a pending gate to completion, i.e. perform the write ask mode exists to withhold. Fixed in BOTH kits (tier A, scope user) + guards. Live-verified: ask-mode survivors 110→107, zero `provide_input` remaining. Also closed a kit-parity gap (Python registration had no description/synonyms while Go did) which was reddening 3 composition unit tests. |
| K3 | Go SDK federation guard only takes effect on REBUILD — book/catalog/agent-registry/provider-registry still run pre-guard images | Preventive, not a live defect (all 10 providers federate clean today). |
| K4 | Envelope long-tail `ambient_book`/`ambient_project` tagging | Parked by user decision — do at schema-drop time. |
| K5 | A real unified cross-store search | Verified it does NOT exist; separate feature, never built. |
| K6 | `kg_ontology_propose op=sync_apply` + `op=schema_edit` not executed end-to-end | Blocked by fixture state (no adopted ontology / no upstream drift). Dispatch proven by 3 distinct op-specific cores answering. Needs a confirm-redemption path (review surface), which is a GUI/chat test, not an MCP one. |
| K8 | One `propose_entities` retry survives the SUCCESS guidance (2 calls, was 3) | Closing it needs cross-iteration same-args suppression, which would block legitimate retries (state can change between iterations) — a worse failure than one wasted call. Conscious won't-fix for now. |
| K10 | `propose_edit` is advertised LOCALLY (frontend_tool_defs editor branch) but executes via ai-gateway since P2.2 — advertised-but-gateway-dependent | Low severity: ai-gateway is a hard dependency for nearly everything else, so a gateway-down surface has larger problems. Recorded because it violates "advertise only what you can execute"; Phase 4 sources it from the catalog and closes it naturally. |
| K11 | composition `test_book_lifecycle_consumer::test_an_event_without_book_id_is_ACKED_not_retried_forever` fails ONLY under `-n auto` | Test-isolation flakiness (passes alone and in its own file). Real debt, different class (shared state across xdist workers) — needs the file to declare its xdist group or drop the shared fixture. |
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
