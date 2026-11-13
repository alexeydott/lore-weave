"""Round 3 (Python) — Codex cross-check findings F9 and F11.

F11: `consistency_audit` returns `{"critical": list[str], ...}` — plain strings —
but `PlanForgeService.self_check` calls `c.get("field")` / `c.get("issue")` on
each entry, so any spec that actually FAILS the audit crashes self-check with
`AttributeError: 'str' object has no attribute 'get'`.

F9: `handoff_autofix` builds its refine revision from the self-check gaps'
`path` verbatim. Those paths are rule/check IDs (`thr_no_early_explain`,
`synopsis_<title>`, `mech_0_rules`, ...) — not spec paths — and neither
`spec_slice_for_paths` nor `merge_refine_output` recognises them, so the LLM
is shown an empty slice and its repair is merged into nothing: the autofix
round is silently dropped.
"""

from __future__ import annotations

import copy
import uuid
from types import SimpleNamespace

from app.engine.plan_forge.refine import merge_refine_output
from app.engine.plan_forge.spec_index import spec_slice_for_paths, translate_gap_paths
from app.services.plan_forge_service import PlanForgeService

# A minimal spec that FAILS the audit AND a rule, with no source document:
# - the arc_2 event explains THR (a past-life secret, explained) too early, so
#   `consistency_audit` reports a critical and `thr_no_early_explain` fails;
# - `doc_md` is "" so the fidelity gaps are empty and self_check MUST take the
#   audit/rules branch (the branch that crashes on F11).
AUDIT_SPEC = {
    "layers": {
        "characters": [{"name": "Mira", "traits": ["mundane"], "baseline_notes": ""}],
        "mechanics": [{"id": "mech_1", "name": "Resonance", "rules": ["Share heat."]}],
        "variables": [
            {"code": "PA"}, {"code": "HA"}, {"code": "CD"}, {"code": "THR"},
        ],
    },
    "charter": {"consistency_anchors": ["mundane baseline"], "forbids": []},
    "arcs": [{"id": "arc_2", "arc_kind": "discovery", "theme": "discovery", "title": "Arc 2"}],
    "events": [
        {"id": "ev_2_1", "arc_id": "arc_2", "title": "First Step",
         "synopsis": "The THR secret: her tiền kiếp giải thích unfolds before her.",  # doc-language-gate: ok -- Vietnamese trigger phrases the audited rules match on; test data, not exposition
         "goal": "", "var_deltas": [{"variable": "THR", "reason": "tiền kiếp giải thích"}],  # doc-language-gate: ok -- same trigger phrases as above
         "planner_notes": ["note the gate"]},
        {"id": "ev_2_2", "arc_id": "arc_2", "title": "Second Step",
         "synopsis": "She walks on.", "goal": "", "var_deltas": [],
         "planner_notes": []},
    ],
    "meta": {"open_questions": ["q1", "q2", "q3", "q4", "q5", "q6"]},
    "links": [],
}


def _spec_with_thr_explanation() -> dict:
    return copy.deepcopy(AUDIT_SPEC)


class _StubRuns:
    """Minimal PlanRunsRepo stand-in: one run, one spec artifact, no document."""

    def __init__(self, spec: dict) -> None:
        self._spec = spec

    async def get_for_book(self, book_id, run_id):
        return SimpleNamespace(
            id=run_id, source_markdown="", active_job_id=None,
            genre_tags=[], status="done",
        )

    async def latest_artifact(self, book_id, run_id, kind):
        if kind == "spec":
            return SimpleNamespace(id=uuid.uuid4(), content=self._spec)
        return None


def _service(spec: dict) -> PlanForgeService:
    return PlanForgeService(_StubRuns(spec), jobs=None, works=None)


# ── F11 ──────────────────────────────────────────────────────────────────────

async def test_self_check_survives_an_audit_critical():
    """A spec whose arc_2 event explains THR too early must come back as gaps,
    not as `AttributeError: 'str' object has no attribute 'get'`."""
    svc = _service(_spec_with_thr_explanation())
    book_id, run_id = uuid.uuid4(), uuid.uuid4()

    out = await svc.self_check(uuid.uuid4(), book_id, run_id)

    assert out is not None
    errors = [g for g in out["gaps"] if g["severity"] == "error"]
    assert errors, f"the audit critical never surfaced as a gap: {out['gaps']!r}"
    assert any("past-life" in g["message"] or "THR" in g["message"] for g in errors), (
        f"audit message lost: {errors!r}")


# ── F9, engine level ─────────────────────────────────────────────────────────

def test_rule_id_gap_translates_to_real_spec_paths():
    """`thr_no_early_explain` is a rule ID, not a location. The translator must
    resolve it to the arc_2 events it is about, so the refine can see them."""
    spec = _spec_with_thr_explanation()

    paths = translate_gap_paths(["thr_no_early_explain"], spec)

    assert paths == ["events[ev_2_1]", "events[ev_2_2]"], f"untranslated: {paths!r}"
    assert all(p.startswith("events[") for p in paths)


def test_translated_paths_produce_a_nonempty_slice_and_a_landing_merge():
    """End-to-end at the engine level: translate → slice → LLM patch → merge.
    Before the fix the slice was `{}` and the merge returned the spec
    untouched, so the repair was silently dropped."""
    spec = _spec_with_thr_explanation()
    paths = translate_gap_paths(["thr_no_early_explain"], spec)

    slice_ = spec_slice_for_paths(spec, paths)
    assert "ev_2_1" in slice_, f"the refine prompt saw an empty slice: {slice_!r}"

    patch = {"events[ev_2_1]": {**spec["events"][0],
                                "synopsis": "She walks on, remembering nothing."}}
    merged = merge_refine_output(spec, patch, {"focus_paths": paths})
    assert merged["events"][0]["synopsis"] == "She walks on, remembering nothing."
    assert merged["events"][1] == spec["events"][1], "an untouched event moved"


def test_new_path_shapes_slice_and_merge():
    """The translator also emits `layers.variables`, `arcs[<id>]`, `charter`
    and `meta.open_questions` — the slice/merge pair must recognise them too,
    or those repairs drop the same way the rule IDs did."""
    spec = _spec_with_thr_explanation()

    assert "PA" in spec_slice_for_paths(spec, ["layers.variables"])
    assert "arc_2" in spec_slice_for_paths(spec, ["arcs[arc_2]"])
    assert "mundane baseline" in spec_slice_for_paths(spec, ["charter"])
    assert "q1" in spec_slice_for_paths(spec, ["meta.open_questions"])

    merged = merge_refine_output(
        spec, {"layers.variables": [{"code": "PA"}, {"code": "HA"}]},
        {"focus_paths": ["layers.variables"]})
    assert [v["code"] for v in merged["layers"]["variables"]] == ["PA", "HA"]
    merged = merge_refine_output(
        spec, {"arcs[arc_2]": {**spec["arcs"][0], "arc_kind": "mystery"}},
        {"focus_paths": ["arcs[arc_2]"]})
    assert merged["arcs"][0]["arc_kind"] == "mystery"
    merged = merge_refine_output(
        spec, {"charter": {"consistency_anchors": ["new anchor"], "forbids": []}},
        {"focus_paths": ["charter"]})
    assert merged["charter"]["consistency_anchors"] == ["new anchor"]


def test_untranslatable_gap_paths_drop_out_instead_of_poisoning_focus():
    """A gap no rule knows (e.g. `premise_max`, which is about the package,
    not the spec) must not reach the refine as a focus path: an unrecognised
    path focuses the slice on nothing. Dropping it lets the remaining gaps
    focus the refine — or, when nothing translates, the empty focus falls back
    to the full-spec refine."""
    spec = _spec_with_thr_explanation()

    assert translate_gap_paths(["premise_max"], spec) == []
    assert translate_gap_paths(["audit_critical"], spec) == ["events[ev_2_1]", "events[ev_2_2]"]
    assert translate_gap_paths(["mech_0_rules"], spec) == ["layers.mechanics[mech_1]"]
    assert translate_gap_paths(["char_trait_count"], spec) == ["layers.characters[0]"]
    assert translate_gap_paths(["synopsis_First_Step"], spec) == ["events[ev_2_1]", "events[ev_2_2]"]


# ── F9, service level ────────────────────────────────────────────────────────

async def test_handoff_autofix_refines_real_paths_not_rule_ids(monkeypatch):
    """The loop that actually ships: self_check finds the rule gap, and the
    revision handed to refine() must carry spec paths the slice/merge pair
    understands — never the raw rule ID."""
    svc = _service(_spec_with_thr_explanation())
    captured: dict = {}

    async def _fake_refine(created_by, book_id, run_id, *, model_ref, revision, focus_paths):
        captured["revision"] = revision
        return "sync", {"status": "applied"}

    monkeypatch.setattr(svc, "refine", _fake_refine)

    async def _done(*args, **kwargs):
        return {}

    monkeypatch.setattr(svc, "get_run_detail", _done)

    out = await svc.handoff_autofix(
        uuid.uuid4(), uuid.uuid4(), uuid.uuid4(),
        model_ref=uuid.uuid4(), max_rounds=1,
    )

    assert out is not None
    focus = captured["revision"]["focus_paths"]
    assert focus, "autofix refined with no focus at all"
    assert all(p.startswith(("events[", "layers.", "arcs[", "charter", "meta."))
               for p in focus), f"raw rule/check ID reached refine: {focus!r}"
    assert "thr_no_early_explain" not in focus
    assert any(p.startswith("events[ev_2_") for p in focus), (
        f"the THR repair was not aimed at the arc_2 events: {focus!r}")
