# Co-writer onboarding dogfood — bug-hunt findings (2026-07-21)

**Book:** *The Salt Cartographer* (`019f84e1-8716-7c05-9696-1ebf2bde68fc`), fresh, English.
**Model:** Gemma-4 26B-A4B QAT (200K), studio co-writer surface.
**Session goal:** drive the full author onboarding (create → vision → description → ontology+KG →
plan → compile → review-in-UI → adjust → write) as a real user, natural language, no tool names.
**Stopped at:** step 4 (world setup) — the agent **ran away and did steps 4→8 in ONE turn**, so the
controlled step-by-step flow could not be exercised. This is the wall.

> **Verify discipline used:** every approve/tool-call was checked against the **DB**, not the UI
> (per the "sometimes it doesn't persist" rule). Everything below is DB-confirmed.

---

## 🔴 HIGH

### F1 — Runaway over-automation (THE headline bug)
On a single **"set up the world for this story"** request, the agent chained the **entire** workflow
in one 35.6s / **↑550,704-token** turn:
```
glossary_propose_entities ×2 → kg_project_create → kg_project_entities_to_nodes
→ plan_propose_spec → book_chapter_create → book_chapter_save_draft
```
**DB-verified persisted (all of it):** 6 kinds · 4 entities (Isolde/Vael/The Shifting Sea/Cartographic
Prophecy) · 1 KG project · **1 plan_run + 3 structure_nodes (plan auto-COMPILED)** · Chapter 1
("The Shifting Tide") · draft prose (3 blocks / 1609 B).

The user asked ONLY to set up the world. The agent proposed entities, built the KG, **proposed a
3-act plan, compiled it, created a chapter, and wrote prose** — with **no stop for review at any of
the user-control gates** (plan review, compile, adjust, write). The user's intended controlled flow
(steps 5–8) is bypassed entirely; there is no way to review/redirect before the agent has already
done everything.

**This is a control failure in the OVER-eager direction** — opposite of the earlier "stalls / won't
act" class, but the same root: no hard stop-gates. `plan_propose_spec` auto-compiling (structure_node
> 0, the `D-G5-DRIVE-EXEC` rules-mode autocompile) compounds it — even the compile checkpoint is gone.

**Fix direction:** the onboarding/world-setup path must become a **CONTROLLED STANDARD WORKFLOW (a
rail)** with hard checkpoints the agent cannot cross without the user (see "Workflow recommendation").
Minimum: writing prose / creating chapters must NOT happen on a "set up the world" turn.

### F2 — Run-on concatenated response (incoherent multi-phase wall)
The single runaway turn's assistant message is **~8 separate phase-closing messages concatenated**:
"I've set up the foundation… **What would you like to do next?**" … "I've laid out the structure…
**How does this look?**" … "I've created Chapter 1… **Shall we draft?**" … "I've written the opening…
**continue?**". It **asks the user for direction repeatedly IN ONE MESSAGE and then proceeds anyway**.
Root: the agent looped phases in one turn, each emitting a "done — what next?" line, none of which
actually paused. Deeply confusing; the reader cannot tell what was done, what is proposed, or what is
being asked.

---

## 🟡 MED

### F3 — Opaque confirm card ("Set up your book's world")
I asked the agent to **"propose the categories it should track."** Instead of a preview of *which*
kinds/standards it would adopt, `glossary_adopt_standards` minted an **opaque confirm card** with no
detail — the user approves blind. The card should surface the proposed kinds (character, location,
item, power_system, terminology, …) so the user can evaluate the proposal, which is what "propose"
means.

### F4 — Stuck agent-runtime status badge
After `glossary_adopt_standards` minted its confirm card (turn ended, awaiting the human), the runtime
badge stayed **"Running tool · glossary_adopt_standards"** for the whole wait — looks hung/working when
it is actually **blocked on the user**. Should read "Awaiting confirmation" / "Idle".

---

## 🟢 LOW / peripheral

- **F5 — `/v1/agent-registry/usage` → 401 Unauthorized** in the studio (console error, non-blocking;
  the usage widget's auth).
- **F6 — `/v1/notifications/stream` → `ERR_INCOMPLETE_CHUNKED_ENCODING`** — the notifications SSE
  stream drops on the studio surface (reconnect/transient, but noisy).
- **F7 — Entities created with empty `source_kind_code`** — the 4 proposed entities carry no kind
  classification (all `draft`, `source_kind_code` blank), so they aren't sorted into character/
  location/power_system.
- **F8 — Adopted kinds are generic, not book-tailored** — character/item/location/power_system/
  terminology + an odd **`unknown`** catch-all kind. The user asked it to propose categories for THIS
  story (maps, tides, prophecy); it adopted the generic standard set.
- **F9 — 6 duplicate "The Tidewright" books** ("No language set", 0 chapters) in the workspace from
  earlier runs — book-create may double-fire / a failed create leaves a ghost. Worth checking the
  create path for duplication.

---

## Observations (not bugs)
- **Slow on Gemma:** TTFT 7–16 s per turn; the runaway turn was **550,704 input tokens / 35.6 s**.
- **Heavy surface:** the studio co-writer seeds **44 tools · 8–10 skills · ~9.6 K tok** before the
  first message.
- **GOOD parts (keep):** vision feedback was engaged + on-point; the **description** routed correctly
  (`book_get → book_update_details` → diff card) and **DB-persisted (879 chars)** with a clean single
  card (the confirm-flow + sticky-domain fixes from earlier hold on the studio surface too); **entity
  extraction was accurate + tailored** (Isolde/Vael/Sea/Prophecy from the pitch).

---

## ⭐ Workflow recommendation (answering the user's ask)
**Yes — the book onboarding / world-setup flow SHOULD become a controlled standard workflow (rail),
not free agent discretion.** F1 is the proof: the agent CAN do every step and persist it, but with no
stop-gates it steamrolls the user's review points. This flow is used on every new book, so it deserves
strong control. Proposed rail with HARD checkpoints (agent cannot cross without the user):

```
1. adopt-standards        → propose kinds (F3: show them)         [auto]
2. propose-entities       → the pitch's core cast/places/powers   [auto]
   ── STOP ①: user reviews the story-bible inbox ───────────────
3. build-KG (project + entities→nodes)                            [auto]
4. propose-plan (spec)                                            [auto]
   ── STOP ②: user reviews the plan in Plan Hub, adjusts ───────  ← NO auto-compile here
5. compile (on user go)                                           [gated]
   ── STOP ③: user reviews the compiled outline ────────────────
6. write chapter (on user go)                                     [gated]
```
Principle: **automate the tedium (adopt/propose/build), HARD-gate the judgment (plan approval, compile,
before-writing).** That is exactly the user's "control strongly / the user shouldn't have to operate
too much" — the tedious setup is one-click, the decisions are protected. The current agent inverts this:
it makes the user click an opaque confirm (F3) for the tedium, then removes the user from every real
decision (F1).

---

## Next fix round — suggested order
1. **F1 + F2 together** (the rail + kill the run-on) — biggest user-facing win; establishes the
   stop-gates. Likely a chat-service rail/skill + a "one phase per turn, stop at a checkpoint" driver.
2. **F3** (adopt-standards card shows the kinds) — small, high-clarity.
3. **F4** (runtime badge state on a minted confirm) — small FE/state fix.
4. **F7/F8** (entity kind classification + book-tailored kinds) — glossary/extraction quality.
5. **F5/F6/F9** — peripheral, batch when convenient.

**Repro:** fresh book → co-writer → paste a 1-paragraph pitch → "set up the world for this story".
The agent will run F1 end-to-end. Book `019f84e1-…` holds the persisted evidence.
