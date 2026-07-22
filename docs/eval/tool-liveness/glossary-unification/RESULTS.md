# Glossary catalog unification — live results (2026-07-22)

Spec: `docs/specs/2026-07-22-glossary-catalog-unification.md`. Harness: `discover_ab.py`
(feed ONLY the default-visible tools to a weak model, check which tool it picks).

## Catalog shrink (live-counted on the running container, glossary `/mcp` :8211)

| | before | after |
|---|---|---|
| default-visible (hot-set) | ~42 | **25** |
| legacy/hidden | 8 | **29** (20 newly-tagged this effort) |

**16 old tools → 4 unified surfaces:** `glossary_curation_list` (view enum ← 3 inbox
reads), `glossary_propose_curation` (op enum ← 4 curation proposes), `glossary_set_genres`
(target enum ← 3 genre setters), `glossary_get_entity.include` (← 4 entity-detail reads).

## Ambient-envelope smoke (the new tools are born `WithAmbientBook`)

`glossary_curation_list` called with **no `book_id` arg** + `X-Book-Id` header → resolved
from the envelope, `isError:false`. Cross-book Tier-A write guard on `set_genres`:
- cross-book, no `allow_cross_book` → `cross_book_confirm_required` + guidance (NOT applied)
- cross-book, `allow_cross_book:true` → grant-checked + applied
- ambient (no arg) → normal path

## Discoverability (gemma-4-12b, `google/gemma-4-12b-qat`, temp 0, N=4 runs)

Does a weak model pick the RIGHT unified tool + discriminator for a natural request, given
only the shrunk 25-tool catalog?

| scenario | expected | result |
|---|---|---|
| "show the merge candidates to review" | `curation_list` view=merge_candidates | ✅ 4/4 |
| "what AI-suggested entities need review?" | `curation_list` view=ai_suggestions | ✅ 4/4 |
| "list the unknown-kind entities to triage" | `curation_list` view=unknowns | ✅ 4/4 |
| "approve these draft entities as active" | `propose_curation` op=status_change | ✅ 4/4 |
| "merge duplicate X into Y" | `propose_curation` op=merge | ✅ 4/4 |
| "reassign entity to the 'character' kind" | `propose_curation` op=reassign_kind | ⚠️ 3/4 |
| "turn on the 'xianxia' genre" | `set_genres` target=book_active | ✅ 4/4 (after fix) |
| "show entity + revisions + evidence" | `get_entity` include=[revisions,evidence] | ✅ 4/4 |

**Aggregate: 7–8/8 per run.** The discriminator (view/op/target/include) is **always
correct when the tool is picked** — the enum design works. The lone variable is `reassign`:
on a request naming a specific kind ("reassign to the **'character'** kind") the model
sometimes calls `book_ontology_read` first to look up the referent — a defensible
read-then-act that a real multi-turn loop recovers from, not a naming defect.

### Finding that drove a fix
Initially "turn on the xianxia genre" mis-routed to `book_ontology_read` because
`set_genres`'s description led with the abstract *"Wire the genre MATRIX"*. Synonyms live
in `_meta` (NOT shown to the model), so the **description** must carry discovery — front-
loading *"Turn a book's genres ON or OFF … ACTIVATE or DEACTIVATE"* fixed it to 4/4.
General lesson: a unified tool's description must lead with the plain user action, not the
internal concept.

Run: `python discover_ab.py` (needs glossary `/mcp` :8211 + lm_studio :1234 with gemma-4).
