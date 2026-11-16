"""Embedding role and degradation regressions; no network or database."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest

from app.engine import retrieval_model as models
from app.db.repositories import motif_retrieve as retrieve


@pytest.mark.parametrize("status,body,reason", [
    (404, {}, "model_unset"),
    (503, {}, "settings_unavailable"),
    (200, {}, "settings_unavailable"),
])
async def test_account_unset_is_not_outage(monkeypatch, status, body, reason):
    http = SimpleNamespace(get=AsyncMock(return_value=httpx.Response(status, json=body)))
    monkeypatch.setattr(models, "get_llm_client", lambda: SimpleNamespace(_http=http))
    result = await models.resolve_retrieval_model(uuid4(), {})
    assert result.model is None
    assert result.degradation_reason == reason


async def test_book_role_beats_reference_pin_and_account(monkeypatch):
    def forbidden():
        raise AssertionError("book role must not read account")
    monkeypatch.setattr(models, "get_llm_client", forbidden)
    result = await models.resolve_retrieval_model(uuid4(), {
        "model_roles": {"embedding": {"model_ref": "book-embed", "model_source": "user_model"}},
        "reference_embed_model_ref": "wrong-corpus-pin",
    })
    assert result == models.RetrievalModel(("user_model", "book-embed"), "book")


async def test_account_fallback_ignores_reference_pin(monkeypatch):
    http = SimpleNamespace(get=AsyncMock(return_value=httpx.Response(200, json={
        "user_model_id": "account-embed", "model_source": "user_model", "source": "embedding_fallback",
    })))
    monkeypatch.setattr(models, "get_llm_client", lambda: SimpleNamespace(_http=http))
    user = uuid4()
    result = await models.resolve_retrieval_model(user, {"reference_embed_model_ref": "wrong"})
    assert result == models.RetrievalModel(("user_model", "account-embed"), "account")
    assert http.get.call_args.kwargs["params"] == {"user_id": str(user)}


async def test_transport_failure_is_settings_unavailable(monkeypatch):
    http = SimpleNamespace(get=AsyncMock(side_effect=httpx.ConnectError("offline")))
    monkeypatch.setattr(models, "get_llm_client", lambda: SimpleNamespace(_http=http))
    assert (await models.resolve_retrieval_model(uuid4(), {})).degradation_reason == "settings_unavailable"


@pytest.mark.parametrize("failure,expected", [
    (retrieve.EmbedConfigError("missing"), "model_unset"),
    (retrieve.EmbeddingError("rejected", retryable=False), "embed_failed"),
])
async def test_library_failure_does_not_disable_private(monkeypatch, failure, expected):
    from tests.unit.test_arc_retrieve import _arc, _retriever
    caller = uuid4()
    private = _arc("mine", embedding=[0., 1., 0.], owner=caller)
    private["embedding_model"] = "account-embed"
    library = _arc("library", embedding=[1., 0., 0.])
    monkeypatch.setattr(retrieve, "embed_query", AsyncMock(side_effect=failure))
    embed = AsyncMock(return_value=[0., 1., 0.])
    monkeypatch.setattr(retrieve, "embed_query_with", embed)
    retriever = _retriever([private, library])
    out = await retriever.retrieve_arcs(caller, premise="intent", model_resolution=models.RetrievalModel(
        ("user_model", "account-embed"), "account"))
    assert out[0].score == pytest.approx(1.)
    assert out[0].match_reason["model_source_tier"] == "account"
    assert not out[0].match_reason.get("degraded")
    assert out[1].match_reason["degradation_reason"] == expected
    assert retriever._pool.conn.executed == []
    assert embed.call_args.kwargs["user_id"] == caller


async def test_empty_query_never_calls_provider(monkeypatch):
    from tests.unit.test_arc_retrieve import _arc, _retriever
    forbidden = AsyncMock(side_effect=AssertionError("empty query must not embed"))
    monkeypatch.setattr(retrieve, "embed_query", forbidden)
    monkeypatch.setattr(retrieve, "embed_query_with", forbidden)
    caller = uuid4()
    out = await _retriever([_arc("mine", embedding=None, owner=caller)]).retrieve_arcs(
        caller, model_resolution=models.RetrievalModel(("user_model", "embed"), "book"))
    assert out[0].match_reason["degradation_reason"] == "empty_query"
    forbidden.assert_not_called()
