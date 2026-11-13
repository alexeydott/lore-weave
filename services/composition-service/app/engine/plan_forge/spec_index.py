"""Searchable index over NovelSystemSpec for fuzzy feedback scope location."""

from __future__ import annotations

import re
from typing import Any


def build_spec_index(spec: dict[str, Any], section_map: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []

    char = ((spec.get("layers") or {}).get("characters") or [None])[0]
    if char:
        entries.append(
            {
                "path": "layers.characters[0]",
                "label_vn": "Nhân vật / character seed",
                "section_id": "1.3",
                "keywords": ["nhân vật", "character", "traits", "baseline", "§1"],
                "excerpt_preview": (char.get("baseline_notes") or "")[:300],
            }
        )

    for m in (spec.get("layers") or {}).get("mechanics") or []:
        mid = m.get("id", "mechanic")
        entries.append(
            {
                "path": f"layers.mechanics[{mid}]",
                "label_vn": m.get("name", mid),
                "section_id": "3.4",
                "keywords": ["mechanic", "đạo hóa", "công pháp", mid],
                "excerpt_preview": " ".join((m.get("rules") or [])[:2])[:300],
            }
        )

    for e in spec.get("events", []):
        if e.get("arc_id") != "arc_2":
            continue
        eid = e.get("id", "")
        title = e.get("title", "")
        num_m = re.search(r"(\d+)", title)
        event_num = num_m.group(1) if num_m else ""
        entries.append(
            {
                "path": f"events[{eid}]",
                "label_vn": title,
                "section_id": f"event_{event_num}" if event_num else "",
                "keywords": [
                    title.lower(),
                    f"event {event_num}",
                    f"event{event_num}",
                    eid,
                ],
                "excerpt_preview": (e.get("synopsis") or "")[:300],
            }
        )

    for s in section_map:
        sid = str(s.get("section_id", ""))
        if sid.startswith("1."):
            entries.append(
                {
                    "path": f"source:{sid}",
                    "label_vn": s.get("title", sid),
                    "section_id": sid,
                    "keywords": [sid, s.get("title", "").lower()],
                    "excerpt_preview": (s.get("excerpt") or "")[:300],
                }
            )

    return entries


def _score_hit(query: str, entry: dict[str, Any]) -> float:
    q = query.lower()
    score = 0.0
    label = (entry.get("label_vn") or "").lower()
    if label and label in q:
        score += 3.0
    for kw in entry.get("keywords") or []:
        kwl = str(kw).lower()
        if kwl and kwl in q:
            score += 2.0
    path = entry.get("path", "")
    if path.split("[")[-1].rstrip("]") in q:
        score += 1.5
    preview = (entry.get("excerpt_preview") or "").lower()
    for token in re.findall(r"[\w\u00C0-\u1EF9]+", q):
        if len(token) > 2 and token in preview:
            score += 0.5
    return score


def search_index(query: str, index: list[dict[str, Any]], top_k: int = 5) -> list[dict[str, Any]]:
    scored = [(e, _score_hit(query, e)) for e in index]
    scored = [(e, s) for e, s in scored if s > 0]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [{**e, "score": s} for e, s in scored[:top_k]]


def _event_paths(spec: dict[str, Any], arc_ids: set[str] | None = None) -> list[str]:
    """`events[<id>]` for the spec's events, optionally restricted to arcs."""
    out = []
    for e in spec.get("events", []):
        if not e.get("id"):
            continue
        if arc_ids is not None and e.get("arc_id") not in arc_ids:
            continue
        out.append(f"events[{e['id']}]")
    return out


def _mechanic_paths(spec: dict[str, Any]) -> list[str]:
    return [
        f"layers.mechanics[{m['id']}]"
        for m in (spec.get("layers") or {}).get("mechanics") or []
        if m.get("id")
    ]


# Focus-path shapes `spec_slice_for_paths` / `merge_refine_output` understand.
# Anything outside this set focuses a refine on nothing (empty slice, dropped
# merge), so `translate_gap_paths` must never emit anything else.
_RECOGNIZED_FOCUS = ("events[", "layers.mechanics[", "arcs[")


def _is_recognized_focus_path(path: str) -> bool:
    return (
        path.startswith(_RECOGNIZED_FOCUS)
        or path in ("layers.characters[0]", "layers.variables", "charter", "meta.open_questions")
    )


# Rule IDs (validate.run_rules) → the spec region the rule is about.
# `premise_max` is deliberately absent: it grades the compiled PACKAGE's
# premise, not the spec, so no spec path can repair it.
_RULE_FOCUS: dict[str, str] = {
    "vars_four": "layers.variables",
    "arc2_discovery": "arcs[arc_2]",
    "anchors_min": "charter",
    "open_questions_preserved": "meta.open_questions",
    "audit_critical": "arc2_events",
    "thr_no_early_explain": "thr_events",
    "pa_not_realm": "thr_events",
    "notes_linked": "arc2_events",
    "sg_value_shift_per_scene": "arc2_events",
    "spec_has_events": "all_events",
    "every_arc_has_events": "all_events",
    # "spec_has_arc": no arcs exist to slice — dropping it lets the empty
    # focus fall back to the full-spec refine instead of an empty slice.
}


def translate_gap_paths(gap_paths: list[str], spec: dict[str, Any]) -> list[str]:
    """Translate self-check gap `path`s into focus paths the refine pair
    (`spec_slice_for_paths` / `merge_refine_output`) recognises.

    Gap paths are rule/check IDs (`thr_no_early_explain`, `synopsis_<title>`,
    `mech_0_rules`, `audit_critical`), NOT spec locations. Passed verbatim
    they slice to `{}` and merge to a no-op, so the autofix round burns one
    LLM call and lands nothing. This maps each ID to the spec region it is
    about; an ID with no spec region (e.g. `premise_max`, which grades the
    package, not the spec) drops out rather than poisoning the focus — when
    NOTHING translates, the caller passes an empty focus and the refine falls
    back to the full spec, which is the honest repair scope for an unlocated
    gap. Order-preserving, deduplicated.
    """
    arc2_events = _event_paths(spec, {"arc_2"})
    thr_events = [
        f"events[{e['id']}]"
        for e in spec.get("events", [])
        if e.get("id")
        and (e.get("arc_id") in ("arc_2", "transition")
             or str(e.get("id", "")).startswith("arc_2"))
    ]
    all_events = _event_paths(spec)
    mechanics = _mechanic_paths(spec)
    regions: dict[str, list[str]] = {
        "arc2_events": arc2_events,
        "thr_events": thr_events,
        "all_events": all_events,
    }
    out: list[str] = []
    seen: set[str] = set()

    def _add(paths: list[str]) -> None:
        for p in paths:
            if p and p not in seen:
                seen.add(p)
                out.append(p)

    for gap in gap_paths:
        if not isinstance(gap, str) or not gap:
            continue
        if _is_recognized_focus_path(gap):
            _add([gap])
            continue
        mapped = _RULE_FOCUS.get(gap)
        if mapped is not None:
            _add(regions.get(mapped, [mapped]))
            continue
        # Fidelity check IDs (eval_fidelity) carry a prefix, not a location.
        if gap.startswith(("char_", "polish_baseline", "polish_character")):
            _add(["layers.characters[0]"])
        elif gap.startswith(("mech_", "polish_mechanic")):
            _add(mechanics)
        elif gap.startswith(("synopsis_", "arc2_", "polish_bullets")):
            _add(arc2_events)
        elif gap == "analyze_anchors":
            _add(["charter"])
        elif gap.startswith("analyze_trait"):
            _add(["layers.characters[0]"])
        elif gap == "analyze_arc2_events":
            _add(arc2_events)
        elif gap.startswith("elab_"):
            _add(["layers.characters[0]"])
        # Anything else (e.g. `premise_max`, `analyze_source_refs`) names no
        # spec region: drop it rather than focus the refine on nothing.
    return out


def spec_slice_for_paths(spec: dict[str, Any], paths: list[str], max_chars: int = 4000) -> str:
    """Extract a small JSON slice for interpret/refine prompts."""
    import json

    out: dict[str, Any] = {}
    for p in paths:
        if p.startswith("events["):
            eid = p.split("[", 1)[1].rstrip("]")
            for e in spec.get("events", []):
                if e.get("id") == eid:
                    out[p] = e
        elif p == "layers.characters[0]":
            chars = (spec.get("layers") or {}).get("characters") or []
            if chars:
                out[p] = chars[0]
        elif p.startswith("layers.mechanics"):
            mid = p.split("[", 1)[1].rstrip("]") if "[" in p else ""
            for m in (spec.get("layers") or {}).get("mechanics") or []:
                if m.get("id") == mid:
                    out[p] = m
        elif p == "layers.variables":
            out[p] = (spec.get("layers") or {}).get("variables") or []
        elif p.startswith("arcs["):
            aid = p.split("[", 1)[1].rstrip("]")
            for a in spec.get("arcs", []):
                if a.get("id") == aid:
                    out[p] = a
        elif p == "charter":
            out[p] = spec.get("charter") or {}
        elif p == "meta.open_questions":
            out[p] = (spec.get("meta") or {}).get("open_questions") or []
    blob = json.dumps(out, ensure_ascii=False, indent=2)
    return blob[:max_chars]
