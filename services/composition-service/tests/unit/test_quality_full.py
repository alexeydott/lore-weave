"""Deterministic exhaustive coverage tests; no provider access."""
import asyncio
import json
from types import SimpleNamespace

import pytest
from loreweave_context.tokens import estimate_tokens

from app.engine.quality_analysis import plan_quality_analysis, _sources
from app.engine.quality_report import build_quality_report


def job(obj):
    return SimpleNamespace(status="completed", finish_reason="stop",
                           result={"messages": [{"content": json.dumps(obj)}]})


class FullLLM:
    def __init__(self, *, fail=None, context=16384, verbose=False):
        self.calls = []
        self.fail = fail
        self.context = context
        self.verbose = verbose
        self.active = self.peak = 0

    async def resolve_context_length(self, *args):
        return self.context

    async def submit_and_wait(self, **kw):
        self.active += 1
        self.peak = max(self.peak, self.active)
        try:
            await asyncio.sleep(0)
            inp = kw["input"]
            system, text = [m["content"] for m in inp["messages"]]
            kind = kw["job_meta"]["extractor"]
            self.calls.append((kind, text))
            assert estimate_tokens(system) + estimate_tokens(text) + inp["max_tokens"] + 32 <= (self.context or 16384)
            # Mirror registry admission over all decoded input string values.
            def strings(value):
                if isinstance(value, str):
                    return value
                if isinstance(value, dict):
                    return "".join(strings(v) for v in value.values())
                if isinstance(value, list):
                    return "".join(strings(v) for v in value)
                return ""
            import math
            wire = strings(inp)
            divisor = 1 if sum(ord(c) > 127 for c in wire) >= .2 * len(wire) else 3.5
            window = self.context or 16384
            assert math.ceil(len(wire) / divisor) + inp["max_tokens"] + int(window * .15) <= window
            if self.fail == kind:
                raise RuntimeError("intentional failure")
            if kind == "quality_narrative":
                obj = {k: [] for k in ("opening_state", "closing_state", "setups", "payoffs", "changes")}
                for marker, key, claim in [("SETUP", "setups", "key mystery"),
                                           ("PAYOFF", "payoffs", "key mystery paid"),
                                           ("DEAD", "closing_state", "hero dead"),
                                           ("ALIVE", "opening_state", "hero alive")]:
                    if marker in text:
                        obj[key].append({"claim": claim, "quote": marker})
                return job(obj)
            if kind.endswith("synthesis"):
                if 'Return JSON {"summary":str}' in system:
                    # Contract deliberately preserves continuity markers through every level.
                    return job({"summary": " ".join(m for m in ("SETUP", "PAYOFF", "DEAD", "ALIVE", "LAST_CANON") if m in text) or "all sources reviewed"})
                if kind == "quality_audit_synthesis":
                    return job({"introduced": ["key mystery"],
                                "resolved": ["key mystery"] if "SETUP" in text and "PAYOFF" in text else [],
                                "dropped": []})
                return job({"coherence": 1 if "DEAD" in text and "ALIVE" in text else 5,
                            "voice_match": 4, "pacing": 4, "canon_consistency": 2 if "LAST_CANON" in text else 5,
                            "violations": [], "craft_notes": [{"note": "cross-window contradiction", "span": ""}]})
            if kind == "judge_prose":
                return job({"coherence": 5, "voice_match": 4, "pacing": 4,
                            "canon_consistency": 2 if "LAST_CANON" in text else 5,
                            "violations": [], "craft_notes": ([{"note": "detail " * 100, "span": ""} for _ in range(40)]
                                if self.verbose else [{"note": "LAST_CANON", "span": ""}] if "LAST_CANON" in text else [])})
            return job({"introduced": ["key mystery"] if "SETUP" in text else [], "resolved": [], "dropped": []})
        finally:
            self.active -= 1


async def report(llm, **kw):
    return await build_quality_report(llm, user_id="u", model_source="s", model_ref="m", **kw)


def test_preflight_exact_sources_and_long_lines():
    for text in ("漢" * 12000, "word " * 10000, "line\n" * 10000):
        sources = _sources(text, 500, "W")
        assert "".join(text[s["start"]:s["end"]] for s in sources) == text
        assert all(s["tokens"] <= 500 for s in sources)
    small = plan_quality_analysis(chapter="short", canon="fact", context_window=16384)
    assert small["mode"] == "direct" and small["leaf_calls"] == 2
    assert plan_quality_analysis(chapter="short", context_window=1024)["callable"] is False
    large = plan_quality_analysis(chapter="漢" * 14000, canon="字" * 12000)
    assert large["mode"] == "windowed"
    assert isinstance(large["synthesis_calls_max"], int) and large["synthesis_calls_max"] >= 2
    assert large["leaf_calls"] == large["windows_total"] * (large["canon_batches_total"] + 2)


def test_live_size_conservative_planner_preserves_all_sources():
    # ASCII at four chars/token gives the exact production token shape without
    # reading private chapter/canon content or making a provider request.
    chapter = "p" * (12880 * 4)
    canon = "c" * (57491 * 4)
    assert (estimate_tokens(chapter), estimate_tokens(canon)) == (12880, 57491)
    plan = plan_quality_analysis(chapter=chapter, canon=canon, context_window=260000)
    assert plan["mode"] == "windowed"
    assert plan["input_token_budget"] == 178616
    assert plan["leaf_calls"] > 2
    assert "".join(w["text"] for w in plan["_windows"]) == chapter
    assert "".join(c["text"] for c in plan["_batches"]) == canon


def test_shared_planner_budget_boundary_and_overflow():
    from app.llm_budget import quality_input_budget

    budget = quality_input_budget(260000, 8192)
    assert budget == 178616
    for delta in (0, 1):
        passage = "p" * (12880 * 4)
        canon = "c" * (budget - len(passage) + delta)
        plan = plan_quality_analysis(chapter=passage, canon=canon, context_window=260000)
        assert plan["input_token_budget"] == budget
        assert plan["mode"] == ("direct" if delta == 0 else "windowed")
        assert "".join(w["text"] for w in plan["_windows"]) == passage
        assert "".join(c["text"] for c in plan["_batches"]) == canon


@pytest.mark.parametrize("share", [.199, .2, .201, .3])
async def test_registry_threshold_crossing_full_fact_json(share):
    # Mixed-script full-fact JSON has a low SDK estimate but registry counts
    # the WHOLE assembled request at chars/1 above its script threshold.
    size = 216000
    non_ascii = int(size * share)
    from app.engine.heal_canon import cast_from_state, render_canon
    entities = [{"entity_id": "fixture", "facts": [
        {"attr": "name", "value": "Fixture"},
        {"attr": "description", "value": "é" * non_ascii + "a" * (size - non_ascii)},
        {"attr": "relationships", "value": {"nested": "full source fact"}},
    ]}]
    canon = render_canon(cast_from_state(entities, preserve_facts=True), full_facts=True)
    chapter = "p" * 51520
    llm = FullLLM(context=260000)
    plan = plan_quality_analysis(chapter=chapter, canon=canon, context_window=260000)
    assert plan["mode"] == "windowed"
    assert "".join(c["text"] for c in plan["_batches"]) == canon
    out = await report(llm, chapter=chapter, canon=canon)
    assert out["scope"]["complete"]
    assert any(kind == "quality_narrative" for kind, _ in llm.calls)
    assert any(kind.endswith("synthesis") for kind, _ in llm.calls)


@pytest.mark.parametrize("share", [.199, .2, .201, .3])
async def test_actual_short_sizes_admitted_without_losing_sources(share):
    chapter = "é" * int(31386 * share) + "p" * (31386 - int(31386 * share))
    canon = "é" * int(184253 * share) + "c" * (184253 - int(184253 * share))
    plan = plan_quality_analysis(chapter=chapter, canon=canon, context_window=260000)
    assert (plan["mode"], plan["windows_total"], plan["canon_batches_total"], plan["leaf_calls"]) == (
        "windowed", 1, 3, 5)
    assert "".join(w["text"] for w in plan["_windows"]) == chapter
    assert "".join(c["text"] for c in plan["_batches"]) == canon
    llm = FullLLM(context=260000)
    out = await report(llm, chapter=chapter, canon=canon)
    assert out["scope"]["complete"]
    assert len(llm.calls) == 7


@pytest.mark.parametrize("extractor", ["judge_prose", "promise_audit", "quality_narrative",
                                      "quality_critic_synthesis", "quality_audit_synthesis"])
async def test_quality_admission_checks_all_decoded_strings_before_submit(extractor):
    from app.engine.quality_analysis import _QualityAdmission, _request_characters

    llm = FullLLM(context=10000)
    client = _QualityAdmission(llm, 10000)
    # Schema strings count too, including non-BMP code points as one rune.
    inp = {"messages": [{"role": "user", "content": "a" * 6000}],
           "response_format": {"schema": {"description": "\U0001f600" * 1500}},
           "max_tokens": 1000}
    assert _request_characters(inp) == 7504
    with pytest.raises(ValueError, match="quality_context_limit"):
        await client.submit_and_wait(input=inp, job_meta={"extractor": extractor})
    assert llm.calls == []


async def test_last_window_last_canon_and_cross_window_payoff():
    llm = FullLLM()
    events = []
    async def progress(event):
        events.append(event)
    chapter = "SETUP DEAD " + "漢" * 10000 + " ALIVE PAYOFF"
    canon = "字" * 8000 + " LAST_CANON"
    out = await report(llm, chapter=chapter, canon=canon, progress_callback=progress)
    scope = out["scope"]
    assert scope["complete"] and not scope["partial"]
    assert scope["windows_analyzed"] == scope["windows_total"] > 1
    assert scope["canon_batches_analyzed"] == scope["canon_batches_total"] > 1
    assert out["critic"]["coherence"] == 1  # All local critics scored 5.
    assert out["critic"]["canon_consistency"] == 2
    assert out["threads"]["resolved"] == ["key mystery"]
    assert out["threads"]["selection"]["aggregate_cap"] is None
    assert llm.peak <= 3
    assert events[0]["stage"] == "planned" and events[-1]["stage"] == "complete"
    assert events[0]["manifest"]["critic_units"][0]["status"] == "pending"
    assert all(u["status"] == "completed" for u in out["manifest"]["critic_units"])


async def test_hierarchical_reduction_does_not_drop_leaf_sources():
    llm = FullLLM(verbose=True)
    out = await report(llm, chapter="SETUP DEAD " + "漢" * 16000 + " ALIVE PAYOFF")
    assert out["scope"]["complete"]
    nodes = out["manifest"]["synthesis"]
    assert any(not n["final"] for n in nodes)
    for kind in ("critic", "audit"):
        final = next(n for n in nodes if n["final"] and n["id"].startswith(kind))
        expected = {u["id"] for u in out["manifest"][kind + "_units"]}
        assert expected <= set(final["sources"])
    assert out["critic"]["coherence"] == 1
    assert out["threads"]["resolved"] == ["key mystery"]


async def test_independent_failures_and_grounding_incomplete():
    out = await report(FullLLM(fail="judge_prose"), chapter="SETUP " + "漢" * 9000 + " PAYOFF")
    assert out["critic"]["error"] and "error" not in out["threads"]
    assert not out["scope"]["complete"]
    out = await report(FullLLM(fail="promise_audit"), chapter="SETUP " + "漢" * 9000 + " PAYOFF")
    assert out["threads"]["error"] and "error" not in out["critic"]
    out = await report(FullLLM(), chapter="short", canon_grounding={"complete": False, "as_of": None})
    assert not out["scope"]["complete"] and out["scope"]["canon_partial"]


@pytest.mark.parametrize("failure", ["length", "reasoning", "oversized", "ungrounded"])
async def test_narrative_failure_preserves_successful_audit_and_partial_scope(failure):
    class NarrativeLLM(FullLLM):
        async def submit_and_wait(self, **kw):
            if kw["job_meta"]["extractor"] != "quality_narrative":
                return await super().submit_and_wait(**kw)
            inp = kw["input"]
            schema = inp["response_format"]["json_schema"]["schema"]
            assert all(s["maxItems"] == 4 for s in schema["properties"].values())
            assert "1-64 characters" in inp["messages"][0]["content"]
            obj = {k: [] for k in schema["properties"]}
            if failure == "oversized":
                obj["changes"] = [{"claim": "x" * 65, "quote": "SETUP"}]
            elif failure == "ungrounded":
                obj["changes"] = [{"claim": "claim", "quote": "NOT IN SOURCE"}]
            response = job(obj)
            if failure in ("length", "reasoning"):
                response.finish_reason = "length"
                if failure == "reasoning":
                    response.result = {"messages": [{"content": ""}]}
            return response
    out = await report(NarrativeLLM(), chapter="SETUP " + "漢" * 9000)
    scope = out["scope"]
    assert scope["audit_units_completed"] == scope["audit_units_total"]
    assert scope["narrative_units_completed"] == 0
    assert not scope["complete"] and not scope["synthesis_completed"]
    assert out["threads"]["error"] == "audit_incomplete"
    assert all("error" not in e["result"] for e in out["evidence"]["threads"])
    errors = [e["result"]["narrative"]["error"] for e in out["evidence"]["threads"]]
    assert all(e.startswith("narrative_") for e in errors)
    if failure == "reasoning":
        assert set(errors) == {"narrative_reasoning_exhausted"}


def test_source_quote_mapping_rejects_fabrication_and_ambiguity():
    from app.engine.quality_analysis import _source_quote_span

    source = "prefix 😀 The gate\n\twas sealed. suffix"
    span = _source_quote_span(source, "The gate was sealed.")
    assert span is not None
    assert source[slice(*span)] == "The gate\n\twas sealed."
    for quote in ("The gate was opened.", "The gate...sealed.", "the gate was sealed.", "   "):
        assert _source_quote_span(source, quote) is None
    assert _source_quote_span("a\nb a\tb", "a b") is None


async def test_saved_failure_shape_maps_whitespace_to_exact_source_offsets():
    # Sanitized structure of the saved failure: five arrays of four observations,
    # with 16 exact copies and four whitespace-reflowed quotes. No private text.
    fields = ("opening_state", "closing_state", "setups", "payoffs", "changes")
    source_quotes = [f"Evidence {i:02d} has" + ("\n\t" if i in (7, 8, 9, 10) else " ")
                     + "a source anchor." for i in range(20)]
    chapter = "\n".join(source_quotes)
    chapter += "漢" * 9000
    class ReflowLLM(FullLLM):
        async def submit_and_wait(self, **kw):
            if kw["job_meta"]["extractor"] == "quality_narrative":
                return job({field: [{"claim": f"Observation {i}",
                                     "quote": " ".join(source_quotes[i].split())}
                                    for i in range(j * 4, j * 4 + 4)]
                            for j, field in enumerate(fields)})
            return await super().submit_and_wait(**kw)
    # Force windowing through canon, retaining the entire short chapter in one window.
    llm = ReflowLLM(context=260000)
    out = await report(llm, chapter=chapter, canon="c" * 184253)
    assert out["scope"]["complete"]
    evidence = out["evidence"]["threads"][0]["result"]["narrative"]
    observations = [item for field in fields for item in evidence[field]]
    assert sum(item["grounding"] == "whitespace_mapped" for item in observations) == 4
    assert all(chapter[item["start"]:item["end"]] == item["quote"] for item in observations)


async def test_cancel_propagates_without_retry():
    llm = FullLLM()
    async def cancel():
        return bool(llm.calls)
    with pytest.raises(asyncio.CancelledError):
        await report(llm, chapter="漢" * 9000, cancel_check=cancel)
    assert len(llm.calls) <= 3


async def test_unknown_context_uses_conservative_full_plan():
    out = await report(FullLLM(context=None), chapter="漢" * 9000)
    assert out["scope"]["complete"]
    assert out["scope"]["context_window"] is None
    assert out["scope"]["windows_total"] > 1


async def test_reduction_ceiling_returns_incomplete_without_silent_omission(monkeypatch):
    import app.engine.quality_analysis as engine
    monkeypatch.setattr(engine, "_MAX_REDUCTION_LEVELS", 0)
    llm = FullLLM(verbose=True)
    out = await report(llm, chapter="SETUP " + "漢" * 16000 + " PAYOFF")
    assert not out["scope"]["complete"]
    assert out["critic"]["synthesis_error"] == "synthesis_reduction_budget_exceeded"
    assert len(out["evidence"]["threads"]) == out["scope"]["windows_total"]
    assert all(u["status"] == "completed" for u in out["manifest"]["narrative_units"])
    assert len(out["manifest"]["synthesis"]) <= out["manifest"]["preflight"]["synthesis_calls_max"]


async def test_aggregate_is_not_capped_at_twelve():
    class ManyLLM(FullLLM):
        async def submit_and_wait(self, **kw):
            system = kw["input"]["messages"][0]["content"]
            if (kw["job_meta"]["extractor"] == "quality_audit_synthesis"
                    and 'Return JSON {"summary":str}' not in system):
                return job({"introduced": [f"thread {i}" for i in range(20)],
                            "resolved": ["thread 19"], "dropped": []})
            return await super().submit_and_wait(**kw)
    out = await report(ManyLLM(), chapter="漢" * 9000)
    assert out["scope"]["complete"]
    assert out["threads"]["raised_count"] == 20
    assert out["threads"]["resolved"] == ["thread 19"]
