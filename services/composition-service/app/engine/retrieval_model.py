"""Read-only embedding-role resolution for private motif and arc retrieval."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

import httpx

from app.clients.llm_client import get_llm_client
from app.config import settings
from app.engine.model_roles import model_roles_from_settings

DegradationReason = Literal[
    "model_unset", "settings_unavailable", "embed_failed", "empty_query", "vector_unavailable",
]


@dataclass(frozen=True)
class RetrievalModel:
    model: tuple[str, str] | None = None
    source_tier: Literal["book", "account"] | None = None
    degradation_reason: DegradationReason | None = None


async def resolve_retrieval_model(user_id: UUID, work_settings: dict[str, Any] | None) -> RetrievalModel:
    """Book embedding role, then registry account default; outages are not unset.

    Reference-corpus pins deliberately do not participate in this cascade.
    The registry's embedding fallback is part of its supported default-model contract.
    """
    role = model_roles_from_settings(work_settings).get("embedding")
    if role:
        return RetrievalModel((role["model_source"], role["model_ref"]), "book")
    client = get_llm_client()
    try:
        response = await client._http.get(
            f"{settings.llm_gateway_internal_url}/internal/default-models/embedding",
            params={"user_id": str(user_id)},
            headers={"X-Internal-Token": settings.internal_service_token},
        )
        if response.status_code == 404:
            return RetrievalModel(degradation_reason="model_unset")
        if response.status_code != 200:
            return RetrievalModel(degradation_reason="settings_unavailable")
        body = response.json()
        ref = body.get("user_model_id")
        source = body.get("model_source") or "user_model"
        if not isinstance(ref, str) or not ref.strip() or source != "user_model":
            return RetrievalModel(degradation_reason="settings_unavailable")
        return RetrievalModel((source, ref), "account")
    except (httpx.HTTPError, ValueError, AttributeError, TypeError):
        return RetrievalModel(degradation_reason="settings_unavailable")
