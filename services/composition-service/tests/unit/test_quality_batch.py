"""No provider, Redis or database: nonvacuous orchestration and remount tests."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.worker import quality_batch as batch
from app.routers.quality_runs import present, scoped_run
from app.worker.constants import is_worker_drivable


class Pool:
    def __init__(self):
        self.locked = False
        self.connection = SimpleNamespace(fetchval=AsyncMock(return_value=True), execute=AsyncMock())

    @asynccontextmanager
    async def acquire(self):
        yield self.connection


def fixture_run(count=3):
    now = datetime.now(timezone.utc)
    job = SimpleNamespace(id=uuid4(), project_id=uuid4(), book_id=uuid4(), created_by=uuid4(),
                          operation="quality_report_batch", status="pending", created_at=now,
                          updated_at=now, result=None)
    job.input = {"chapters": [{"chapter_id": str(uuid4()), "title": str(i), "draft_version": 4,
                              "draft_sha256": "digest", "chapter_text": "prose", "canon_key": "c",
                              "job_id": str(uuid4())} for i in range(count)],
                 "canons": {"c": "canon"}, "model_source": "user_model", "model_ref": str(uuid4()),
                 "estimated_calls_max": 6, "estimated_usd_max": 1.0}
    rows = {job.id: job}

    async def get(key):
        return rows.get(key)

    async def create(project_id, **kwargs):
        child = SimpleNamespace(id=kwargs["job_id"], input=kwargs["input"], status="pending", result=None,
                                project_id=project_id, created_by=kwargs["created_by"])
        rows[child.id] = child
        return child, True

    async def update(key, state, **kwargs):
        rows[key].status = state
        if "result" in kwargs:
            rows[key].result = kwargs["result"]
        return rows[key]

    repo = SimpleNamespace(get=AsyncMock(side_effect=get), create=AsyncMock(side_effect=create),
                           update_status=AsyncMock(side_effect=update), heartbeat=AsyncMock(), update_progress=AsyncMock())
    return job, rows, repo


@pytest.mark.asyncio
async def test_all_chapters_once_and_remount(monkeypatch):
    job, rows, repo = fixture_run()
    monkeypatch.setattr(batch, "GenerationJobsRepo", lambda pool: repo)
    compute = AsyncMock(return_value={"report": {"scope": {"complete": True}}})
    monkeypatch.setattr(batch, "run_quality_report", compute)
    assert await batch.run_quality_batch(Pool(), None, job.id) == "completed"
    assert compute.await_count == 3
    assert await batch.run_quality_batch(Pool(), None, job.id) == "already_completed"
    assert compute.await_count == 3
    restored = present(job, [v for k, v in rows.items() if k != job.id])
    assert restored["completed"] == restored["total"] == 3
    assert all(c["result"]["report"]["scope"]["complete"] for c in restored["chapters"])
    assert all("chapter_text" not in c.input and "canon" not in c.input for k, c in rows.items() if k != job.id)


@pytest.mark.asyncio
async def test_stop_after_current_preserves_result(monkeypatch):
    job, rows, repo = fixture_run()
    monkeypatch.setattr(batch, "GenerationJobsRepo", lambda pool: repo)

    async def compute(*args, **kwargs):
        job.input["stop_requested"] = True
        return {"report": {"scope": {"complete": True}}}

    mock = AsyncMock(side_effect=compute)
    monkeypatch.setattr(batch, "run_quality_report", mock)
    assert await batch.run_quality_batch(Pool(), None, job.id) == "cancelled"
    assert mock.await_count == 1
    restored = present(job, [v for k, v in rows.items() if k != job.id])
    assert [c["status"] for c in restored["chapters"]] == ["completed", "skipped", "skipped"]
    assert restored["chapters"][0]["result"] is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["incomplete", "exception", "uncertain"])
async def test_failure_never_automatically_retries(monkeypatch, outcome):
    job, rows, repo = fixture_run()
    monkeypatch.setattr(batch, "GenerationJobsRepo", lambda pool: repo)
    compute = AsyncMock(return_value={"report": {"scope": {"complete": False}}})
    if outcome == "exception":
        compute.side_effect = ValueError("parse failed")
    if outcome == "uncertain":
        c = job.input["chapters"][0]
        child, _ = await repo.create(job.project_id, job_id=__import__("uuid").UUID(c["job_id"]),
                                     input={"batch_parent_id": str(job.id)}, created_by=job.created_by)
        child.status = "running"
    monkeypatch.setattr(batch, "run_quality_report", compute)
    assert await batch.run_quality_batch(Pool(), None, job.id) == "failed"
    assert await batch.run_quality_batch(Pool(), None, job.id) == "already_failed"
    assert compute.await_count == (0 if outcome == "uncertain" else 3)
    if outcome != "uncertain":
        assert all(row.status == "failed" for key, row in rows.items() if key != job.id)
    assert not is_worker_drivable(job.operation, job.input)


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["incomplete", "exception"])
async def test_failed_first_chapter_still_attempts_second_once(monkeypatch, outcome):
    job, rows, repo = fixture_run(count=2)
    monkeypatch.setattr(batch, "GenerationJobsRepo", lambda pool: repo)
    failure = {"report": {"scope": {"complete": False}}}
    first = ValueError("synthesis failed") if outcome == "exception" else failure
    compute = AsyncMock(side_effect=[first, {"report": {"scope": {"complete": True}}}])
    monkeypatch.setattr(batch, "run_quality_report", compute)
    assert await batch.run_quality_batch(Pool(), None, job.id) == "failed"
    restored = present(job, [v for k, v in rows.items() if k != job.id])
    assert [c["status"] for c in restored["chapters"]] == ["failed", "completed"]
    assert [call.kwargs["input"]["chapter_id"] for call in compute.await_args_list] == [
        c["chapter_id"] for c in job.input["chapters"]]
    assert await batch.run_quality_batch(Pool(), None, job.id) == "already_failed"
    assert compute.await_count == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["incomplete", "exception"])
async def test_stop_after_failed_current_preserves_failure(monkeypatch, outcome):
    job, rows, repo = fixture_run(count=2)
    monkeypatch.setattr(batch, "GenerationJobsRepo", lambda pool: repo)

    async def compute(*args, **kwargs):
        job.input["stop_requested"] = True
        if outcome == "exception":
            raise ValueError("synthesis failed")
        return {"report": {"scope": {"complete": False}}}

    mock = AsyncMock(side_effect=compute)
    monkeypatch.setattr(batch, "run_quality_report", mock)
    assert await batch.run_quality_batch(Pool(), None, job.id) == "cancelled"
    restored = present(job, [v for k, v in rows.items() if k != job.id])
    assert [c["status"] for c in restored["chapters"]] == ["failed", "skipped"]
    assert restored["chapters"][0]["result"] is not None
    assert mock.await_count == 1


@pytest.mark.asyncio
async def test_duplicate_worker_cannot_enter_paid_execution(monkeypatch):
    job, _, repo = fixture_run()
    monkeypatch.setattr(batch, "GenerationJobsRepo", lambda pool: repo)
    compute = AsyncMock()
    monkeypatch.setattr(batch, "run_quality_report", compute)
    pool = Pool()
    pool.connection.fetchval.return_value = False
    assert await batch.run_quality_batch(pool, None, job.id) == "already_running"
    compute.assert_not_awaited()
    repo.update_status.assert_not_awaited()


@pytest.mark.asyncio
async def test_cross_user_and_project_reads_are_not_found():
    from fastapi import HTTPException
    job, _, repo = fixture_run()
    assert await scoped_run(repo, job.project_id, job.created_by, job.id) is job
    for project, user in [(uuid4(), job.created_by), (job.project_id, uuid4())]:
        with pytest.raises(HTTPException) as error:
            await scoped_run(repo, project, user, job.id)
        assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_preflight_exhaustive_shared_canon_and_registry_pricing(monkeypatch):
    from app.routers import quality_runs as routes
    rows = [{"chapter_id": str(uuid4()), "title": str(i)} for i in range(105)]
    book = SimpleNamespace(list_chapters=AsyncMock(return_value=rows),
                           get_draft=AsyncMock(return_value={"body": {"type": "doc"}, "draft_version": 9}))
    monkeypatch.setattr(routes, "tiptap_doc_to_text", lambda doc: "chapter text")
    monkeypatch.setattr(routes, "from_settings", lambda value: SimpleNamespace(source_language="en"))
    bible = SimpleNamespace(text="shared canon", grounding="canon", as_of=None, cast_size=2, complete=True)
    monkeypatch.setattr(routes, "canon_for_chapter", AsyncMock(return_value=bible))
    response = SimpleNamespace(raise_for_status=lambda: None,
                               json=lambda: {"items": [{"status": "ok", "estimated_usd": 0.42}]})
    client = SimpleNamespace(post=AsyncMock(return_value=response))

    @asynccontextmanager
    async def http(**kwargs):
        yield client

    monkeypatch.setattr(routes.httpx, "AsyncClient", http)
    llm = SimpleNamespace(resolve_context_length=AsyncMock(return_value=260000))
    body = routes.EstimateRequest(model_source="user_model", model_ref=str(uuid4()))
    inp = await routes.snapshot(SimpleNamespace(book_id=uuid4(), settings={}), body,
                                uuid4(), "bearer", book, None, llm)
    assert len(inp["chapters"]) == 105
    assert len(inp["canons"]) == 1
    assert inp["estimated_calls_max"] == 210
    assert inp["estimated_usd_max"] == 0.42
    assert book.list_chapters.await_args.kwargs == {"limit": 100001, "raise_on_404": True}
    assert book.get_draft.await_count == 105
    request = client.post.await_args.kwargs["json"]
    assert request["items"][0]["input_tokens"] > 0
    assert request["items"][0]["output_tokens"] > 0


@pytest.mark.asyncio
async def test_budget_rejection_does_not_create_or_enqueue(monkeypatch):
    from fastapi import HTTPException
    from app.routers import quality_runs as routes
    job, _, _ = fixture_run()
    monkeypatch.setattr(routes, "_require_work", AsyncMock(return_value=SimpleNamespace()))
    monkeypatch.setattr(routes, "snapshot", AsyncMock(return_value=job.input))
    monkeypatch.setattr(routes.settings, "composition_worker_enabled", True)
    enqueue = AsyncMock()
    monkeypatch.setattr(routes, "enqueue_job", enqueue)
    jobs = SimpleNamespace(get_by_idempotency_key=AsyncMock(return_value=None),
                           quality_runs=AsyncMock(return_value=[]), create_quality_run=AsyncMock())
    body = routes.SubmitRequest(model_source="user_model", model_ref="m", idempotency_key="retry",
                                max_estimated_calls=1, max_estimated_usd=0.01)
    with pytest.raises(HTTPException) as error:
        await routes.submit(job.project_id, body, job.created_by, "bearer", None, None, None, None, None, jobs)
    assert error.value.status_code == 409
    jobs.create_quality_run.assert_not_awaited()
    enqueue.assert_not_awaited()


@pytest.mark.asyncio
async def test_lost_response_replay_skips_preflight_and_paid_submission(monkeypatch):
    from app.routers import quality_runs as routes
    job, _, _ = fixture_run()
    monkeypatch.setattr(routes, "_require_work", AsyncMock())
    preflight = AsyncMock()
    monkeypatch.setattr(routes, "snapshot", preflight)
    jobs = SimpleNamespace(get_by_idempotency_key=AsyncMock(return_value=job),
                           list_by_ids=AsyncMock(return_value=[]), create_quality_run=AsyncMock())
    body = routes.SubmitRequest(model_source="user_model", model_ref="m", idempotency_key="retry",
                                max_estimated_calls=6, max_estimated_usd=1)
    result = await routes.submit(job.project_id, body, job.created_by, "bearer", None, None, None, None, None, jobs)
    assert result["id"] == str(job.id)
    preflight.assert_not_awaited()
    jobs.create_quality_run.assert_not_awaited()


@pytest.mark.asyncio
async def test_quality_runs_binds_json_owner_as_text():
    from app.db.repositories.generation_jobs import GenerationJobsRepo
    pool = Pool()
    pool.connection.fetch = AsyncMock(return_value=[])
    project_id, user_id = uuid4(), uuid4()
    assert await GenerationJobsRepo(pool).quality_runs(project_id, user_id, "user_model", "model") == []
    sql, *args = pool.connection.fetch.await_args.args
    assert "project_id=$1" in sql
    assert "input->>'owner_user_id'=$2::text" in sql
    assert args == [project_id, str(user_id), "user_model", "model"]
    assert type(args[1]) is str


@pytest.mark.asyncio
async def test_latest_chapter_quality_job_scopes_project_chapter_and_operation():
    from app.db.repositories.generation_jobs import GenerationJobsRepo
    pool = Pool()
    pool.connection.fetchrow = AsyncMock(return_value=None)
    project_id, chapter_id = uuid4(), uuid4()
    assert await GenerationJobsRepo(pool).latest_chapter_quality_job(project_id, chapter_id) is None
    sql, *args = pool.connection.fetchrow.await_args.args
    assert "project_id=$1" in sql
    assert "operation='quality_report'" in sql
    assert "input->>'chapter_id'=$2" in sql
    # Latest-wins with a deterministic tiebreak; batch runs stay on /quality-runs.
    assert "ORDER BY created_at DESC, id DESC LIMIT 1" in sql
    assert "quality_report_batch" not in sql
    assert args == [project_id, str(chapter_id)]


@pytest.mark.asyncio
async def test_runtime_budget_and_context_are_frozen():
    llm = SimpleNamespace(submit_and_wait=AsyncMock(return_value="done"),
                          resolve_context_length=AsyncMock(return_value=1))
    guarded = batch.BudgetedQualityLLM(llm, 260000, 2)
    assert await guarded.resolve_context_length("s", "m") == 260000
    assert await guarded.submit_and_wait() == "done"
    assert await guarded.submit_and_wait() == "done"
    with pytest.raises(ValueError, match="BUDGET_EXHAUSTED"):
        await guarded.submit_and_wait()
    assert llm.submit_and_wait.await_count == 2
    llm.resolve_context_length.assert_not_awaited()


@pytest.mark.asyncio
async def test_atomic_repo_dedup_under_concurrent_submit_and_replay(monkeypatch):
    import asyncio
    from app.db.repositories.generation_jobs import GenerationJobsRepo
    from app.db.repositories import generation_jobs as module
    job, _, _ = fixture_run()
    gate = asyncio.Lock()
    stored = []
    queries = []

    class Connection:
        @asynccontextmanager
        async def transaction(self):
            async with gate:
                yield

        async def execute(self, sql, *args):
            queries.append(sql)

        async def fetchrow(self, sql, *args):
            queries.append(sql)
            assert type(args[1]) is str
            assert args[1] == str(job.created_by)
            if not stored:
                return None
            candidate = stored[0]
            key, source, ref = args[2:]
            if (candidate.idempotency_key == key or key in candidate.input.get("submission_keys", [])
                    or (candidate.status in ("pending", "running") and candidate.input["model_source"] == source
                        and candidate.input["model_ref"] == ref)):
                return {"id": candidate.id, "job": candidate}
            return None

    connection = Connection()
    pool = Pool()
    pool.connection = connection
    repo = GenerationJobsRepo(pool)
    monkeypatch.setattr(module, "_row_to_job", lambda row: row["job"])

    async def create(project_id, **kwargs):
        await asyncio.sleep(0)
        job.input = kwargs["input"]
        job.idempotency_key = kwargs["idempotency_key"]
        stored.append(job)
        return job, True

    monkeypatch.setattr(repo, "create", create)
    a, b = await asyncio.gather(
        repo.create_quality_run(job.project_id, job.created_by, job.input, "key"),
        repo.create_quality_run(job.project_id, job.created_by, job.input, "key"))
    assert a[0].id == b[0].id
    assert len(stored) == 1
    assert sum([a[1], b[1]]) == 1
    job.status = "completed"
    replay, created = await repo.create_quality_run(job.project_id, job.created_by, job.input, "key")
    assert replay.id == job.id and not created
    assert any("pg_advisory_xact_lock" in q for q in queries)
    assert any("project_id=$1 AND input->>'owner_user_id'=$2::text" in q for q in queries)
    assert job.input["owner_user_id"] == str(job.created_by)


@pytest.mark.asyncio
async def test_budget_wrapper_disables_resubmit_at_real_gateway_boundary():
    from app.clients.llm_client import LLMClient
    from loreweave_llm.errors import LLMTransientRetryNeededError
    # Exercise the REAL retry loop; this error WOULD resubmit with its default budget.
    llm = object.__new__(LLMClient)
    transient = LLMTransientRetryNeededError("rate", job_id="j", underlying_code="LLM_RATE_LIMITED")
    sdk = SimpleNamespace(submit_job=AsyncMock(return_value=SimpleNamespace(job_id=uuid4())),
                          wait_terminal=AsyncMock(side_effect=transient))
    llm._sdk = sdk
    guarded = batch.BudgetedQualityLLM(llm, 260000, 1)
    with pytest.raises(LLMTransientRetryNeededError):
        await guarded.submit_and_wait(user_id=str(uuid4()), operation="chat", model_source="user_model",
                                      model_ref=str(uuid4()), input={}, transient_retry_budget=9)
    assert sdk.submit_job.await_count == 1
    assert sdk.wait_terminal.await_args.kwargs["transient_retry_budget"] == 0
