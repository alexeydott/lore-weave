# E2E newcomer scenario — live run record (2026-07-25)

**Purpose:** a repeatable, human/LLM-judge-driven walkthrough of the newcomer authoring flow through
the REAL studio UI (Playwright), to confirm the recent bug-fixes hold in the live product and surface
any remaining bugs. **Method (per industry consensus): assert the OUTCOME/final-state, not the random
tool-trajectory; capture the trajectory (tools + errors) for diagnosis; judge quality with an LLM (me).**

## Run context
- Book: **The Cartographer of Realities** — `019f9983-8a08-7d26-9e2f-718d6b39c803`
- Composition Work (project): (auto-created when studio opened)
- Model: **Gemma-4 26B-A4B QAT (lm_studio, $0)** — the co-writer
- Driver: Playwright MCP (real browser) + `docker logs infra-chat-service-1` for tool-call/error trace +
  direct DB reads for final-state assertions.
- Premise given to the agent: *Elara, a young cartographer whose drawn maps reshape reality.*

## Scenario script (the 8 steps)
1. Login + create book — DONE (via UI; description left EMPTY on purpose).
2. Show idea / premise — given inline to the agent.
3. Ask agent to UPDATE the book description.
4. Ask agent to PROPOSE + SET UP ontology + KG over a few chat turns (evaluate reasonableness/quantity;
   candidate for a standard workflow).
5. Give suggestions + ask agent to PROPOSE a plan.
6. Review the plan, ask it to COMPILE.
7. Open Plan Hub + other tabs to review the plan (UI).
8. Ask agent to WRITE after adjusting the plan.

---

## Results (appended per step)

| Step | Message → agent | Tools observed (trajectory) | Errors | Final-state assert | Judge verdict |
|---|---|---|---|---|---|
| 3 | premise + "update the description" | `book_update_details` (confirm card → Confirm). frontend surface = glossary only, **no ui_***. 24 tools, 4.8s. | 0 | `books.description` = the premise text ✓ | **PASS.** Clean confirm flow; description on-topic. GUI-deprecation holds (no panel tool). Guard caught model's `current_book_id_placeholder` → real UUID. |

**Signals to watch (not step failures):**
- ⚠️ `pinned rail step tools dropped by the token budget: kg_project_entities_to_nodes, plan_propose_spec, plan_compile, book_chapter_create, book_chapter_save_draft — the rail names tools the agent cannot see` — the workflow rail references tools the budget dropped from the surface. May bite steps 5–8 (plan/write) if the agent can't discover them. **Investigate if a later step fails to find a plan/write tool.**
- ✓ Defensive guard: `book_id='current_book_id_placeholder' is not a UUID … substituting the turn's known id` — chat-service repairs the weak model's mistranscription (good, not a bug).

| 4 | "propose ontology + set up KG + seed entities" | `glossary_list_system_standards` → "Set up your book's world" (adopt standards); then `glossary_propose_entities` + **`kg_project_create` ×5-6**. No ui_*. | 0 (no tool errors) | **1** KG project (idempotent ✓), **6-kind ontology** (character/item/location/organization/power_system/unknown), **3 entities** w/ kinds (Elara, The Reality Maps, The Known World) | **PASS on outcome**, but ⚠️ **agent looped kg_project_create 5-6×** (K13 idempotency prevented dup projects; the 6th "Confirm-all" was correctly disabled). Adopted standards instead of proposing/reasoning a custom ontology. |

**Step-4 evaluation (per your ask — reasonableness/quantity + workflow candidacy):**
- **Ontology quantity**: 6 kinds — reasonable + standard for a fantasy novel. ✓
- **Entity seed**: 3 core entities — a fine seed (could add factions/other characters, but adequate).
- **Relationships**: not clearly created (the agent didn't drive `kg_propose_edge` to real edges).
- **KEY FINDING (validates your instinct): the agent's ORCHESTRATION is the weak point, not the tools.** It looped `kg_project_create` 5-6× and adopted-standards rather than proposing a reasoned ontology. **⇒ Recommend making ontology+KG setup a STANDARD, strongly-controlled WORKFLOW** (deterministic step order: propose ontology → user-approve → create project ONCE → seed entities → propose relationships), so a weak/looping model can't thrash. This is the highest-value product takeaway of the run.

| 5 | plan suggestions + "propose the plan" | `tool_list → tool_load → plan_propose_spec` (**discovery recovered the budget-dropped tool** ✓) + **`kg_project_create` ×5 again**. | 0 tool errors | `plan_run` exists (status `compiled`); still **1** KG project | **PASS on outcome** (plan proposed/exists), but the `kg_project_create` loop repeated (254k input tok this turn). |

## 🔴 KEY BUG (reproducible) — the agent re-creates the existing KG project every turn

**Symptom:** on EVERY turn after the KG project exists, the local model calls `kg_project_create` ~5× (capped), producing a redundant *"Apply kg_project_create again?"* card (Confirm-all correctly disabled) and burning huge input tokens (↑304k step 4, ↑254k step 5).

**NOT a data bug:** K13 idempotency holds (exactly 1 project the whole run); the tool returns a clear `created:False` "already exists" signal; the same-op cap stops runaway. No corruption.

**Root cause (hypothesis, code-grounded):** the agent SURFACE keeps `kg_project_create` in the persisted *activated/hot-set* across turns (domain-stickiness re-seeds the engaged `kg` domain), so a weak local model re-invokes an available "setup" tool it already completed. The clear `created:False` return lands in a PRIOR turn that gets summarized away, so within a new turn the model can't "see" that it's done.

**Fix direction (the "control this strongly" the user asked for):** once a KG project exists for the book, **drop `kg_project_create` from the advertised surface** (a completed one-shot setup tool should not stay hot) — and/or gate the ontology/KG setup behind a **deterministic standard workflow** (propose ontology → approve → create project ONCE → seed → relationships) so a looping model can't thrash. Verify: does the hot-set/rail re-advertise a create tool whose target already exists?

**Efficiency impact:** this is the dominant token cost of the run and the biggest UX blemish — exactly the "người dùng không nên thao tác quá nhiều / làm đúng và hiệu quả" concern. **Deep-dive candidate.**

## 🔬 Deep-dive: the "254k tokens/turn" claim — CORRECTED via LM Studio logs

**The 254k was misleading (user caught this).** Ground truth from LM Studio server log
(`~/.lmstudio/server-logs/2026-07/2026-07-25.2.log`):
```
slot release: n_tokens = 26584, 26807, 27030, 27253, truncated = 0
```
- **Per-call context ≈ 26–27K tokens, truncated=0** — never near the 200K window → **no crash** (matches: nothing crashed).
- **The 254K = SUM of ~9–10 loop iterations × ~27K each** — chat-service sums usage across passes (`stream_service.py:1417,1467 "usage summed across passes, design D10"`). Cumulative billing, not one context.
- LM Studio slot-releases ~1s apart ⇒ **prompt-cache HITS** on the fixed ~27K prefix — compute was cheap; only the token *count* summed high.

**Breakdown of ONE ~27K call (measured from the raw request in the LM Studio log):**
| Component | ~tokens | share |
|---|---|---|
| **System prompt (`instructions`)** | **~15.7K** | ~58% |
| **Tool schemas (25 tools)** | **~11K** | ~41% |
| actual conversation | ~0.3K | ~1% |

⇒ **each call is almost entirely fixed overhead before any real work.** "What tool causes the bloat?" —
**none singly.** It's the **system prompt (15.7K)** + the **aggregate 25-tool schema set (11K)**.

**The system prompt (15.7K) is the biggest lever — and it's bloated with OFF-TASK skill bodies.**
Its section headers on a *book-writing* turn include: *Settings assistant · Jobs assistant · Registering/
editing models · Deleting a model · Profile · Reading/Controlling jobs*. Those are other surfaces' skill
bodies injected in full (the "Available skills" block) — the `lazy_skill_bodies` flag should make these
SLUGS + on-demand `load_skill`, not full bodies. **This is a real, high-value context-bloat finding
independent of the loop.**

### Two distinct, separable problems (both real)
1. **The loop** (`kg_project_create` re-called ~10×/turn) → multiplies the ~27K base into ~254K
   cumulative. Fix: drop completed one-shot creates from the hot-set / deterministic setup workflow.
2. **The ~27K per-call base** (system prompt 15.7K + tools 11K) — pays on *every* call.
   Fixes: (a) trim/scope the system prompt so off-task skill bodies aren't injected (verify
   `lazy_skill_bodies` is effective on the studio surface); (b) the S3 unification + `ui_*` deprecation
   already shrink the 11K tool block; (c) the verbose `confirm_action`/glossary descriptions (~200 words
   each) are trimmable.

## ✅ FIXES APPLIED (2026-07-25) — both root-caused against code + evidence

### Fix (A) — the ~15.7K system prompt was the intent-skill ROUTER flooding, not a fixed base
**Root cause (verified, not assumed):** `lazy_skill_bodies=True` DOES defer the blanket
surface-default skill bodies — but the Intent→Skill Router (`skill_router.py`) then re-injects
them. Its gate was an ABSOLUTE cosine threshold (`>= 0.35`). Measured against the shipping
**bge-m3** embedder, every novel-authoring skill description scores **0.35–0.66** to ANY authoring
intent (they are one tight semantic cluster), so 0.35 passed ~ALL 10 studio-visible skills on
EVERY turn. Live measurement (real bge-m3, `route_additional_skills`):
- "update the book description" → injects **all 10** skills (incl. settings 0.376, jobs 0.353).
- "propose ontology + KG" → **all 10**. "compile the plan" → **all 10**.

The 10 studio-eligible bodies sum to **15,517 tok** (glossary 1544 + glossary_shaping 2237 +
knowledge 835 + plan_forge 919 + co_write 1079 + composition 1988 + translation 1595 + book 2537
+ settings 1690 + jobs 1093) — i.e. the entire "15.7K system prompt" WAS the router flood. The
L1 index alone is 432 tok.

**Fix:** `ROUTER_MAX_ADDITIONS = 2` — the router now returns the **top-K by score**, not
everything above an absolute bar (an absolute threshold cannot separate a compressed distribution;
a rank cap can). Threshold stays as a FLOOR. **Live-verified** (real bge-m3): injected bodies
dropped from ~10 (15,517 tok) → **3 (~3,500–4,700 tok)**, a **~70–75% cut**, and the CORRECT skill
is present every turn (ontology→knowledge+glossary_shaping ✓, compile→plan_forge+composition ✓,
plan→plan_forge ✓). `translation` still ranks spuriously high but is now bounded to 1 slot, not a
flood. Per-call context ~27K → ~15–16K. (`skill_router.py`, `test_skill_router.py`.)

### Fix (B) — the `kg_project_create` loop: an idempotent NO-OP write that kept re-firing
**Root cause:** `kg_project_create` is machine-tier **A** (`require_meta("A", …)`; the "class-W"
docstring is just prose). It auto-commits in the tool loop; on a book whose project already exists
it returns `created: False` (K13 idempotency — no dup), but the weak model kept re-issuing the
byte-identical call, bounded only by `TIER_A_SAME_OP_CAP` (5/turn) → 5 wasted loop passes + the
"Apply kg_project_create again?" card. The repeated-READ breaker is reads-only by design ("a
repeated write is not a loop"), but a create-or-get that reports it made NOTHING is the one write
that IS provably pointless to repeat.

**Fix:** an **idempotent-no-op-write breaker** (`IDEMPOTENT_NOOP_WRITE_CAP = 1`) — a Tier-A result
with `created: False` is recorded per (tool, args); the 2nd identical call is short-circuited with
a forward steer ("already exists, its id is above — move on"), 4 passes earlier than the generic
cap and with no human card. `created: True` (a real write) and tools without a `created` field are
never touched. Drives the REAL loop in tests. (`stream_service.py`,
`test_idempotent_noop_write_breaker.py`.)

**VERIFY:** chat-service full suite **1890 passed** (1885 + 5 new); provider-gate OK; db-safety OK.
Fix (A) live-verified vs real bge-m3. Single-service diff (chat-service) → no cross-service
live-smoke mandated. Residual: the live-BEHAVIORAL confirm that a weak model OBEYS the (B) steer
(vs the read-breaker precedent, same error-framing, already proven live) rides the next E2E run.

## 🔴→✅ LIVE RE-RUN after fixes (2026-07-25, rebuilt chat-service image)

Both fixes deployed (image rebuilt + healthy; `grep ROUTER_MAX_ADDITIONS`/`IDEMPOTENT_NOOP_WRITE_CAP`
= present in the running container) and verified live on the real gemma-4-26b stack ($0):

- **(A) deployed router returns top-2** (real bge-m3, `route_additional_skills` in-container):
  `update-desc → +[translation, knowledge]`, `ontology → +[knowledge, glossary_shaping]`,
  `compile → +[plan_forge, composition]` — **3 bodies (~3.5–4.7K tok)** every turn, vs the
  pre-fix flood of ~10 bodies (15,517 tok). ~70–75% cut, correct skill always present.
- **(B) breaker FIRES LIVE on gemma's real loop.** Drove "call kg_project_create … then seed
  the entities" on a book whose KG project already exists. chat-service log:
  ```
  idempotent-no-op-write breaker: kg_project_create returned created=false already this turn — short-circuited the repeat   (×2)
  ```
  Trajectory: `kg_project_create` dispatched to the backend **ONCE** (created=false) → the 2nd
  and 3rd identical calls **short-circuited** with the forward steer → the model **obeyed and
  moved on** to `kg_project_entities_to_nodes` (which minted a confirm card → `awaiting_input`,
  the normal studio flow). Pre-fix this was up to 5 backend dispatches + the redundant
  "Apply kg_project_create again?" card. **Loop bounded; weak model steered forward.**

**Caveat (honest):** an end-to-end per-call n_tokens isolation from the LM Studio server log was
NOT cleanly attributable — that shared local server also serves unrelated external agents (a
308-tool `/v1/responses` client, 99K-tok tool block, 689-char instructions — NOT chat-service,
whose system prompt is far larger and uses a different request shape), so the log interleaves
traffic. The skill-body reduction (the dominant lever) is proven deterministically against the
deployed code; the loop fix is proven in chat-service's own logs.

## Steps 6–8 — pending (compile / plan-hub review / write)
