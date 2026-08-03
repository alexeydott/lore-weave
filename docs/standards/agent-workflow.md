# Agent Workflow — how it is organised, how to contribute, how to make it yours

**Status:** active · **Adopted:** 2026-08-03 (PR #165 reconciliation) · **Enforced by:**
`scripts/agent-skills-parity.py` (pre-commit + CI), `scripts/gate-wiring-gate.py`

LoreWeave is worked by several people and several agents — Claude Code, Codex, Copilot,
Cursor. This document says where the process lives, why it is committed rather than kept
on each person's laptop, how to change it, and how to bend it to your own taste without
bending it for everybody else.

> ⚠️ **Two unrelated things are called "agent workflow".** *This* document is the **development
> process** — how a contributor and their agent move through a task in this repository.
> [`docs/specs/2026-08-03-agent-runtime-unification/`](../specs/2026-08-03-agent-runtime-unification/)
> is the **product's own agentic runtime** — how an MCP tool reaches the model at request time for
> a LoreWeave user. They share a word and nothing else. Neither indexes the other; check which one
> you are in before applying a rule from it.

---

## 1. Why the workflow is committed at all

The instinct to keep agent config personal is reasonable and it is wrong here.

When one person works alone, an agent's mistake is visible immediately — they are watching.
When four people and four agents work the same repository, a wrong turn is only visible if
the process that produced it is **versioned, diffable, and shared**. A rule that lives in
someone's private config produces behaviour nobody else can explain, reproduce, or correct.
A rule in git produces a commit you can blame, review, and revert.

So: **the workflow is a tracked artifact, and a mistake in it is a bug with a fix, not a
mystery.** That is the whole argument. Everything below follows from it.

The corollary matters just as much: because it is shared, changing it is a change to
*everyone's* behaviour, and it goes through review like any other change.

---

## 2. The three layers

| Layer | Lives in | Governs | Who it binds |
|---|---|---|---|
| **1 · Project rules** | `CLAUDE.md`, `docs/standards/**`, `.githooks/`, `scripts/*-gate.py` | what this project permits | everyone, every agent |
| **2 · Agent runner** | `.codex/`, `.agents/`, `.github/skills/`, `.ai-factory/`, `.claude/`, `.cursor/` | how an agent moves through work | whoever runs that agent |
| **3 · Personal** | `*.local.*`, `skill-context.local/` (git-ignored) | your own habits | you only |

**Precedence is strict and layer 1 wins.** A runner decides *how* to work; it never decides
what the project permits. Where an agent skill's general instruction conflicts with layer 1,
layer 1 wins and the conflict is a defect to report — not a judgement call to make in the moment.

Layer 1 outranks even itself in one direction: **the mechanical gates outrank the prose.**
`.githooks/pre-commit` and the `scripts/*-gate.py` family are scripts. If a gate blocks you,
fix the cause. Never `--no-verify`, and never "fix" a gate by weakening it — a check that
cannot fail is worse than no check, because it reports coverage and silences review.

---

## 3. We adopted AI Factory's organisation, and kept our own content

An honest comparison, because it decided the shape of this document.

**AI Factory (`aif-*`) is better organised than what we had.** One `config.yaml`; one uniform
skill shape; one override hook; one machine-readable result contract; one generator; one
self-improvement loop. Ours was more fragmented: **five** overlapping workflow runners
(`/loom`, `/raid`, `/warp`, `/amaw`, `/review-impl`) with no stated precedence, and **three**
documents describing the same twelve phases.

**Our content is better than theirs.** Our invariants were each paid for with a real incident —
a wiped production table, a tenancy hole where one user's edit changed every user's data, a
silent no-op that let an agent hallucinate success, twenty-seven recorded vacuous checks.
Generic best-practice text does not contain any of that.

So the direction is **merge ours into theirs**, not layer ours on top:

- **Binding happens in `.ai-factory/skill-context/<skill>/SKILL.md`** — their sanctioned
  extension point, which they define as winning over a skill's own defaults. Our rules live
  there, so a Codex user and a Claude user follow the same process without either tool being
  forked.
- **We adopted their `aif-gate-result` JSON contract** as the output shape for our own gates
  (`scripts/gate_result.py`; reference implementation in `scripts/agent-skills-parity.py`).
  Before, 48 gate scripts each printed prose in its own format, readable by a human reading
  one gate and by nothing else. Now a gate result is machine-consumable by whichever
  orchestrator a contributor is running.

One conflict that adoption already caught and fixed: `aif-implement` instructs *"Do not add
tests by default … when in doubt, prefer NO tests."* That is a reasonable default for a generic
tool and it is wrong here, where Phase 6 VERIFY is an evidence gate. It is overridden in
`.ai-factory/skill-context/aif-implement/SKILL.md`. **This is what an unreconciled runner
looks like: individually sensible, quietly pointing an agent away from the project's rules.**

---

## 4. Contributing to the workflow

### 4.1 Changing a project rule (layer 1)

A rule change binds everyone, so it is a normal reviewed change:

1. Put the rule where it belongs — `CLAUDE.md` for an always-loaded invariant, otherwise a
   file in `docs/standards/`.
2. **Add or update its row in [`docs/standards/README.md`](README.md).** That index is the
   one place a contributor looks to ask "is there a rule about X?". It links out and never
   duplicates.
3. **Give it a mechanism.** Prose does not survive contact with a busy week: measured on this
   repo, 9 of 19 deferrals were prose-only, and one fixed item was cited as an open blocker in
   four places *after* it was fixed. A rule that matters gets a gate script, an asserted test,
   or a `KNOWN_RED` row. Intent is not a mechanism.
4. **Prove the mechanism can fail.** Break the guarded thing, watch it go red, restore it,
   paste the output into the VERIFY evidence. "I added a test" is not evidence. See
   [`non-vacuity.md`](non-vacuity.md).

### 4.2 Changing an agent skill (layer 2)

The `aif-*` skills are **generated**, installed once per agent target
(`codex` → `.codex/skills`, `codex-app` → `.agents/skills`, `copilot` → `.github/skills`).
The three trees are renderings of one upstream source and differ only by install root,
`npx skills install --agent <name>` flag, and invocation sigil (`$aif-…` vs `/aif-…`).

**Do not hand-edit one copy.** It looks self-consistent, so nobody notices, and two
contributors on two agents silently follow two different processes. A later regeneration
then reverts your change without a word. `scripts/agent-skills-parity.py` blocks this at
pre-commit — it normalises the three documented substitutions away and requires the rest to
be byte-identical.

To change skill behaviour, in order of preference:

1. **Project override — the normal answer.** Write
   `.ai-factory/skill-context/<skill>/SKILL.md`. It is a mandatory read for that skill and
   wins over the skill's own defaults. Nothing is forked, and upstream stays upgradable.
2. **Upstream change + regenerate all three targets**, when the change belongs in the tool
   itself rather than in this project.
3. **A new project-local skill**, when no `aif-*` skill covers the need. Follow
   [`agent-extensibility.md`](agent-extensibility.md): storage → resolver → degrade-safe
   consumer → live E2E, no silent no-ops, closed-set capability args.

If a genuine upstream rendering quirk makes two copies differ, add a `KNOWN_RENDER_QUIRKS`
entry in the parity gate **with a reason**. That list is shrink-checked: the gate fails when
an entry is no longer needed, so it cannot quietly become a dumping ground.

### 4.3 Adding a gate

Gates are the load-bearing part, so they have their own rules:

- Emit results through `scripts/gate_result.py` (the shared `aif-gate-result` contract).
- Wire it into `.githooks/pre-commit`. `scripts/gate-wiring-gate.py` catches a gate script
  that was added but never wired — including the commit that adds only the script.
- Prefer **default-covered** scope. An enumerated file list is default-*un*covered: ask what
  happens to a file created tomorrow. Recursive discovery with explicit exemptions beats a
  hand-maintained inventory.
- Guard against your own vacuity. If the gate scans a tree, fail loudly when that tree is
  empty — otherwise "no files found" reads as "everything passed".

---

## 5. Personalising it — without forking anyone else's process

Use whatever agent you like. The personal layer is git-ignored, so your preferences never
land in someone else's checkout:

| You want | Put it in |
|---|---|
| Your own rules for an `aif-*` skill | `.ai-factory/skill-context.local/<skill>/SKILL.md` |
| Claude Code permissions/hooks for you only | `.claude/settings.local.json` |
| Codex settings for you only | `.codex/config.local.toml` |
| Editor settings | `.vscode/settings.json` |
| Personal agent notes | `AGENTS.local.md` |

Two limits, and they are the reason this stays workable:

- **A personal override may narrow, never widen.** You may make your own loop stricter, add
  checks, or demand more evidence. You may not switch off a project gate, skip a phase, or
  license yourself past an invariant. Effective behaviour is `AND(project_allows, you_enable)`.
- **If you find yourself overriding the same thing repeatedly, that is a signal about the
  shared rule, not about you.** Propose the change at layer 1 — that is how the process gets
  better instead of quietly diverging per person.

### Running someone else's tooling

MCP servers configured in `.vscode/mcp.json` and `.codex/config.toml` start via
`npx -y …@latest` — unpinned code fetched at run time — and the Postgres server binds
`$DATABASE_URL`. That is convenient and it is also a real supply-chain and blast-radius
consideration for every contributor who opens this repo. Know what you are starting; if your
`DATABASE_URL` points at anything you care about, review those files before letting a tool
launch them.

---

## 6. Known fragmentation — not yet resolved

Recorded here because an unrecorded known problem is one nobody can pick up:

- **Five workflow runners** (`/loom`, `/raid`, `/warp`, `/amaw`, `/review-impl`) with no stated
  precedence between them.
- **Three documents describing the same twelve phases** — `agentic-workflow/WORKFLOW.md`,
  `agentic-workflow/AMAW.md`, `docs/amaw-workflow.md`.
- **`docs/sessions/SESSION_HANDOFF.md` is ~8,900 lines**, in a repo whose own rule says to keep
  it short and archive the detail.

These are structural, so they get a plan rather than a drive-by edit: tracked as
`D-AGENT-WORKFLOW-CONSOLIDATION` in `docs/sessions/SESSION_HANDOFF.md`.

---

## 7. Quick reference

```bash
git config core.hooksPath .githooks       # once per checkout — enables every gate
python scripts/agent-skills-parity.py     # are the three skill trees still in lockstep?
python scripts/gate-wiring-gate.py        # is every gate script actually wired?
./scripts/workflow-gate.sh status         # where am I in the 12 phases?
```

| Question | Answer |
|---|---|
| What are the rules? | [`CLAUDE.md`](../../CLAUDE.md) |
| Is there a rule about X? | [`docs/standards/README.md`](README.md) |
| What is happening right now? | [`docs/sessions/SESSION_HANDOFF.md`](../sessions/SESSION_HANDOFF.md) |
| I use Codex/Copilot — where do I start? | [`AGENTS.md`](../../AGENTS.md) |
| How do I change a skill? | §4.2 — override in `skill-context/`, don't hand-edit a copy |
| How do I keep my own habits? | §5 — the `.local` layer |
