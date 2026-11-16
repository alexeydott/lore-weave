"""W5 (Wave-2 wiring) — conformance-run worker entrypoint (§14.4, P4 arc altitude).

``run_conformance_run`` is the worker handler behind the Tier-W
``composition_conformance_run`` tool: the confirm effect
(``routers/actions.py:_execute_conformance_run``) enqueues a ``conformance_run`` job;
the consumer dispatches HERE. The FROZEN input envelope (stamped by the confirm
effect) is::

    input = {
        "worker_op":  "conformance_run",
        "book_id":    str,                  # the Work's book (resolved at confirm)
        "scope":      "chapter" | "arc",
        "chapter_id": str | None,           # required when scope == "chapter"
    }

with ``user_id`` + ``project_id`` off the job row. The result is written to
``generation_job.result`` for the poll.

The compute (W5 Wave-2 — distinct from W5 Wave-1's already-shipped binary scene judge
``engine/motif_conformance.py`` + the trace READ in ``routers/conformance.py``): the
COST-GATED extract-diff. For ``scope='arc'`` it runs the generate→extract flywheel over
the arc's chapters and diffs realized structure vs the ``arc_template`` (thread
progression, pacing, legal succession, promise ledger — §14.4.3). It REUSES the
existing ``engine/motif_conformance.py`` judge functions; this module is only the
worker orchestration. Advisory, never a hard gate (§14.6). All LLM calls route through
provider-registry.

This graduates only after ``D-MOTIF-CONFORMANCE-GOLD-SET`` (calibration) — until then
conformance ships uncalibrated-advisory. W2-F0 FREEZE: SOLE worker-owned entrypoint
for conformance-run — the conformance-wiring WS fills the body; the dispatch seam is
frozen.
"""

from __future__ import annotations

import logging
from typing import Any

import asyncpg

from app.clients.llm_client import LLMClient

logger = logging.getLogger(__name__)

__all__ = ["run_conformance_run"]


async def run_conformance_run(
    pool: asyncpg.Pool, llm: LLMClient, knowledge, *, user_id: str, project_id: str,
    input: dict[str, Any], job_id: str | None = None,
) -> dict[str, Any]:
    """Run the cost-gated arc conformance extract-diff (D-W10-ARC-CONFORMANCE-DEEP-JOB).

    For ``scope='arc'`` this is the production home of the DEEP overlay: the synchronous
    ``GET …/conformance?scope=arc&deep&model_ref`` fires ~tag-threads+tag-motifs+causal-edges
    over the whole book — a storm that times out on a GET — so the FE proposes this Tier-W job
    and polls the result. It REUSES the shared ``compute_arc_report`` (the same compute the GET
    runs) with ``deep=True``. Chapter scope judges anchored manuscript scenes and returns
    the trace as the durable generation-job result consumed by REST.

    Raises ``ValueError`` (terminal business error — clean job-failed, no redeliver) on an
    unsupported scope or an unresolvable work/arc. All LLM calls route through provider-registry
    via the passed ``model_ref``/``model_source``."""
    from uuid import UUID

    from app.db.repositories.motif_repo import MotifRepo
    from app.db.repositories.structure import StructureRepo
    from app.db.repositories.works import WorksRepo
    from app.engine.arc_conformance_orchestrate import compute_arc_report
    from app.routers.conformance import ConformanceTraceReader

    scope = input.get("scope")
    if scope == "chapter":
        return await _run_chapter(pool, llm, user_id=user_id, project_id=project_id, input=input)
    if scope != "arc":
        raise ValueError(
            f"conformance_run worker supports scope='chapter' or 'arc' (got {scope!r})"
        )

    # 23-A4/BA4: the arc scope is measured against the DURABLE spec (structure_node), not the
    # template it came from. `arc_id` = structure_node.id; the deep report reads the realized
    # bindings via the first-class motif_application.structure_node_id column (by_structure=True).
    arc_id = input.get("arc_id")
    if not arc_id:
        raise ValueError("conformance_run arc scope requires arc_id (a structure_node id)")

    uid, pid = UUID(user_id), UUID(project_id)
    work = await WorksRepo(pool).get(pid)
    if work is None:
        raise ValueError("conformance_run: work not found")
    node = await StructureRepo(pool).get(UUID(arc_id))
    if node is None or node.book_id != work.book_id:
        raise ValueError("conformance_run: arc not found / not in this book")

    report = await compute_arc_report(
        reader=ConformanceTraceReader(pool), mrepo=MotifRepo(pool), knowledge=knowledge,
        user_id=uid, project_id=pid, book_id=work.book_id, arc=node, by_structure=True,
        deep=True, model_ref=input.get("model_ref"), model_source=input.get("model_source"),
        llm=llm,  # the job runs the deepest signal — the entailment judge (the GET does not)
    )

    # IX-8 — persist the durable, input-pinned snapshot through the ONE seam the sync
    # GET also uses (deep=True here; provenance = this job). BEST-EFFORT: the report is
    # already the job result the poll returns, so a snapshot-write failure is logged,
    # never fails the job (OQ-1 philosophy).
    try:
        from app.clients.book_client import get_book_client
        from app.engine.arc_conformance_orchestrate import persist_conformance_state

        await persist_conformance_state(
            pool=pool, book_client=get_book_client(), book_id=work.book_id, arc=node,
            report=report, deep=True, generation_job_id=job_id)
    except Exception:  # noqa: BLE001 — best-effort snapshot (IX-8); logged, never fatal
        logger.warning(
            "arc_conformance_state persist failed for arc %s", arc_id, exc_info=True)
    return report


async def _run_chapter(
    pool: asyncpg.Pool, llm: LLMClient, *, user_id: str, project_id: str,
    input: dict[str, Any],
) -> dict[str, Any]:
    """Explicit confirmed check of every bound scene; no generation sampling gate."""
    from hashlib import sha256
    from uuid import UUID
    from app.clients.book_client import get_book_client
    from app.config import settings
    from app.db.repositories.works import WorksRepo
    from app.db.repositories.outline import OutlineRepo
    from app.db.repositories.motif_repo import MotifRepo
    from app.engine.motif_conformance import judge_motif_conformance, build_conformance_dim, derive_tension_band
    from app.engine.motif_conformance_producer import _beat
    from app.engine.prose_doc import chapter_conformance_texts
    from app.mcp.service_bearer import mint_service_bearer
    from app.packer.profile import from_settings
    from app.routers.conformance import ConformanceTraceReader, _assemble_conformance

    pid, uid = UUID(project_id), UUID(user_id)
    work = await WorksRepo(pool).get(pid)
    if work is None or str(work.book_id) != str(input.get("book_id")):
        raise ValueError("conformance_run: work/book not found")
    if not input.get("chapter_id"):
        raise ValueError("conformance_run: chapter_id required")
    chapter_id = UUID(input["chapter_id"])
    draft = await get_book_client().get_draft(
        work.book_id, chapter_id, mint_service_bearer(uid, settings.jwt_secret))
    scenes = await OutlineRepo(pool).scenes_for_chapter(pid, chapter_id)
    if not scenes:
        raise ValueError("NO_PLANNED_SCENES")
    if not input.get("model_ref"):
        raise ValueError("conformance_run: model_ref required")
    reader = ConformanceTraceReader(pool)
    ids = [s.id for s in scenes]
    apps = await reader.apps_by_nodes(pid, ids)
    latest = await reader.latest_completed_by_nodes(pid, ids)
    texts = chapter_conformance_texts(draft.get("body"), [{"id": str(s.id), "title": s.title} for s in scenes])
    report = _assemble_conformance(chapter_id=chapter_id, calibrated=settings.motif_conformance_calibrated,
        scenes=scenes, apps_by_node=apps, latest_by_node=latest,
        manuscript_prose={sid: len(t.split()) for sid, t in texts.items()})
    for scene, row in zip(scenes, report["scenes"]):
        row["conformance"] = None  # never present an old verdict as this run's computation
        passage = texts.get(str(scene.id), "")
        row["source_sha256"] = sha256(passage.encode("utf-8")).hexdigest()
        app = apps.get(scene.id)
        if not app or not app.motif_id:
            row["check_status"] = "no_bound_motif"
            continue
        motif = await MotifRepo(pool).get_visible(uid, app.motif_id)
        if motif is None:
            row["check_status"] = "motif_unavailable"
            continue
        if not passage:
            row["check_status"] = "no_manuscript_prose"
            continue
        key = (app.annotations or {}).get("beat_key")
        beat = _beat(motif, key) or {}
        band = derive_tension_band(node_tension=scene.tension,
            beat_tension_target=beat.get("tension_target", motif.tension_target),
            halfwidth=settings.motif_conformance_tension_halfwidth)
        verdict = await judge_motif_conformance(llm, user_id=user_id,
            model_source=input.get("model_source") or "user_model", model_ref=input["model_ref"],
            beat_intent=beat.get("intent") or motif.summary or "", beat_key=key or "",
            motif_name=motif.name, tension_band=band,
            expected_roles=[str(r.get("label") or r.get("key") or "") for r in motif.roles or [] if isinstance(r, dict)],
            passage=passage, profile=from_settings(work.settings))
        row["conformance"] = build_conformance_dim(verdict, motif_id=app.motif_id,
            beat_key=key, band=band, calibrated=settings.motif_conformance_calibrated)
        row["check_status"] = "unavailable" if verdict.get("error") else "checked"
    return report
