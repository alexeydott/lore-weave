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
| ~~K1~~ | **CLEARED — 25 → 0** (chat-service 1886 pass / 0 fail). Was mis-parked as "different track"; it was the measurement-corrupting class. |
| ~~K2~~ | **RESOLVED + it was bigger than recorded.** Not one tool: ALL THREE `*_task_provide_input` (book/composition/glossary) carried NO tier, and `tool_tier()` defaults missing→"R" (inert), so all three **passed the ask-mode read-only filter** — a read-only turn could drive a pending gate to completion, i.e. perform the write ask mode exists to withhold. Fixed in BOTH kits (tier A, scope user) + guards. Live-verified: ask-mode survivors 110→107, zero `provide_input` remaining. Also closed a kit-parity gap (Python registration had no description/synonyms while Go did) which was reddening 3 composition unit tests. |
| K3 | Go SDK federation guard only takes effect on REBUILD — book/catalog/agent-registry/provider-registry still run pre-guard images | Preventive, not a live defect (all 10 providers federate clean today). |
| K4 | Envelope long-tail `ambient_book`/`ambient_project` tagging | Parked by user decision — do at schema-drop time. |
| K5 | A real unified cross-store search | Verified it does NOT exist; separate feature, never built. |
| K6 | `kg_ontology_propose op=sync_apply` + `op=schema_edit` not executed end-to-end | Blocked by fixture state (no adopted ontology / no upstream drift). Dispatch proven by 3 distinct op-specific cores answering. Needs a confirm-redemption path (review surface), which is a GUI/chat test, not an MCP one. |
| K8 | One `propose_entities` retry survives the SUCCESS guidance (2 calls, was 3) | **Won't-fix UPHELD on re-audit 2026-07-23, but the original reason was weak and the row was scoped too narrowly.** Verified: (1) no data harm — the path is idempotent (`skipped_exists`); (2) a CROSS-ITERATION backstop already exists — `TIER_A_SAME_OP_CAP=5` per TURN, and this tool is tier A, so a runaway repeat escalates to a human confirm card; (3) the house pattern for repeat-writes is **tool-level idempotency at the domain** (`book_chapter_create` N6, from dogfood F7 "the agent double-firing the tool in one turn can't leave a duplicate chapter") — a loop-level suppressor would duplicate a mechanism the architecture deliberately puts in the domain; (4) the narrow fix I dismissed too fast (honour a machine-readable "a byte-identical repeat is a no-op" marker) needs a NEW cross-service output contract ⇒ defer-gate #2 (large/structural), not a quick edit. |
| K13 | **SETTLED. 9 confirmed duplicating → 9 fixed; final re-probe `DUPLICATING: none`.** Fixed: `book_create`, `world_create`, `kg_project_create`, `composition_arc_create`, `world_map_create`, `world_map_add_marker`, `world_map_add_region`, `composition_canon_rule_create`, `composition_outline_node_create`. Confirmed ALREADY SAFE (no change needed): `composition_create_work` (idempotent), `composition_motif_create` + `composition_structure_template_create` (return `outcome: applied_conflict`, no row), `book_chapter_create` (N6), `glossary_propose_entities` (`skipped_exists`), `glossary_create_chapter_link` (PG 23505), `glossary_create_evidence` (`uq_evidence_dedup`). Guards are N6-shaped: pre-insert lookup on the natural key, live rows only, scoped so legit same-name siblings under a different parent still create; no DB uniques added. **THREE harness bugs changed verdicts mid-audit** — echoed input ids faked an IDEMPOTENT pass, positional id-picking invented K14, and reading only `isError` hid two SAFE conflict-rejections as 'inconclusive'. **Not probed (8, lower risk):** `book_chapter_bulk_create`, `glossary_book_create`, `glossary_user_create`, `kg_add_nodes`, `kg_create_node`, `composition_entity_override_add`, `composition_motif_link_create`, `composition_scene_link_create`. |
| ~~K14~~ | **NOT A PRODUCT BUG — my probe's error, retracted.** `world_map_create` was right to answer "world not found": the gateway serialises object keys ALPHABETICALLY, so `world_create`'s detail returns `bible_book_id` BEFORE `world_id`, and my positional `ids_of()[0]` handed a BOOK id to the map tool. Fixed the probe to name the key. Recorded because I logged it as a possible product defect on 3/3 reproductions — the reproduction was of my own harness. |
| K10 | `propose_edit` is advertised LOCALLY (frontend_tool_defs editor branch) but executes via ai-gateway since P2.2 — advertised-but-gateway-dependent | Low severity: ai-gateway is a hard dependency for nearly everything else, so a gateway-down surface has larger problems. Recorded because it violates "advertise only what you can execute"; Phase 4 sources it from the catalog and closes it naturally. |
| ~~K11~~ | **RESOLVED — and it was NOT flaky, NOT an xdist issue, and NOT a test bug.** It failed deterministically in the FULL suite (serial too) and passed alone, because `loreweave_obs.RedactFilter` corrupted any log call carrying a single dict arg: stdlib unwraps `logger.x(msg, a_dict)` to `record.args = a_dict`, and iterating a Mapping yields KEYS — so `tuple(...)` rewrote `{"event_type":…,"payload":…}` into `("event_type","payload")`, the message formatted one `%s` against a 2-tuple, and logging raised inside emit. The stdlib swallows that via handleError, so **the log line was silently LOST** — in every Python service using the kit. Redaction also never touched mapping VALUES, where a secret would actually sit. Fixed + 4 guards. composition 2300 pass / 0 fail; shared SDK suite 10 → 7 failures. **DEPLOYED + live-verified 2026-07-23** across chat/composition/knowledge/jobs/lore-enrichment (source-fixed alone was NOT cleared — every running image still carried the log-losing filter until rebuilt). |
| K12 | **6 of 7 were real repo debt → FIXED. The 7th is NOT repo debt.** Fixed: (a) the prompt-family taxonomy split on a NAME SUFFIX (`*_system`), so the third family `summarize_level` ({level}/{child_texts}/{entity_names}, no {text}) was filed as text-bearing and reddened 3 tests for a correct prompt — families are now DERIVED from the placeholders a template actually declares, plus a test that every prompt lands in exactly one family and one that every prompt fully substitutes its own placeholders; (b) the `event` backward-compat hash, stale since `030429658` deliberately edited `event_extraction_system.md` — only `event` drifted and only that file changed, so re-pinning is correct and the guard did its job by forcing a conscious act; (c) `test_filter_enabled_without_model_ref_raises`, which asserted pre-`D-WX-PRECISION-FILTER-MODEL-ARCH` behaviour — enabling the filter now FALLS BACK to the extraction model (the env/global one was cross-tenant and 404'd); split into a fallback test + a still-raises-with-no-model-anywhere test. **NOT repo debt:** `test_video_gen::…regression_lock` fails only in MY environment — an editable install (`__editable__.loreweave_llm-0.1.0.pth`) points `loreweave_llm` at a SIBLING CHECKOUT (`lore-weave-mvp`), so two copies of the module load and `isinstance(LLMVideoContentPolicy(...), LLMVideoContentPolicy)` is False. Containers resolve it from site-packages and are unaffected. Host-env drift, not a code defect — deliberately NOT 'fixed'. |
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
