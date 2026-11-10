"""Behavioral read/summary boundaries without DB, provider, or live services."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import entity_references as r
from app.grant_client import GrantLevel
from app.clients.kal_client import RosterIncomplete


@pytest.fixture
def surface():
    book, entity, user = uuid4(), uuid4(), uuid4()
    grant = SimpleNamespace(resolve_grant=AsyncMock(return_value=GrantLevel.VIEW))
    kal = SimpleNamespace(cast_by_ids=AsyncMock(return_value=[{"entity_id": str(entity)}]))
    row = {"source": "scene_pov", "node_ref": {"kind": "scene", "id": str(uuid4()), "title": "Scene"}, "detail": "point of view"}
    repo = SimpleNamespace(find=AsyncMock(return_value=(21, [row])))
    works = SimpleNamespace(resolve_by_book=AsyncMock(return_value=[SimpleNamespace(settings={
        "model_roles": {"chat": {"model_ref": "book-choice", "model_source": "platform_model"}}})]))
    llm = SimpleNamespace(submit_and_wait=AsyncMock(return_value=SimpleNamespace(
        status="completed", result={"text": '{"answer":"Grounded summary","citation_ids":["r1"]}'})),
        resolve_default_model=AsyncMock(return_value="account-choice"))
    app = FastAPI()
    app.include_router(r.router)
    for dep, value in [(r.get_current_user, user), (r.get_grant_client_dep, grant),
                       (r.get_kal_client, kal), (r.get_entity_references_repo, repo),
                       (r.get_works_repo, works), (r.get_llm_client_dep, llm)]:
        def override(value):
            def dependency():
                return value
            return dependency
        app.dependency_overrides[dep] = override(value)
    return SimpleNamespace(client=TestClient(app), app=app, grant=grant, kal=kal, repo=repo,
                           works=works, llm=llm, book=book, entity=entity, user=user,
                           path=f"/v1/composition/books/{book}/entities/{entity}/references")


def test_read_exact_count_cap_and_partial_error(surface):
    s = surface
    async def find(source, **kwargs):
        assert kwargs["book_id"] == s.book
        assert kwargs["entity_id"] == s.entity
        assert kwargs["limit"] == 1
        if source == "canon_rule":
            raise RuntimeError("private database error")
        return 21, [{"source": source}] * 4
    s.repo.find.side_effect = find
    response = s.client.get(s.path + "?sources=scene_pov&sources=canon_rule&limit=1")
    assert response.status_code == 200
    sources = response.json()["sources"]
    assert sources["scene_pov"] == {"count": 21, "refs": [{"source": "scene_pov"}], "has_more": True}
    assert sources["canon_rule"] == {"error": "this source could not be read"}
    s.kal.cast_by_ids.assert_awaited_once_with(s.book, [str(s.entity)], user_id=s.user)


@pytest.mark.parametrize("suffix", ["", "/assistant"])
def test_denied_before_identity_reads_or_llm(surface, suffix):
    s = surface
    s.grant.resolve_grant.return_value = GrantLevel.NONE
    response = (s.client.post(s.path + suffix, json={"question": "Where?", "locale": "en"})
                if suffix else s.client.get(s.path))
    assert response.status_code == 404
    s.kal.cast_by_ids.assert_not_awaited()
    s.repo.find.assert_not_awaited()
    s.llm.submit_and_wait.assert_not_awaited()


@pytest.mark.parametrize("unavailable,expected", [(False, 404), (True, 503)])
def test_cross_book_entity_and_identity_outage(surface, unavailable, expected):
    s = surface
    s.kal.cast_by_ids.return_value = [{"entity_id": str(uuid4())}]
    if unavailable:
        s.kal.cast_by_ids.side_effect = RosterIncomplete("down")
    assert s.client.get(s.path).status_code == expected
    s.repo.find.assert_not_awaited()


def test_validation_and_missing_auth(surface):
    s = surface
    assert s.client.get(s.path + "?sources=unknown").status_code == 422
    assert s.client.get(s.path + "?limit=101").status_code == 422
    s.app.dependency_overrides.pop(r.get_current_user)
    assert s.client.get(s.path).status_code in (401, 403)
    s.repo.find.assert_not_awaited()


def test_summary_citations_language_and_book_model(surface, monkeypatch):
    s = surface
    monkeypatch.setattr(r, "extract_judge_content", lambda result: result["text"])
    response = s.client.post(s.path + "/assistant", json={"question": "Where?", "locale": "ru"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["answer"] == "Grounded summary"
    assert body["citations"][0]["citation_id"] == "r1"
    assert body["citations"][0]["node_ref"]["kind"] == "scene"
    call = s.llm.submit_and_wait.call_args.kwargs
    assert (call["model_source"], call["model_ref"]) == ("platform_model", "book-choice")
    assert call["transient_retry_budget"] == 0
    assert call["input"]["max_tokens"] == 2048
    assert "locale: ru" in call["input"]["messages"][0]["content"]
    assert "INDIRECT" in call["input"]["messages"][0]["content"]
    assert "tools" not in call["input"]
    assert len(call["input"]["messages"][1]["content"]) < 24000
    s.llm.submit_and_wait.assert_awaited_once()
    s.llm.resolve_default_model.assert_not_awaited()


@pytest.mark.parametrize("raw", ['{"answer":"Fake","citation_ids":["foreign-id"]}',
                                  '{"answer":"No support","citation_ids":[]}', 'not json'])
def test_invalid_summary_fails_closed_no_retry(surface, monkeypatch, raw):
    s = surface
    monkeypatch.setattr(r, "extract_judge_content", lambda result: raw)
    response = s.client.post(s.path + "/assistant", json={"question": "Where?", "locale": "en"})
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "REFERENCE_ASSISTANT_FAILED"
    s.llm.submit_and_wait.assert_awaited_once()


def test_explicit_and_account_models_and_unconfigured(surface, monkeypatch):
    s = surface
    monkeypatch.setattr(r, "extract_judge_content", lambda result: result["text"])
    explicit = str(uuid4())
    assert s.client.post(s.path + "/assistant", json={"question": "Where?", "locale": "en", "model_ref": explicit}).status_code == 200
    assert s.llm.submit_and_wait.call_args.kwargs["model_ref"] == explicit
    s.works.resolve_by_book.assert_not_awaited()
    s.works.resolve_by_book.return_value = []
    assert s.client.post(s.path + "/assistant", json={"question": "Where?", "locale": "en"}).status_code == 200
    assert s.llm.submit_and_wait.call_args.kwargs["model_ref"] == "account-choice"
    s.llm.resolve_default_model.return_value = None
    s.llm.submit_and_wait.reset_mock()
    assert s.client.post(s.path + "/assistant", json={"question": "Where?", "locale": "en"}).status_code == 422
    s.llm.submit_and_wait.assert_not_awaited()


def test_evidence_truncation_and_canonical_model(surface, monkeypatch):
    import json
    s = surface
    monkeypatch.setattr(r, "extract_judge_content", lambda result: result["text"])
    row = {"source": "scene_pov", "node_ref": {"kind": "scene", "id": str(uuid4()), "title": "x" * 1000}, "detail": "d" * 1000}
    s.repo.find.return_value = (20, [row] * 20)
    canonical = s.works.resolve_by_book.return_value[0]
    s.works.resolve_by_book.return_value = [SimpleNamespace(source_work_id=uuid4(), settings={"default_model_ref": "wrong-derivative"}), canonical]
    response = s.client.post(s.path + "/assistant", json={"question": "Where?", "locale": "en"})
    assert response.status_code == 200
    call = s.llm.submit_and_wait.call_args.kwargs
    context = json.loads(call["input"]["messages"][1]["content"])
    assert context["evidence_truncated"] is True
    assert 0 < context["selected_evidence_count"] <= 40
    assert len(json.dumps(context["evidence"], ensure_ascii=False)) <= 18000
    assert call["model_ref"] == "book-choice"


def test_all_source_errors_do_not_spend(surface):
    surface.repo.find.side_effect = RuntimeError("unavailable")
    response = surface.client.post(surface.path + "/assistant", json={"question": "Where?", "locale": "en"})
    assert response.status_code == 503
    surface.llm.submit_and_wait.assert_not_awaited()
