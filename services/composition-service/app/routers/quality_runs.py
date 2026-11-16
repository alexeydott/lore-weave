"""Durable book-wide quality runs; immutable inputs, existing quality worker engine."""
from __future__ import annotations

import hashlib
import json
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.routers.plan import (
    _require_work, BookClient, KalClient, WorksRepo, GrantClient, GrantLevel,
    get_current_user, get_bearer_token, get_works_repo, get_book_client_dep,
    get_kal_client_dep, get_grant_client_dep, get_llm_client_dep,
    get_generation_jobs_repo, canon_for_chapter, tiptap_doc_to_text, from_settings,
)
from app.clients.llm_client import LLMClient
from app.config import settings
from app.db.repositories.generation_jobs import GenerationJobsRepo
from app.engine.quality_analysis import plan_quality_analysis
from app.worker.events import enqueue_job

router = APIRouter(prefix="/v1/composition/works/{project_id}/quality-runs")


class EstimateRequest(BaseModel):
    model_source: str = Field(min_length=1, max_length=50)
    model_ref: str = Field(min_length=1, max_length=200)


class SubmitRequest(EstimateRequest):
    idempotency_key: str = Field(min_length=1, max_length=200)
    max_estimated_calls: int = Field(ge=1)
    max_estimated_usd: float = Field(ge=0, allow_inf_nan=False)


def present(job, children=()):
    inp = job.input or {}
    by_id = {str(c.id): c for c in children}
    chapters = []
    for item in inp["chapters"]:
        child = by_id.get(item["job_id"])
        state = child.status if child else "pending"
        if state == "cancelled":
            state = "skipped"
        if (child is None or child.status == "pending") and job.status in ("cancelled", "failed"):
            state = "skipped"
        chapters.append({k: item.get(k) for k in
                         ("chapter_id", "title", "draft_version", "draft_sha256", "job_id")} |
                        {"status": state, "result": child.result if child else None,
                         "error": (child.result or {}).get("error") if child else None})
    return {"id": str(job.id), "project_id": str(job.project_id), "book_id": str(job.book_id),
            "model_source": inp["model_source"], "model_ref": inp["model_ref"],
            "status": job.status, "stop_requested": inp.get("stop_requested", False),
            "total": len(chapters), "completed": sum(c["status"] == "completed" for c in chapters),
            "failed": sum(c["status"] == "failed" for c in chapters),
            "current_chapter_id": next((c["chapter_id"] for c in chapters if c["status"] == "running"), None),
            "chapters": chapters, "estimated_calls_max": inp["estimated_calls_max"],
            "estimated_usd_max": inp["estimated_usd_max"],
            "created_at": job.created_at.isoformat(), "updated_at": job.updated_at.isoformat()}


async def representation(jobs, job):
    ids = [UUID(c["job_id"]) for c in job.input["chapters"]]
    children = await jobs.list_by_ids(ids)
    # Parent refs cannot disclose a foreign resource even on corrupt persisted input.
    children = [c for c in children if c.project_id == job.project_id and c.created_by == job.created_by
                and (c.input or {}).get("batch_parent_id") == str(job.id)]
    return present(job, children)


async def snapshot(work, body, user_id, bearer, book, kal, llm):
    from uuid import uuid4
    # list_chapters paginates; never silently call a capped manifest ALL.
    rows = await book.list_chapters(work.book_id, bearer, limit=100001, raise_on_404=True)
    if len(rows) >= 100001:
        raise HTTPException(422, detail={"code": "QUALITY_MANIFEST_TOO_LARGE"})
    if not rows:
        raise HTTPException(400, detail={"code": "NO_CHAPTERS"})
    language = from_settings(work.settings).source_language
    context = await llm.resolve_context_length(body.model_source, body.model_ref)
    if not context:
        raise HTTPException(503, detail={"code": "MODEL_CONTEXT_UNAVAILABLE"})
    chapters, canons = [], {}
    calls, input_tokens, output_tokens = 0, 0, 0
    seen = set()
    for row in rows:
        chapter_id = str(row.get("chapter_id") or row.get("id"))
        if chapter_id in seen:
            raise HTTPException(502, detail={"code": "DUPLICATE_CHAPTER_MANIFEST"})
        seen.add(chapter_id)
        draft = await book.get_draft(work.book_id, UUID(chapter_id), bearer)
        text = tiptap_doc_to_text(draft.get("body") or draft.get("doc") or draft.get("content"))
        if not text.strip():
            raise HTTPException(400, detail={"code": "EMPTY_DRAFT", "chapter_id": chapter_id})
        bible = await canon_for_chapter(kal=kal, book=book, book_id=work.book_id,
                                       chapter_id=UUID(chapter_id), user_id=user_id, bearer=bearer,
                                       source_language=language, require_complete=True)
        canon_key = hashlib.sha256(bible.text.encode()).hexdigest()
        canons[canon_key] = bible.text
        plan = plan_quality_analysis(chapter=text, canon=bible.text, context_window=context,
                                     source_language=language)
        if not plan["callable"]:
            raise HTTPException(422, detail={"code": "MODEL_CONTEXT_TOO_SMALL"})
        count = plan["leaf_calls"] + plan["synthesis_calls_max"]
        calls += count
        # Conservative whole-run bound: every bounded call at full input/output cap.
        # Full context includes system/schema/source-label overhead as well as prose.
        input_tokens += count * context
        output_tokens += count * max(plan["max_tokens_critic"], plan["max_tokens_promise"])
        chapters.append({"chapter_id": chapter_id, "title": row.get("title") or "",
                         "draft_version": draft.get("draft_version"),
                         "draft_sha256": hashlib.sha256(text.encode()).hexdigest(),
                         "chapter_text": text, "canon_key": canon_key, "job_id": str(uuid4()),
                         "canon_grounding": {"grounding": bible.grounding, "as_of": bible.as_of,
                                             "cast_size": bible.cast_size, "complete": bible.complete},
                         "estimated_calls_max": count})
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            response = await client.post(settings.llm_gateway_internal_url + "/internal/billing/estimate",
                headers={"X-Internal-Token": settings.internal_service_token},
                json={"owner_user_id": str(user_id), "items": [{"label": "quality_run",
                      "model_source": body.model_source, "model_ref": body.model_ref,
                      "dimension": "text", "input_tokens": input_tokens, "output_tokens": output_tokens}]})
            response.raise_for_status()
            price = response.json()["items"][0]
            if price["status"] != "ok":
                raise ValueError("model is not priced")
            usd = float(price["estimated_usd"])
            import math
            if not math.isfinite(usd) or usd < 0:
                raise ValueError("invalid price")
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
            raise HTTPException(503, detail={"code": "QUALITY_PRICING_UNAVAILABLE"}) from exc
    return {"worker_op": "quality_report_batch", "model_source": body.model_source,
            "model_ref": body.model_ref, "source_language": language,
            "context_window": context, "chapters": chapters, "canons": canons,
            "estimated_calls_max": calls, "estimated_usd_max": usd, "stop_requested": False}


@router.post("/estimate")
async def estimate(project_id: UUID, body: EstimateRequest,
                   user_id: UUID = Depends(get_current_user), bearer: str = Depends(get_bearer_token),
                   works: WorksRepo = Depends(get_works_repo), book: BookClient = Depends(get_book_client_dep),
                   kal: KalClient = Depends(get_kal_client_dep), llm: LLMClient = Depends(get_llm_client_dep),
                   grant: GrantClient = Depends(get_grant_client_dep)):
    work = await _require_work(works, grant, user_id, project_id, GrantLevel.EDIT)
    inp = await snapshot(work, body, user_id, bearer, book, kal, llm)
    return {"total": len(inp["chapters"]), "estimated_calls_max": inp["estimated_calls_max"],
            "estimated_usd_max": inp["estimated_usd_max"], "chapters": [
                {k: c[k] for k in ("chapter_id", "title", "draft_version", "draft_sha256", "estimated_calls_max")}
                for c in inp["chapters"]]}


@router.post("", status_code=202)
async def submit(project_id: UUID, body: SubmitRequest,
                 user_id: UUID = Depends(get_current_user), bearer: str = Depends(get_bearer_token),
                 works: WorksRepo = Depends(get_works_repo), book: BookClient = Depends(get_book_client_dep),
                 kal: KalClient = Depends(get_kal_client_dep), llm: LLMClient = Depends(get_llm_client_dep),
                 grant: GrantClient = Depends(get_grant_client_dep),
                 jobs: GenerationJobsRepo = Depends(get_generation_jobs_repo)):
    work = await _require_work(works, grant, user_id, project_id, GrantLevel.EDIT)
    key = "quality-run:" + hashlib.sha256(json.dumps([str(project_id), str(user_id), body.model_source,
                                                     body.model_ref, body.idempotency_key]).encode()).hexdigest()
    previous = await jobs.get_by_idempotency_key(project_id, key)
    if previous is not None:
        return await representation(jobs, previous)
    active = await jobs.quality_runs(project_id, user_id, body.model_source, body.model_ref)
    for previous in active:
        if key in (previous.input or {}).get("submission_keys", []):
            return await representation(jobs, previous)
    if not settings.composition_worker_enabled:
        raise HTTPException(503, detail={"code": "QUALITY_WORKER_REQUIRED"})
    inp = await snapshot(work, body, user_id, bearer, book, kal, llm)
    if inp["estimated_calls_max"] > body.max_estimated_calls or inp["estimated_usd_max"] > body.max_estimated_usd:
        raise HTTPException(409, detail={"code": "QUALITY_RUN_BUDGET_EXCEEDED",
                            "estimated_calls_max": inp["estimated_calls_max"],
                            "estimated_usd_max": inp["estimated_usd_max"]})
    job, created = await jobs.create_quality_run(project_id, user_id, inp, key)
    if created:
        await enqueue_job(settings.redis_url, job_id=str(job.id), user_id=str(user_id), project_id=str(project_id))
    return await representation(jobs, job)


@router.get("")
async def list_runs(project_id: UUID, model_source: str, model_ref: str,
                    user_id: UUID = Depends(get_current_user), works: WorksRepo = Depends(get_works_repo),
                    grant: GrantClient = Depends(get_grant_client_dep),
                    jobs: GenerationJobsRepo = Depends(get_generation_jobs_repo)):
    await _require_work(works, grant, user_id, project_id, GrantLevel.VIEW)
    return {"runs": [await representation(jobs, j) for j in
                     await jobs.quality_runs(project_id, user_id, model_source, model_ref)]}


async def scoped_run(jobs, project_id, user_id, run_id):
    job = await jobs.get(run_id)
    if (job is None or job.project_id != project_id or job.created_by != user_id
            or job.operation != "quality_report_batch"):
        raise HTTPException(404, detail="quality run not found")
    return job


@router.get("/{run_id}")
async def get_run(project_id: UUID, run_id: UUID, user_id: UUID = Depends(get_current_user),
                  works: WorksRepo = Depends(get_works_repo), grant: GrantClient = Depends(get_grant_client_dep),
                  jobs: GenerationJobsRepo = Depends(get_generation_jobs_repo)):
    await _require_work(works, grant, user_id, project_id, GrantLevel.VIEW)
    return await representation(jobs, await scoped_run(jobs, project_id, user_id, run_id))


@router.post("/{run_id}/stop")
async def stop_run(project_id: UUID, run_id: UUID, user_id: UUID = Depends(get_current_user),
                   works: WorksRepo = Depends(get_works_repo), grant: GrantClient = Depends(get_grant_client_dep),
                   jobs: GenerationJobsRepo = Depends(get_generation_jobs_repo)):
    await _require_work(works, grant, user_id, project_id, GrantLevel.EDIT)
    await scoped_run(jobs, project_id, user_id, run_id)
    await jobs.request_quality_stop(run_id)
    return await representation(jobs, await scoped_run(jobs, project_id, user_id, run_id))
