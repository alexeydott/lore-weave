# Spec — Studio Context Binding (ambient book/project scope for in-system agents)

- **Date:** 2026-07-22
- **Status:** DESIGN (checkpoint) — Q1–Q4 decided (§4); ready to build book-first pilot on approval
- **Size:** L (cross-cutting: chat-service envelope + `loreweave_mcp` SDK identity + every domain tool's id-resolution; no DB migration)
- **Governs:** MCP-tool-io (IN-*), User Boundaries & Tenancy (the scoping cascade), SEC-1 (identity from envelope, never a tool arg), settings-and-config (SET resolution cascade — same shape).

---

## 1. Problem

When an in-system agent runs **inside the writing studio**, it is already bound to one book — yet every MCP tool takes `book_id` (and often `project_id`/`chapter_id`) as an **explicit arg the model must produce**. For a weak model this is a real error + cost surface, and it doesn't match the user's mental model ("I'm working on THIS book").

### 1.1 What exists today (as-built — honest baseline)

A **prose-note + arg-repair patchwork**, not an architecture:

1. The session resolves `{book_id, chapter_id, project_id}` from the studio context (`stream_service.py` ~3802/4115/4257).
2. The model is told the id **in prose**: `"You are working inside book_id=…"` (~4260) — and must **transcribe** it into each call.
3. `_inject_context_ids` (~1188) repairs at dispatch, **conservatively**:
   - fills the id when the model **omits** it (only if the tool's schema declares the key),
   - overrides a **non-UUID mistranscription** with the known id,
   - **honors a valid but different UUID** — treated as a deliberate cross-book call, never silently redirected.

Measured failures this was built for (gemma-4-26b): `{}` → `VALIDATION: missing book_id` retry loop; `book_id="019f5239…e6"` (one char added) → `400 book_id must be a UUID`; scalar id wrapped as `[uuid]`. Real, recurring, weak-model-specific.

### 1.2 Why it's a patch, not the design

- The scope lives in the **client** (chat-service) as **per-arg** injection for **3 ids only** (`book_id`/`chapter_id`/`project_id` — not `world_id`/`arc_id`/`work_id`), tool-by-tool, only when the schema declares the key.
- The **tool schema still requires `book_id`**, so the model is still prompted to produce it — the repair catches *some* failures but the model still spends reasoning/tokens on a UUID it should never touch.
- `project_id`/`work_id` are passed **alongside** `book_id` (the model juggles up to 3 ids) instead of being **derived** from the one thing that matters (the book).
- The envelope carries identity (`X-User-Id`, `X-Session-Id`, `X-Trace-Id`, `X-Mcp-Key-Id` — `sdks/go/loreweave_mcp/identity.go`) but **no book scope** — so each domain service is blind to the ambient book; only the chat-service client knows it.

### 1.3 The framing that unlocks it

"Ép" (force) conflates two very different things:
- **(a) ambient default** — inject the scope so the agent needn't pass it, can't get it wrong;
- **(b) hard sandbox** — forbid the agent from touching any other book.

The **Cursor/Claude-Code lesson is about (b)**: they dropped the *restriction* (ineffective + inconvenient) but **kept the workspace/CWD as an ambient default (a)**. This spec does **(a), never (b).**

**Security is already handled elsewhere** — identity is enveloped (SEC-1) and every tool `grant`-checks the user against the book. A user can only touch books they hold a grant on, regardless of what `book_id` is passed. ⇒ Binding is **not** a safety mechanism; its whole value is **correctness/ergonomics + matching the user's "I'm in this book" model.** That removes any temptation to build a wall.

---

## 2. Design — promote the ambient scope into the envelope (like identity)

### 2.1 Envelope scope

Add `X-Book-Id` (and only that — see §2.3) to the MCP envelope, lifted into the tool ctx exactly like `X-User-Id`:
- `sdks/go/loreweave_mcp/identity.go` — new `HeaderBookID = "X-Book-Id"`; `IdentityMiddleware` lifts it into ctx; add `BookIDFromCtx(ctx)` mirroring `UserIDFromCtx`. (Python SDK mirror.)
- chat-service, on a **book-bound surface**, sets `X-Book-Id` on the tool-call envelope from the session's resolved book — the same place it already sets `X-User-Id`.
- **External/global agents** simply don't send the header (they have no bound surface).

### 2.2 Server-side resolution cascade (per tool, replaces the client-side patch)

Each tool resolves its effective book as a cascade (mirrors the User-Boundaries tier cascade + SET-* resolution):

```
effective_book_id =
   explicit arg, if present AND a valid UUID          # deliberate call (incl. cross-book) wins
   else envelope X-Book-Id, if present                # ambient default (the studio binding)
   else → required-arg error                          # external agent that passed nothing: fail-closed
```

- **Omitted arg on a bound surface** → resolves from the envelope. The model **need not emit `book_id` at all** — this *eliminates* the transcription burden rather than repairing it.
- **Non-UUID arg + envelope present** → envelope wins (repair; same as today's S02 override).
- **Valid different UUID** → honored (deliberate cross-book), grant-gated — **soft, never a wall.** On a bound surface the tool MAY return a `scope_note` ("acting on a different book than the studio") so the client can surface/confirm — advisory, not blocking (§ open Q1).
- **Neither arg nor envelope** → fail-closed with a clear required-arg error. **Never** act on a null/guessed book (no silent seam).

### 2.3 Derive project_id / work_id — don't pass them

A studio agent should deal with **one** concept: "this book." `project_id`/`work_id` are **derived server-side** from `effective_book_id` via the canonical-Work resolver (`work_resolution.ensure_work` / `canonical_work`), reusing the pending-vs-absent semantics already there. So:
- **Studio agents never pass `project_id`/`work_id`** — 3 ids the model juggled → **0**.
- **External agents** still pass them explicitly (no envelope, no derivation context).
- This is why only `X-Book-Id` goes in the envelope: book is the root; the rest derive.

### 2.4 Tool-schema shape (bound vs global)

Two options (§ open Q2):
- **(A) Keep `book_id` in the schema as `required`, resolve server-side.** Lowest churn; the model *may* still emit it; the cascade covers omission. External contract unchanged.
- **(B) Advertise `book_id` as optional on a bound surface** (the chat-service surface builder drops it from `required` / annotates "resolved from studio context"), so the model is never even asked for it. Strongest ergonomics; the surface already rewrites advertised tools per-surface (hot-set), so this is a natural extension. External surface keeps it required.

Lean **(B)** for the bound surface (kills the burden at the source), **(A)** as the safe fallback everywhere else.

### 2.5 What the S02 patch becomes

`_inject_context_ids` stays as **belt-and-suspenders** during migration (it still repairs a mistranscription on any surface), but the *primary* mechanism moves to the envelope + server cascade. Once tools resolve from the envelope, the prose `book_context_note` can shrink to a plain "you are in book «Title»" (human-readable, not a UUID to transcribe).

---

## 3. What changes where

| Layer | Change |
|---|---|
| `loreweave_mcp` (Go + Py SDK) | `HeaderBookID` + lift into ctx + `BookIDFromCtx`; a shared `ResolveBookScope(argBookID, ctx)` helper implementing the cascade + the `scope_note` on cross-book |
| chat-service | set `X-Book-Id` on the bound-surface envelope (where `X-User-Id` is set); optionally drop `book_id` from `required` on the bound advertised surface (option B); shrink the prose UUID note |
| domain tools (book/glossary/composition/kg) | replace `book_id`-from-arg with `ResolveBookScope(...)`; derive `project_id`/`work_id` from the book instead of taking them (studio path) |
| ai-gateway | forward `X-Book-Id` alongside the identity headers (same threading as `X-User-Id`) |

No DB migration. No new table. Grants unchanged (still the security boundary).

---

## 4. Decisions (PO 2026-07-22)

- **Q1 — cross-book on a bound surface → RESOLVED: allow + soft confirm.** A valid different `book_id` is still honored (grant-gated), but the tool returns a `scope_note` and the client surfaces a soft confirm ("You're in «A» — apply to «B»?"). Not a wall; matches the user's mental model. (§2.2.)
- **Q2 — schema shape → RESOLVED: drop `book_id` from `required` on the bound surface (option B).** The chat-service surface builder omits `book_id` from `required` (annotated "resolved from studio context") when advertising to a book-bound surface, so the model is never asked for it. The external/global surface keeps it `required`. (§2.4.)
- **Q3 — first cut → book-first pilot** (`book_*`, where we just measured), then fan out to glossary/composition/kg — mirrors the visibility:legacy rollout.
- **Q4 — measurement → re-run the gemma-4 harness** with the bound surface (`book_id` omitted entirely) vs today (model transcribes it) → expect fewer tokens + zero mistranscription retries. Same method as the manuscript-structure eval.

---

## 5. Non-goals

- **No hard sandbox** (the Cursor/CC anti-pattern). Cross-book stays possible, grant-gated.
- **No change to the security model** — grants remain the boundary; this is ergonomics only.
- **No change for external/global agents** — they pass ids explicitly, exactly as today.

*Design checkpoint. Verified against `stream_service.py` (_inject_context_ids / prose note / session resolution) + `identity.go` (envelope headers). Decide Q1–Q4, then build book-first + measure.*
