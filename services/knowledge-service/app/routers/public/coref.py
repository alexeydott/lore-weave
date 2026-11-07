"""User-facing coreference-detection trigger.

The merge-candidates inbox (glossary «Кандидаты на объединение») listed
nothing forever: its only trigger was the internal-token route plus an
auto-on-extraction hook that is OFF by default — so the inbox stayed empty
even for books with obvious duplicate entities (#user-report 2026-11-08:
«там почему-то нет кандидатов, когда они точно есть»). This exposes the
SAME detection to the signed-in OWNER of the project — the FE
«Найти дубликаты» action calls it; ownership is enforced here, and the
detection itself never merges anything (it only proposes clusters for the
human to confirm in glossary).
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.config import settings
from app.db.graph import graph_session
from app.deps import get_glossary_client, get_llm_client, get_projects_repo
from app.extraction import coref_detect
from app.middleware.jwt_auth import get_current_user
from app.clients.glossary_client import GlossaryClient
from app.clients.llm_client import LLMClient
from app.db.repositories.projects import ProjectsRepo

logger = logging.getLogger(__name__)

__all__ = ["router"]

router = APIRouter(
    prefix="/v1/knowledge",
    tags=["coref"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/projects/{project_id}/coref/detect")
async def detect_coref(
    project_id: UUID,
    user_id: UUID = Depends(get_current_user),
    projects_repo: ProjectsRepo = Depends(get_projects_repo),
    glossary_client: GlossaryClient = Depends(get_glossary_client),
    llm_client: LLMClient = Depends(get_llm_client),
) -> dict[str, Any]:
    if not settings.coref_enabled:
        return {"clusters_found": 0, "proposed": 0, "suppressed": 0, "skipped": 0, "disabled": True}
    project = await projects_repo.get(user_id, project_id)
    if project is None or project.book_id is None:
        return {"clusters_found": 0, "proposed": 0, "suppressed": 0, "skipped": 0}

    uid = str(user_id)
    pid = str(project_id)
    async with graph_session() as session:
        kinds = await coref_detect.load_anchored_kinds(session, user_id=uid, project_id=pid)
        if not kinds:
            return {"clusters_found": 0, "proposed": 0, "suppressed": 0, "skipped": 0, "no_kinds": True}
        result = await coref_detect.detect_and_propose(
            session=session,
            glossary=glossary_client,
            llm=llm_client,
            user_id=uid,
            project_id=pid,
            book_id=project.book_id,
            kinds=kinds,
            score_floor=settings.coref_score_floor,
            name_weight=settings.coref_name_weight,
            struct_weight=settings.coref_struct_weight,
            max_pairs=settings.coref_max_pairs,
            max_bucket=settings.coref_max_bucket,
            max_candidates_per_kind=settings.coref_max_candidates_per_kind,
            min_mentions=settings.coref_min_mentions,
            llm_verify=settings.coref_llm_verify,
            judge_model=settings.coref_judge_model,
            judge_user=settings.coref_judge_user,
            judge_model_source=settings.coref_judge_model_source,
        )
    logger.info(
        "coref detect (user-triggered) project=%s kinds=%d clusters=%d proposed=%d suppressed=%d skipped=%d",
        pid, len(kinds), result.clusters_found, result.proposed, result.suppressed, result.skipped,
    )
    return {
        "clusters_found": result.clusters_found,
        "proposed": result.proposed,
        "suppressed": result.suppressed,
        "skipped": result.skipped,
    }
