# Writing Studio pipeline guide

This is the user-facing guide to preparing an existing manuscript, recording intent,
and using Studio's Quality tools. Open panels through the Command Palette or the
Studio User Guide; panel names below identify capabilities, not a required dock layout.

**Verification scope:** checked against this checkout's source on 2026-11-09, including
uncommitted Studio changes. This is not a live acceptance test or a declaration that
any current book is prepared, fully analyzed, or safe to rewrite. Deployed builds may
differ. All examples are synthetic; no account, manuscript, or provider details are needed.

## 1. Keep the identities separate

| Resource | What it means | Do not substitute |
|---|---|---|
| Book and manuscript chapter (`book_id`, `chapter_id`) | Stored manuscript, chapter order, draft and revision history in book-service | An outline node ID |
| Co-writer Work / project (`project_id`) | Composition workspace and settings associated with the book; a book can also have derivative Works | Book ID, or an arbitrary derivative when preparing the canonical manuscript |
| Chapter outline node (`outline_node.id`, kind `chapter`) | Planned chapter intent linked to a manuscript chapter by `chapter_id` | The manuscript chapter itself |
| Scene outline node (`outline_node.id`, kind `scene`) | Durable scene intent; `parent_id` should identify its chapter outline node, while `chapter_id` links the manuscript chapter | A parsed manuscript scene ID |
| Parsed manuscript scene | A text-derived index leaf; its `source_scene_id` can point back to the durable scene outline node | The durable scene spec |
| Arc (`structure_node.id`, kind `arc`) | Structural grouping; chapter nodes link through `structure_node_id` | An outline parent or manuscript chapter |

A title match is not an identity match. A visible chapter list does not prove that
chapter outline shells exist. A scene visible by `chapter_id` does not prove correct
outline ancestry. Assigning chapters to arcs does not create manuscript prose.

## 2. Prepare an existing manuscript without replacing it

### A. Check the manuscript and Work

1. Import/open the manuscript through the book workflow. Inspect the chapter list,
   order, language, and actual saved draft text. Keep a recoverable copy/revision
   before structural changes or prose application.
2. Open the book in Studio and resolve/set up its co-writer Work if prompted. A
   pending knowledge project or an unavailable service is not a completed setup.
   Do not create duplicate Works to work around an outage.
3. Choose the intended active Work. Scene materialization resolves the book's
   **canonical** Work, not an arbitrary derivative branch. Check that the plan you
   inspect is the intended one.

### B. Create linked chapter shells before materializing scenes

Use **Plan Hub → Simple → Import plan** for an existing chapter plan. Rows match
existing manuscript chapters by `chapter_id`, or by `sort_order` when no ID column
is supplied. A title alone does not match a chapter.

Synthetic CSV shape:

```csv
sort_order,title,synopsis
1,Opening,Establish the central dilemma
2,Escalation,Make the first choice costly
```

Use the manuscript's actual sort values, not assumed row numbers. The current UI
parser splits at commas and lines; it is not a full quoted-CSV parser. Avoid commas
and multiline cells, including inside quoted synopses. Prefer explicit chapter IDs
when chapter order might change. Check unmatched rows yourself: some unmatched rows
can be dropped even when other rows import successfully.

The import creates missing chapter outline nodes with chapter links, titles,
synopses and order. It skips already-linked chapter shells; it does **not** update
an existing shell's synopsis. Review existing intent separately. This is not prose
import, AI decomposition, scene generation, or arc-template application.

Then run the deterministic scene-materialization/extraction action for the book
(the API calls it `materialize-scenes`). It reads **already parsed** manuscript
scenes and creates missing durable scene specs under chapter outline nodes when
those parents exist. It does not invent scene boundaries with a model or write new
prose. If there are no parsed scenes, first inspect the manuscript parser/index
workflow; repeatedly pressing materialize cannot manufacture parsed input.

Check the outcome, not just HTTP success: `work_resolved`, `scenes_total`, `created`,
`matched`, `skipped_authored`, and any detail. A pending project prevents minting;
existing authored nodes are left alone. A retry is intended to match prior nodes
rather than duplicate them.

### C. Repair already-orphaned scenes explicitly

**Materialization is not an ancestry repair operation.** When a scene already has a
source backlink or matches the chapter/order key, it is skipped/matched before parent
selection. Creating chapter shells afterward and rerunning materialize therefore does
not attach existing top-level scenes to them.

For each orphan, verify its durable node ID, manuscript `chapter_id`, intended chapter
outline ID, existing prose link and sibling order. Use the supported scene move/reorder
path to attach it to that chapter. Plan Hub supports scene-to-chapter moves for loaded
scene nodes; a root orphan absent from the canvas may require an authorized outline
operation rather than a visible drag target. Do not claim a GUI-only repair is available
for a node you cannot select.

The reorder operation can update parent, inherit the destination chapter link, and
renumber affected scene siblings transactionally. It supports version checks and rejects
cross-project parents and cycles. A generic parent-only patch is **not equivalent**:
it does not automatically synchronize `chapter_id` or sibling ordering. Never guess IDs,
recreate scenes to hide orphans, or bulk-edit database rows. On a conflict, reload and
inspect before retrying. Recheck parent, chapter link, order and prose anchors afterward;
this structural move is not a manuscript cut-and-paste operation.

### D. Add structure and authored intent deliberately

Use arcs to group chapter outline nodes through their arc association, not by making
an arc UUID a scene/chapter `parent_id`. Record chapter and scene goals, synopsis,
cast, beat roles and scene links where useful. A setup→payoff scene link records a
causal relationship; it is not automatically a narrative-promise ledger entry.

AI planning/decomposition and arc materialization are different pipelines from importing
shells and decompiling parsed scenes. Preview their scope and replacement effects before
applying them to an existing manuscript. Do not run a generation-oriented planner merely
to make a Quality panel nonempty.

## 3. Scene motifs: draft first, save deliberately

A scene motif says what pattern **this existing scene** is intended to realize. In the
scene motif editor, choose a motif and bind its roles to actual glossary entities.
Candidate selection and role changes remain a local draft until **Save**. **Cancel**
discards unsaved changes; a dirty editor asks for confirmation. An open editor retains
its original scene when selection changes, so check the displayed target before saving.
A loading/error state is not a free-form scene or an empty cast roster.

Motif suggestions use the UI's display language, independently of the manuscript language.
Changing that language changes the reading projection, not motif IDs or ranking scores.
Existing translations are read in a batch; opening suggestions does not generate paid
translations. An unavailable translation is explicitly marked as an original-language
fallback. A degraded ranking has a separate cause and an explicit retry action; retrying
can incur embedding usage and is never an automatic recovery loop.

Saving uses the scene-level `saveSceneMotif` path: bind/swap/clear the one scene's
ledger entry without instantiating beats or archiving scenes. It can auto-resolve roles;
explicit draft role selections (including clearing a role) are then written separately.

**The combined Save is not atomic.** The motif write and individual role writes are
separate requests. Some may succeed before another fails. The editor preserves retry
checkpoints and attempts to refresh persisted bindings. On a partial error, inspect the
server state and retry the unfinished changes. Cancel after a partial save does not roll
back successful writes. Do not interpret an error as “nothing changed.”

**Do not substitute chapter motif replacement.** A motif action on a chapter node uses
the heavy chapter swap: it archives old scene specs (preserving their prose), instantiates
the motif's beats as scenes, and can flag orphaned threads. That is a structural rewrite,
not a harmless way to attach a motif to one scene. Review its explicit scope and undo
information independently.

### Reference shelf: inspect entity use in the plan

In Plan Hub, open **Source shelf** and use the **Glossary entity** picker
(**Choose an entity**) to inspect an existing entity's plan references. The eight
source lanes are outline POV, outline present entities, scene POV, scene present
entities, structure roster, motif applications, canon rules, and narrative threads.
These are existing spec-only references, not manuscript-prose search or a knowledge-graph
scan. Narrative threads are **indirect context**: the entity participates in the node
where the thread opened; this does not establish a direct entity–thread relationship.

Successful lanes show exact counts with bounded reference samples. **Show more** raises
the sample limit from 20 up to 100; a capped list is not the complete reference set.
A per-source error means unavailable evidence, **not zero references**. Inspect the
source and readable IDs before drawing conclusions. Outline/scene POV and present-entity
references select their plan node; narrative-thread references use the existing thread
navigation action. Helper citations support those same targets. Other kinds expose
readable labels, not invented editor or canvas links. Some roster and motif applications
without titles use their localized source-group label rather than a raw technical identifier.

**Ask AI helper** is a separate, explicit action with a paid-use warning. Without an
explicit picker override, the server resolves the canonical book chat model, then the
account default; inspect the disclosed model/fallback before asking. Reading the shelf
does not invoke a model. The helper makes a bounded, single-pass grounded explanation
using only provided reference IDs for citations. It is not an exhaustive book audit,
autonomous tool loop, or proof that missing references do not exist. It writes no plan
or manuscript content, applies no prose, and does not change the inherited model setting. Review its
citations and any source errors rather than treating its answer as author-approved truth.
These paths are source-described, not live-tested acceptance evidence.

### Embedding settings and ranking status

The effective **embedding role** for a book/account, a reference corpus's **pinned
embedding space**, and the shared motif/arc library's **platform space** are different
concepts. Changing a default must not silently repin an existing reference corpus or
compare vectors made by different models. Private suggestions use the effective
book/account role; shared-library ranking retains its separate platform space.

A fallback ranking is not a semantic match percentage. Inspect its reported reason:
missing configuration, unavailable settings, a provider failure, an empty query, or
unavailable vectors require different recovery actions. An unavailable provider does
not mean that no model is configured. A loading or failed model-list request likewise
cannot establish that a book has no inherited embedding model. Choose a model
explicitly, or use the resolved inherited selection, when creating a new reference
corpus; do not select the first available model merely to dismiss a warning.

### Local shared-library embedding setup

The composition API and worker must use the same `MOTIF_EMBED_MODEL_SOURCE=user_model`,
`MOTIF_EMBED_MODEL_REF`, and `MOTIF_EMBED_OWNER_ID`. Compose's development UUIDs are
placeholders, not provisioning. Resolve an active embedding-capable user model and its
active credential through supported registry APIs under the intended owner. Shared-library
calls are billed to that owner; using a personal/test account requires explicit approval
and does not change that account's book defaults.

Keep actual IDs in the deployment's ignored local environment file, not tracked templates.
Do not run `scripts/seed_platform_embed_model.sh` as a repair: it copies another account's
credential through direct database access. Do not copy credentials or repurpose an arbitrary
user's model. Metadata verification must precede a separately authorized inference check.
A configured pair that returns an owner-scoped registry 404 is not eligible; model absence,
wrong ownership, and inactive model/credential can share that response.

Apply the pair to both composition services without restarting unrelated dependencies or
interrupting active jobs. A model change makes older shared vectors stale; retain model/hash
freshness checks and bounded backfill rather than comparing incompatible vectors or launching
a full-library re-embedding implicitly. Verify a real semantic result, not just HTTP 200 with
a genre fallback. Private suggestions continue to use their owner's effective embedding role.

## 4. Narrative promises are not promise coverage

**Narrative promises** are tracked `narrative_thread` records: open questions, setups and
payoffs that can be opened, progressed and paid. Enable narrative-thread tracking on the
Work when prompted. Analyze selected existing chapters, or deliberately choose a batch,
using the displayed model. Detection can update the ledger; it is not just a report.
Review failures and degraded results before trusting counts.

The promises assistant produces a temporary chapter report with candidate promises and
other diagnostics. Review its suggestions and explicitly **Adopt** selected promises (or
all only after review) to create ledger entries. Merely running the assistant does not
adopt them, and switching scope clears its temporary report. Neither adoption nor marking
a promise paid rewrites the manuscript or proves that a reader-visible payoff exists.

**Promise coverage** instead derives a tracked promise set from the rendered outline
plan and scores the assembled manuscript against it (paid/progressing/abandoned/absent).
It is a model-backed diagnostic, not the ledger and not an automatic reconciliation of
thread statuses. Supply meaningful connected outline intent and saved manuscript prose.
An empty or disconnected plan cannot establish that the book has fulfilled its promises.

**Corpus completeness is fail-closed in the current source:** failed chapter-draft reads
are counted as `failed_chapters`. When that count is nonzero, the coverage worker returns
`coverage_unavailable` with the failure count, without calling the model or calculating
whole-book verdicts. The UI reports that chapter drafts could not be read. Restore access
and retry; this is unavailable coverage, not evidence of absent or abandoned promises.
Successfully read but empty chapters contribute no prose; an entirely empty book with no
read failures returns `EMPTY_BOOK`. Compare the nonempty chapter count with the intended
scope and investigate missing text. A favorable model result remains advisory, not
certification that a particular book is fully prepared. Older deployments or persisted
jobs created before the completeness field may not carry this protection.

## 5. Canon: inspect sources before changing rules or prose

Canon has several inputs, not one universal green light:

- Authored glossary entities/facts and extracted, story-positioned knowledge provide
  different information. Review evidence and identity anchors; extraction is not an
  automatic promotion of every statement to author-approved truth.
- **Canon rules** are explicit author-declared constraints associated with the Work.
  Create/edit/archive/restore rules in the dedicated tool. Check scope and story-order
  windows; a rule valid later need not be valid earlier. Rule authoring is not an AI pass.
- **Canon issues** merges three existing finding lanes: critic violations of authored
  rules, generation-time entity-continuity checks, and knowledge-extraction contradiction
  flags. These lanes have different producers and may not all have run.

Follow a finding to its chapter, evidence or rule. Correct the intended source (a mistaken
rule, wrong entity/evidence, or actual prose) rather than weakening canon merely to clear a
badge. Rule edits do not retroactively recompute old findings. Inspect timestamps, missing
source warnings and truncation. “No issues” means no findings in the successfully consulted
lanes, not that every chapter has passed every kind of canon analysis.

## 6. All eight Quality tools: prerequisites and effects

For Work-backed tools, first resolve the book's intended ready co-writer Work and the
necessary permissions. Reading a report and running a new analysis are separate actions.
Model-backed actions need an available effective model; inspect the picker/cascade and
pricing rather than assuming the first/default selection is free.

| Tool | Prerequisites and useful input | What it does; what it does not do |
|---|---|---|
| **Narrative promises** (`quality-promises`) | Ready Work; tracking enabled; saved chapter text and model for detection/assistant | Reads/updates the thread ledger; selected/all-chapter analysis can spend. Assistant candidates require explicit adoption. No prose apply. |
| **Critic** (`quality-critic`) | Ready Work; selected saved chapter; model; meaningful canon/context where available | Fresh model-backed coherence, voice, pacing and canon critique, plus chapter thread audit. Batch analysis is a separate scope choice. Inspect partial/degraded/scope warnings; scores are not edits. |
| **Promise coverage** (`quality-coverage`) | Ready Work; meaningful outline plan; saved nonempty manuscript; model | Model-backed plan-vs-book scoring, potentially multiple windows/calls. Read-only diagnostic; failed draft reads return unavailable coverage without a model call, while successfully read empty drafts add no prose. Not the thread ledger or full-book certification. |
| **Canon issues** (`quality-canon`) | Book access; relevant generation/critic/extraction findings must already exist | Reads three finding lanes; extraction flags may still be available without a Work. Missing Work/service/lane results are not a clean bill of health. No automatic repair. |
| **Canon rules** (`quality-canon-rules`) | Ready Work; edit rights for authoring; intentionally scoped rules | Create/edit/archive/restore author constraints; links to existing violations. No model needed for CRUD and no automatic rejudge or prose rewrite. |
| **Corrections** (`quality-corrections`) | Ready Work and recorded AI-generation acceptance/edit/rejection history | Reads correction statistics. An imported manuscript without those decisions can legitimately have no rates. Not a detector or prose-fixing action. |
| **Heal / Polish** (`quality-heal`) | Ready Work; chosen saved chapter; model; recoverable original | Runs a proposal pass, lets you review/select fixes, then separately Apply to that chapter draft. Deterministic fixes start checked, semantic fixes unchecked; still review both. See the rich-text warning below. |
| **Conformance** (`quality-conformance`) | Ready Work; manuscript chapter; linked scene specs and meaningful planned motif/beat input; realized prose for comparison | Reads planned/realized traces and prior snapshots. Re-run needs a model and estimate→confirm; it judges prose against plan, not arc-template similarity. Regenerate to beat is a separate model-backed generation action, not manuscript acceptance. |

### Heal has a material rich-text limitation

Studio Heal Apply converts the accepted flat text into paragraph nodes and stores a
chapter draft. It cannot reconstruct headings, marks, or `attrs.sceneId` scene anchors.
**Applying even a small fix may flatten the whole chapter's rich structure and anchors.**
Prefer manually applying reviewed changes in the editor when those structures matter;
keep a recoverable original and verify the resulting document/index if using Heal Apply.

Apply sends the analyzed `draft_version` as `expected_draft_version` **when available**.
A conflict/412 means the chapter changed: reload and rerun Polish, then review again.
Do not force an old proposal over newer edits. The client omits this guard if no version
was returned, so do not treat conflict protection as unconditional.

## 7. Cost and prose-application boundaries

**No model call** is made merely to read panels/results, edit structure/scene links,
import chapter shells, materialize already-parsed scenes, save a scene motif/roles,
author canon rules, or read correction statistics. These actions can still mutate data;
“no model call” does not mean “read-only” or “free of infrastructure/storage costs.”

**Potential model spend** includes planning/decomposition, promise detection/assistant,
critic, coverage, Polish, conformance re-run, extraction/enrichment when requested, and
scene generation/regeneration. Batch scopes multiply work, and a single diagnostic may
make several calls. Polish's optional AI auto-tick/rerank adds an extra call per edit;
leave it off unless you intentionally want that additional analysis. Check the effective
model and scope before starting; an estimate is not a final invoice or proof of a zero-cost backend. Conformance explicitly uses an
estimate/confirmation flow; do not assume every other Run button has a second confirmation.
Stopping a batch does not refund or undo already completed/in-flight work.

Keep three boundaries distinct:

1. **Save intent** persists plan/motif/rule/ledger data.
2. **Analyze or generate** produces findings, proposals, or generated scene output; some
   runs also persist diagnostics or ledger changes, but that is not manuscript acceptance.
3. **Apply/accept/assemble into the manuscript** is an explicit write to draft prose.
   Review the target chapter, resulting text and revision first. In particular,
   conformance's Regenerate to beat uses scene generation; review generated output and
   the appropriate acceptance/assembly workflow separately. Rerunning a judge is not apply.

## 8. Freshness, conflicts, and honest empty states

- Save current editor changes before analyzing saved drafts. A result describes the
  input snapshot, not every later edit. Revisit checks after changing prose, order,
  intent, motif roles or canon. Inspect conformance's last-run timestamp and Critic's
  scope warnings; cached batch entries are not a fresh quality certificate.
- Keep the book, Work, chapter, scene and effective model visible while acting. A
  late response for another scope must not be used as evidence for the current one.
- On version/412 conflicts, reload server truth, compare with the intended change,
  then retry against current data. Structural undo is limited and is itself another
  write, not a replacement for revision history or a complete transaction rollback.
- Distinguish **loading**, **unavailable**, **not configured**, **not run**, **no input**,
  **degraded/partial**, and **successfully read but empty**. Do not click setup repeatedly
  when a service cannot be reached, or generate replacement content just to clear a warning.
- No scenes can mean no parsed input, no materialization, a pending project, the wrong
  Work, collapsed/unloaded nodes, or missing ancestry—not “the manuscript has no scenes.”
- No motifs, roles, promises, corrections or canon findings can be a valid starting state.
  Unknown/failed reads must not be relabeled as that valid empty state. Missing beat intent
  means there may be nothing meaningful to judge, not automatic conformance.
- Inspect chapter counts, pagination/cap warnings, individual batch failures, source
  availability and report errors before making any claim about a whole book.

## Source verification map

These links identify implementation evidence, not additional competing user guides.
Paths are relative to this document; behavior can change with the checkout.

- [Plan Hub import UI](../frontend/src/features/studio/panels/PlanHubPanel.tsx),
  [chapter-shell import and outline routes](../services/composition-service/app/routers/outline.py),
  [scene materializer](../services/composition-service/app/engine/scene_decompile.py).
- [Outline identity, updates and reorder](../services/composition-service/app/db/repositories/outline.py),
  [Plan Hub move controller](../frontend/src/features/plan-hub/hooks/usePlanMoves.ts).
- [Scene motif draft/partial-save handling](../frontend/src/features/composition/motif/hooks/useSceneMotifDraft.ts),
  [retained motif editor scope](../frontend/src/features/composition/motif/hooks/useSceneMotifEditor.ts),
  [scene versus chapter motif routes and coverage assembly](../services/composition-service/app/routers/plan.py).
- [Quality hub's eight tools](../frontend/src/features/studio/panels/QualityHubPanel.tsx),
  [Work resolution states](../frontend/src/features/studio/panels/useQualityWork.ts),
  [promise detection and adoption UI](../frontend/src/features/studio/panels/QualityPromisesPanel.tsx),
  [critic and batch UI](../frontend/src/features/studio/panels/QualityCriticPanel.tsx),
  [coverage scoring engine](../services/composition-service/app/engine/quality_report.py),
  [coverage worker's fail-closed guard](../services/composition-service/app/worker/operations.py).
- [Canon finding sources](../frontend/src/features/studio/panels/useQualityCanon.ts),
  [canon-rule authoring](../frontend/src/features/studio/panels/QualityCanonRulesPanel.tsx),
  [correction statistics](../frontend/src/features/studio/panels/QualityCorrectionsPanel.tsx),
  [Heal conversion and Apply](../frontend/src/features/studio/panels/QualityHealPanel.tsx).
- [Conformance run/confirmation controller](../frontend/src/features/composition/motif/hooks/useConformanceTrace.ts),
  [conformance display](../frontend/src/features/composition/motif/components/ConformanceTraceView.tsx),
  [scene regeneration API handoff](../frontend/src/features/composition/motif/api.ts).

No live mutation, paid model call, private-book inspection, or end-to-end run was performed
to produce this guide. Source inspection establishes implemented paths and limitations;
it does not establish that a particular deployment, provider, parser run or book is ready.
