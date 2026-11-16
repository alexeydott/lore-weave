"""D-W10-ARC-CONFORMANCE-DEEP-JOB — the Tier-W arc-conformance worker handler.

``run_conformance_run`` is the production home of the deep arc overlay (the synchronous
GET deep+model_ref tagging storm times out on a real book). These drive it with fakes for
the repos/reader/knowledge so the REAL ``compute_arc_report`` runs end-to-end:

  - scope='arc' + model_ref → tags (threads+motifs+causal) then builds coarse + deep overlay
  - scope='arc' without model_ref → pacing-only deep (no tagging storm)
  - the terminal-business-error guards (chapter scope, missing arc id, foreign arc)

Plus the envelope threading: the confirm effect carries arc_id/model_ref/model_source.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.engine import motif_conformance_run as mcr

U, P, BOOK, AID = str(uuid.uuid4()), str(uuid.uuid4()), uuid.uuid4(), uuid.uuid4()
MH, MS = str(uuid.uuid4()), str(uuid.uuid4())


def _arc():
    # BA4: the arc scope resolves the durable SPEC (a structure_node) — `title`+`tracks`
    # (BA10 vocab), NO `layout`/`pacing` (BA5/BA3 — motif_application IS the realized
    # layout, pacing derives from member-scene tension). `book_id` gates it to the Work's book.
    return SimpleNamespace(
        id=AID, book_id=BOOK, title="Revenge",
        tracks=[{"key": "revenge", "label": "Revenge"}])


@pytest.fixture
def patched(monkeypatch):
    state = SimpleNamespace(
        arc=_arc(), rows=[], sequences=[], placement_motifs={}, succ_map={},
        causal_pairs=[], tag_calls=[], motif_tag_calls=[], causal_calls=[])

    class _Works:
        def __init__(self, pool): pass
        async def get(self, p):
            return SimpleNamespace(book_id=BOOK, project_id=p, created_by=U)

    class _StructureRepo:
        # BA4: the worker resolves the arc via StructureRepo.get(arc_id) (a structure_node),
        # replacing the legacy ArcTemplateRepo.get_visible(template_id).
        def __init__(self, pool): pass
        async def get(self, node_id):
            return state.arc

    class _Reader:
        def __init__(self, pool): pass
        async def arc_bindings_by_structure(self, p, aid):
            # by_structure=True: bindings read via motif_application.structure_node_id.
            return state.rows

    class _MotifRepo:
        def __init__(self, pool): pass
        async def successors_by_ids(self, ids):
            return state.succ_map
        async def get_by_codes(self, caller, codes):
            return state.placement_motifs

    class _Knowledge:
        async def get_motif_beat_sequences(self, u, *, book_id=None, corpus=False, language=None):
            return state.sequences
        async def tag_threads(self, u, *, book_id, threads, model_source, model_ref):
            state.tag_calls.append(model_ref); return {}
        async def tag_motifs(self, u, *, book_id, motifs, model_source, model_ref):
            state.motif_tag_calls.append([m["code"] for m in motifs]); return {}
        async def infer_causal_edges(self, u, *, book_id, model_source, model_ref):
            state.causal_calls.append(model_ref); return {}
        async def causal_motif_pairs(self, u, *, book_id):
            return state.causal_pairs

    monkeypatch.setattr("app.db.repositories.works.WorksRepo", _Works)
    monkeypatch.setattr("app.db.repositories.structure.StructureRepo", _StructureRepo)
    monkeypatch.setattr("app.db.repositories.motif_repo.MotifRepo", _MotifRepo)
    monkeypatch.setattr("app.routers.conformance.ConformanceTraceReader", _Reader)
    state.knowledge = _Knowledge()
    return state


def _arc_input(**over):
    base = {"worker_op": "conformance_run", "book_id": str(BOOK), "scope": "arc",
            "arc_id": str(AID), "model_ref": "m1", "model_source": "user_model"}
    base.update(over)
    return base


async def _run(state, inp, llm=None):
    return await mcr.run_conformance_run(
        object(), llm if llm is not None else object(), state.knowledge,
        user_id=U, project_id=P, input=inp)


# ── happy path: deep overlay with tagging ─────────────────────────────────────────

async def test_arc_deep_job_tags_then_builds_coarse_and_deep(patched):
    state = patched
    ch1 = uuid.uuid4()
    state.rows = [{"motif_id": MH, "motif_code": "humiliation",
                   "annotations": {"thread": "revenge"},
                   "chapter_id": ch1, "tension": 50, "story_order": 1}]
    state.placement_motifs = {
        "humiliation": SimpleNamespace(id=MH, code="humiliation", name="Humiliation", summary="x"),
        "face_slap": SimpleNamespace(id=MS, code="face_slap", name="Face Slap", summary="y")}
    state.succ_map = {MH: [{"id": MS, "code": "face_slap", "name": "Face Slap", "ord": 0}]}
    state.sequences = [[{"realized_motif_code": "humiliation", "thread": str(ch1)},
                        {"realized_motif_code": "face_slap", "thread": str(ch1)}]]
    state.causal_pairs = [("humiliation", "face_slap")]

    out = await _run(state, _arc_input())
    # coarse report shape (job result the poll returns)
    assert out["scope"] == "arc" and out["coarse"] is True and out["chapter_count"] == 1
    # the model_ref drove all three tagging passes (the storm — now off the GET).
    assert state.tag_calls == ["m1"] and state.causal_calls == ["m1"]
    assert {c for codes in state.motif_tag_calls for c in codes} == {"humiliation", "face_slap"}
    # deep overlay: a legal, causally-verified succession.
    s = out["deep"]["succession"]
    assert s["legal"] == 1 and s["caused"] == 1 and s["causal_verified"] is True


async def test_arc_job_runs_entailment_judge_with_its_llm(patched):
    # D-SUCCESSION-ENTAILMENT-JUDGE — the job (unlike the GET) passes its llm, so the deepest
    # signal runs: A's effects entail B's preconditions over the legal precedes edge.
    state = patched
    ch1 = uuid.uuid4()
    state.rows = [{"motif_id": MH, "motif_code": "humiliation",
                   "annotations": {"thread": "revenge"},
                   "chapter_id": ch1, "tension": 50, "story_order": 1}]
    state.placement_motifs = {
        "humiliation": SimpleNamespace(id=MH, code="humiliation", name="Humiliation",
                                       summary="x", effects=[{"desc": "the hero is shamed"}],
                                       preconditions=[]),
        "face_slap": SimpleNamespace(id=MS, code="face_slap", name="Face Slap", summary="y",
                                     effects=[], preconditions=[{"desc": "the hero was shamed"}])}
    state.succ_map = {MH: [{"id": MS, "code": "face_slap", "name": "Face Slap", "ord": 0}]}
    state.sequences = [[{"realized_motif_code": "humiliation", "thread": str(ch1)},
                        {"realized_motif_code": "face_slap", "thread": str(ch1)}]]

    class _LLM:
        async def submit_and_wait(self, **kw):
            return SimpleNamespace(status="completed", result={"messages": [
                {"content": '{"humiliation->face_slap": true}'}]})

    out = await _run(state, _arc_input(), llm=_LLM())
    s = out["deep"]["succession"]
    assert s["legal"] == 1 and s["entailed"] == 1 and s["entailment_verified"] is True


async def test_arc_job_without_model_ref_is_pacing_only_no_tagging(patched):
    state = patched
    ch1 = uuid.uuid4()
    state.rows = [{"motif_id": MH, "motif_code": "humiliation",
                   "annotations": {"thread": "revenge"},
                   "chapter_id": ch1, "tension": 40, "story_order": 1}]
    state.sequences = [[{"beat": "x", "thread": str(ch1), "tension": 5}]]
    out = await _run(state, _arc_input(model_ref=None, model_source=None))
    assert state.tag_calls == [] and state.motif_tag_calls == [] and state.causal_calls == []
    assert out["deep"]["available"] is True              # pacing still computed from pre-existing beats
    assert out["deep"]["pacing"]["realized"][0]["avg_tension"] == 100.0


# ── terminal business-error guards (clean job-failed, no redeliver) ───────────────

async def test_chapter_scope_rejects_mismatched_book(patched):
    with pytest.raises(ValueError, match="work/book"):
        await _run(patched, {"scope": "chapter", "chapter_id": str(uuid.uuid4())})


async def test_missing_arc_id_is_terminal_valueerror(patched):
    with pytest.raises(ValueError, match="arc_id"):
        await _run(patched, _arc_input(arc_id=None))


async def test_foreign_or_missing_arc_is_terminal_valueerror(patched):
    patched.arc = None  # StructureRepo.get → None
    with pytest.raises(ValueError, match="not found"):
        await _run(patched, _arc_input())


# ── envelope threading: the confirm effect carries the deep inputs ────────────────

async def test_confirm_effect_spec_carries_deep_inputs(monkeypatch):
    from app.routers import actions

    seen = {}

    async def _fake_enqueue(*, envelope_user, project_id, operation, spec):
        seen["spec"] = spec
        seen["operation"] = operation
        return uuid.uuid4()

    async def _noop(*a, **k):
        return None

    monkeypatch.setattr(actions, "_enqueue_motif_job", _fake_enqueue)
    monkeypatch.setattr(actions, "_claim_or_replay", _noop)
    monkeypatch.setattr(actions, "_precheck_or_402", _noop)

    work = SimpleNamespace(book_id=BOOK)
    payload = {"book_id": str(BOOK), "scope": "arc", "chapter_id": None, "arc_id": str(AID),
               "model_ref": "m1", "model_source": "user_model", "estimate_usd": 0.0}
    out = await actions._execute_conformance_run(
        payload, uuid.UUID(P), work, uuid.uuid4(), token="t.t.t", claims=None)

    assert out["outcome"] == "action_accepted" and seen["operation"] == "conformance_run"
    assert seen["spec"]["arc_id"] == str(AID)
    assert seen["spec"]["model_ref"] == "m1" and seen["spec"]["model_source"] == "user_model"


@pytest.mark.parametrize("guard", [None, "book", "chapter", 403, 404, 500, "scenes", "model"])
async def test_chapter_confirm_guards_then_enqueues(monkeypatch, guard):
    from unittest.mock import AsyncMock, Mock

    from fastapi import HTTPException
    from app.clients.book_client import BookClientError
    from app.routers import actions

    chapter, project, user, job = uuid.uuid4(), uuid.UUID(P), uuid.UUID(U), uuid.uuid4()
    pool, claims = object(), object()
    payload = {
        "book_id": str(BOOK), "scope": "chapter", "chapter_id": str(chapter),
        "model_ref": "judge", "model_source": "user_model", "estimate_usd": 0.25,
    }
    book, outline = AsyncMock(), AsyncMock()
    outline.scenes_for_chapter.return_value = [SimpleNamespace(id=uuid.uuid4())]
    if guard == "book":
        payload["book_id"] = str(uuid.uuid4())
    elif guard == "chapter":
        payload["chapter_id"] = "invalid"
    elif isinstance(guard, int):
        book.get_draft.side_effect = BookClientError(guard, "test")
    elif guard == "scenes":
        outline.scenes_for_chapter.return_value = []
    elif guard == "model":
        payload["model_ref"] = None

    # Patch the dependency homes, not missing router globals: removing the imports
    # must fail on the real chapter guard before any claim/billing/enqueue occurs.
    monkeypatch.setattr("app.clients.book_client.get_book_client", Mock(return_value=book))
    monkeypatch.setattr("app.db.pool.get_pool", Mock(return_value=pool))
    outline_factory = Mock(return_value=outline)
    monkeypatch.setattr(actions, "OutlineRepo", outline_factory)
    bearer = Mock(return_value="service-bearer")
    monkeypatch.setattr(actions, "mint_service_bearer", bearer)
    effects = Mock()
    claim, precheck, enqueue = AsyncMock(), AsyncMock(), AsyncMock(return_value=job)
    for name, mock in [("claim", claim), ("precheck", precheck), ("enqueue", enqueue)]:
        effects.attach_mock(mock, name)
    monkeypatch.setattr(actions, "_claim_or_replay", claim)
    monkeypatch.setattr(actions, "_precheck_or_402", precheck)
    monkeypatch.setattr(actions, "_enqueue_motif_job", enqueue)

    async def confirm():
        return await actions._execute_conformance_run(
            payload, project, SimpleNamespace(book_id=BOOK), user,
            token="t.t.t", claims=claims)

    if guard is not None:
        expected = {
            "book": (403, "action_error"), "chapter": (400, "action_error"),
            403: (403, "action_error"), 404: (403, "action_error"),
            500: (503, "BOOK_SERVICE_UNAVAILABLE"),
            "scenes": (422, "NO_PLANNED_SCENES"), "model": (422, "MODEL_REF_REQUIRED"),
        }
        with pytest.raises(HTTPException) as exc:
            await confirm()
        assert (exc.value.status_code, exc.value.detail["code"]) == expected[guard]
        claim.assert_not_awaited()
        precheck.assert_not_awaited()
        enqueue.assert_not_awaited()
        return

    out = await confirm()
    bearer.assert_called_once_with(user, actions.settings.jwt_secret)
    book.get_draft.assert_awaited_once_with(BOOK, chapter, "service-bearer")
    outline_factory.assert_called_once_with(pool)
    outline.scenes_for_chapter.assert_awaited_once_with(project, chapter)
    claim.assert_awaited_once_with("t.t.t", claims)
    precheck.assert_awaited_once_with(
        owner_user_id=user, job_id=actions._billing_job_id("t.t.t"), estimate_usd=0.25)
    enqueue.assert_awaited_once_with(
        envelope_user=user, project_id=project, operation="conformance_run",
        spec={"book_id": str(BOOK), "scope": "chapter", "chapter_id": str(chapter),
              "arc_id": None, "model_ref": "judge", "model_source": "user_model"})
    assert [call[0] for call in effects.mock_calls] == ["claim", "precheck", "enqueue"]
    assert out == {"outcome": "action_accepted", "descriptor": "composition.conformance_run",
                   "job_id": job, "poll": "composition_get_mine_job"}


# ── MCP arg model accepts the deep fields (ForbidExtra still rejects unknowns) ────

def test_conformance_run_args_accept_deep_fields():
    from app.mcp.server import _ConformanceRunArgs

    a = _ConformanceRunArgs(project_id=P, scope="arc", arc_id=str(AID),
                            model_ref="m1", model_source="user_model")
    assert a.arc_id == str(AID) and a.model_ref == "m1"
    with pytest.raises(Exception):  # ForbidExtra
        _ConformanceRunArgs(project_id=P, scope="arc", bogus="x")


@pytest.mark.parametrize("unheaded", [False, True])
@pytest.mark.parametrize("change", [None, "prose", "plan"])
async def test_chapter_run_computes_saved_manuscript_verdict(monkeypatch, change, unheaded):
    from unittest.mock import AsyncMock
    from app.engine.prose_doc import text_to_tiptap_doc
    from app.routers import conformance
    from app.engine import motif_conformance
    chapter, scene, motif_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    node = SimpleNamespace(id=scene, title="Encounter", beat_role="climax", tension=80)
    app = SimpleNamespace(motif_id=motif_id, motif_version=1, annotations={"beat_key": "meet"}, role_bindings={})
    work = SimpleNamespace(book_id=BOOK, settings={"source_language": "vi"})
    works, outline, motifs, reader, book = [AsyncMock() for _ in range(5)]
    works.get.return_value = work
    outline.scenes_for_chapter.return_value = [node]
    motifs.get_visible.return_value = SimpleNamespace(name="Meeting", summary="meet", beats=[], roles=[], tension_target=4)
    reader.apps_by_nodes.return_value = {scene: app}
    reader.latest_completed_by_nodes.return_value = {}
    prefix = "" if unheaded else "### Encounter\n\n"
    book.get_draft.return_value = {"body": text_to_tiptap_doc(prefix + "They meet.", [{"id": str(scene), "title": "Encounter"}])}
    for target, value in [("app.db.repositories.works.WorksRepo", works),
                          ("app.db.repositories.outline.OutlineRepo", outline),
                          ("app.db.repositories.motif_repo.MotifRepo", motifs),
                          ("app.clients.book_client.get_book_client", book)]:
        monkeypatch.setattr(target, lambda *a, _value=value: _value)
    monkeypatch.setattr(conformance, "ConformanceTraceReader", lambda pool: reader)
    judge = AsyncMock(return_value={"beat_realized": True, "tension_band_match": False, "reason": "test"})
    monkeypatch.setattr(motif_conformance, "judge_motif_conformance", judge)
    out = await mcr.run_conformance_run(object(), object(), object(), user_id=U, project_id=P,
        input={"scope": "chapter", "book_id": str(BOOK), "chapter_id": str(chapter),
               "model_ref": "judge", "model_source": "platform_model"})
    assert out["chapter_id"] == str(chapter)
    assert out["scenes"][0]["conformance"]["beat_realized"] is True
    assert out["scenes"][0]["check_status"] == "checked"
    assert judge.await_args.kwargs["passage"] == "They meet."
    assert judge.await_args.kwargs["profile"].source_language == "vi"
    outline.scenes_for_chapter.assert_awaited_once_with(uuid.UUID(P), chapter)
    assert judge.await_args.kwargs["model_source"] == "platform_model"
    from hashlib import sha256
    assert out["scenes"][0]["source_sha256"] == sha256(b"They meet.").hexdigest()

    reader.latest_chapter_run.return_value = {
        "job_id": "checked-job", "computed_at": "2026-11-09T00:00:00Z", "result": out,
    }
    if change == "prose":
        book.get_draft.return_value = {"body": text_to_tiptap_doc(
            prefix + "They leave.", [{"id": str(scene), "title": "Encounter"}])}
    elif change == "plan":
        node.tension = 20
    monkeypatch.setattr(conformance, "authorize_book", AsyncMock())
    from fastapi.security import HTTPAuthorizationCredentials
    trace = await conformance.read_conformance(
        uuid.UUID(P), scope="chapter", chapter_id=chapter, user_id=uuid.UUID(U),
        works=works, outline=outline, reader=reader, grant=object(),
        credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials="test"))
    assert trace["last_run"]["job_id"] == "checked-job"
    if change:
        assert trace["scenes"][0]["conformance"] is None
        assert trace["scenes"][0]["check_status"] == "stale"
    else:
        assert trace["scenes"][0]["conformance"]["beat_realized"] is True
        assert trace["scenes"][0]["check_status"] == "checked"
