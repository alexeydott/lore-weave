"""Sequential checkpointed orchestration of the existing quality report engine.

A session lock covers the paid execution, not a long SQL transaction. A child
observed running after lock recovery is uncertain and NEVER automatically retried.
"""
from uuid import UUID

from app.db.repositories.generation_jobs import GenerationJobsRepo
from app.worker.operations import run_quality_report


class BudgetedQualityLLM:
    """Enforce the approved call ceiling and immutable preflight context."""

    def __init__(self, llm, context, calls):
        self._llm, self._context, self._remaining = llm, context, calls

    def __getattr__(self, name):
        return getattr(self._llm, name)

    async def resolve_context_length(self, *args):
        return self._context

    async def submit_and_wait(self, *args, **kwargs):
        # No await between check/decrement: concurrent quality leaves share this ceiling.
        if self._remaining <= 0:
            raise ValueError("QUALITY_APPROVED_CALL_BUDGET_EXHAUSTED")
        self._remaining -= 1
        # One approved call is exactly one gateway submission, including failures.
        kwargs["transient_retry_budget"] = 0
        return await self._llm.submit_and_wait(*args, **kwargs)


async def run_quality_batch(pool, llm, job_id):
    repo = GenerationJobsRepo(pool)
    async with pool.acquire() as lock:
        key = f"quality-batch:{job_id}"
        acquired = await lock.fetchval("SELECT pg_try_advisory_lock(hashtextextended($1,0))", key)
        if not acquired:
            return "already_running"
        try:
            job = await repo.get(job_id)
            if job is None:
                return "not_found"
            if job.status not in ("pending", "running"):
                return f"already_{job.status}"
            await repo.update_status(job_id, "running", only_if_active=True)
            inp = job.input
            failure = None
            for chapter in inp["chapters"]:
                child_id = UUID(chapter["job_id"])
                child = await repo.get(child_id)
                # Reconcile durable terminal outcomes BEFORE stop: never discard the current result.
                if child is not None:
                    if child.status == "completed":
                        continue
                    if child.status == "running":
                        await repo.update_status(child_id, "failed", result={"error": "QUALITY_CHILD_EXECUTION_UNCERTAIN"})
                        await repo.update_status(job_id, "failed", result={"error": "QUALITY_CHILD_EXECUTION_UNCERTAIN"}, only_if_active=True)
                        return "failed"
                    if child.status in ("failed", "cancelled"):
                        # Durable failures are never retried, but do not skip other chapters.
                        failure = failure or "QUALITY_CHILD_FAILED"
                        continue
                current = await repo.get(job_id)
                if current.status not in ("pending", "running"):
                    return current.status
                if current.input.get("stop_requested"):
                    await repo.update_status(job_id, "cancelled", only_if_active=True)
                    return "cancelled"
                if child is None:
                    child, _ = await repo.create(
                        job.project_id, created_by=job.created_by, operation="quality_report", mode="auto",
                        input={"batch_parent_id": str(job_id), "chapter_id": chapter["chapter_id"],
                               "draft_version": chapter["draft_version"], "draft_sha256": chapter["draft_sha256"],
                               "model_source": inp["model_source"], "model_ref": inp["model_ref"]},
                        job_id=child_id, idempotency_key=f"quality-child:{job_id}:{child_id}")
                # Only this parent dispatches these children: no child enqueue and no worker_op stamp.
                await repo.update_status(child_id, "running", only_if_active=True)
                hydrated = {**inp, **chapter, "canon": inp["canons"][chapter["canon_key"]]}
                hydrated.pop("chapters", None)
                hydrated.pop("canons", None)

                async def progress(event):
                    await repo.update_progress(child_id, event)
                    await repo.heartbeat(job_id)

                async def cancelled():
                    # stop_requested intentionally NOT read here: stop AFTER current.
                    row = await repo.get(job_id)
                    await repo.heartbeat(job_id)
                    return row.status == "cancelled"

                try:
                    budgeted = BudgetedQualityLLM(llm, inp.get("context_window"), chapter.get("estimated_calls_max", 0))
                    result = await run_quality_report(budgeted, user_id=str(job.created_by), input=hydrated,
                                                      cancel_check=cancelled, progress_callback=progress)
                    complete = (result.get("report") or {}).get("scope", {}).get("complete") is True
                    await repo.update_status(child_id, "completed" if complete else "failed", result=result,
                                             only_if_active=True)
                    if not complete:
                        failure = failure or "QUALITY_REPORT_INCOMPLETE"
                except Exception as exc:
                    # All provider/business/infra failures after dispatch are terminal, not paid retries.
                    await repo.update_status(child_id, "failed", result={"error": str(exc)}, only_if_active=True)
                    failure = failure or "QUALITY_CHILD_FAILED"
            if failure:
                await repo.update_status(job_id, "failed", result={"error": failure}, only_if_active=True)
                return "failed"
            await repo.update_status(job_id, "completed", result={"complete": True}, only_if_active=True)
            return "completed"
        finally:
            await lock.execute("SELECT pg_advisory_unlock(hashtextextended($1,0))", key)
