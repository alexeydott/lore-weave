"""narrative_thread read router — the promise-ledger debt surface (FD-1 S4a).

`GET /works/{project_id}/narrative-threads` exposes the ledger so an author/FE
can see the unpaid debt (spec §7 foreshadow-drop: open promises still owed). The
`open` set IS the advisory debt — D4: a flag/signal the author acts on, never a
hard gate. The producer (S2) writes the ledger; the pack re-injection (S3) feeds
generation; this read closes the human-visibility side.

Read-only; the ledger is written by the generation flow, not here.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints

from app.db.models import NarrativeThread
from app.db.repositories.narrative_thread import NarrativeThreadRepo
from app.db.repositories.works import WorksRepo
from app.deps import get_grant_client_dep, get_narrative_thread_repo, get_works_repo
from app.grant_client import GrantClient, GrantLevel
from app.grant_deps import InsufficientGrant, authorize_book
from app.middleware.jwt_auth import get_current_user
from app.packer.pack import OwnershipError

router = APIRouter(prefix="/v1/composition")


async def _require_work(
    works: WorksRepo, grant: GrantClient, user_id: UUID, project_id: UUID,
) -> None:
    """PM-8/PM-9: resolve the Work by `project_id` (un-user-scoped) and gate the
    caller's E0 VIEW grant on its `book_id` — reading the promise ledger is a VIEW
    act. Before the package re-key this checked EXISTENCE only; after de-usering the
    repo that would be zero access control (any authenticated caller could read any
    book's ledger by guessing the project id). A missing project OR a no-grant caller
    → uniform 404 (anti-oracle); a grantee under VIEW → 403."""
    work = await works.get(project_id)
    if work is None:
        raise HTTPException(status_code=404, detail="work not found")
    try:
        await authorize_book(grant, work.book_id, user_id, GrantLevel.VIEW)
    except OwnershipError:
        raise HTTPException(status_code=404, detail="work not found")
    except InsufficientGrant:
        raise HTTPException(status_code=403, detail="insufficient access")


@router.get("/works/{project_id}/narrative-threads")
async def list_narrative_threads(
    project_id: UUID,
    status: Literal["open", "all"] = "open",
    user_id: UUID = Depends(get_current_user),
    works: WorksRepo = Depends(get_works_repo),
    threads: NarrativeThreadRepo = Depends(get_narrative_thread_repo),
    grant: GrantClient = Depends(get_grant_client_dep),
) -> dict[str, Any]:
    """List the work's narrative threads. `status=open` (default) = the unpaid
    debt (open/progressing, priority-ordered) — the §7 arc-end check; `status=all`
    = the full ledger (any status) for review. `open_count` is the advisory
    debt signal regardless of the `status` filter."""
    await _require_work(works, grant, user_id, project_id)
    rows = await (threads.list_open(project_id) if status == "open"
                  else threads.list_for_project(project_id))
    # open_count is the TRUE debt (a COUNT), independent of the `status` filter and
    # NOT capped by list_open's LIMIT (review-impl MED#1).
    return {
        "threads": [t.model_dump(mode="json") for t in rows],
        "open_count": await threads.count_open(project_id),
    }


# ── Edits (#user-report 2026-11-08) — the ledger rows are the author\x27s own
# notes, so the author edits/retires them like any other note. EDIT-tier
# (mutating), owner-gated via the same work resolve as the read above.

_THREAD_KIND = Annotated[str, StringConstraints(min_length=3, max_length=40)]


class ThreadUpdateBody(BaseModel):
    summary: Annotated[str, StringConstraints(min_length=3, max_length=500)] | None = None
    kind: _THREAD_KIND | None = None


async def _require_work_edit(
    works: WorksRepo, grant: GrantClient, user_id: UUID, project_id: UUID,
) -> None:
    work = await works.get(project_id)
    if work is None:
        raise HTTPException(status_code=404, detail="work not found")
    try:
        await authorize_book(grant, work.book_id, user_id, GrantLevel.EDIT)
    except OwnershipError:
        raise HTTPException(status_code=404, detail="work not found")
    except InsufficientGrant:
        raise HTTPException(status_code=403, detail="insufficient access")


@router.patch("/works/{project_id}/narrative-threads/{thread_id}")
async def update_narrative_thread(
    project_id: UUID,
    thread_id: UUID,
    body: ThreadUpdateBody,
    user_id: UUID = Depends(get_current_user),
    works: WorksRepo = Depends(get_works_repo),
    threads: NarrativeThreadRepo = Depends(get_narrative_thread_repo),
    grant: GrantClient = Depends(get_grant_client_dep),
) -> NarrativeThread:
    """Edit an OPEN promise\x27s summary and/or kind. Paid/dropped rows are frozen
    history and refuse the edit (the ledger\x27s audit value). OCC-free per the
    repo\x27s advisory-ledger contract."""
    await _require_work_edit(works, grant, user_id, project_id)
    updated = await threads.update_content(
        project_id, thread_id, summary=body.summary, kind=body.kind,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="open promise not found")
    return updated


@router.delete("/works/{project_id}/narrative-threads/{thread_id}")
async def archive_narrative_thread(
    project_id: UUID,
    thread_id: UUID,
    user_id: UUID = Depends(get_current_user),
    works: WorksRepo = Depends(get_works_repo),
    threads: NarrativeThreadRepo = Depends(get_narrative_thread_repo),
    grant: GrantClient = Depends(get_grant_client_dep),
) -> dict[str, Any]:
    """Archive (soft-delete) an open promise — the row stays for the audit
    trail but disappears from the ledger and the re-injection set."""
    await _require_work_edit(works, grant, user_id, project_id)
    archived = await threads.archive_thread(project_id, thread_id)
    if not archived:
        raise HTTPException(status_code=404, detail="open promise not found")
    return {"archived": True}
