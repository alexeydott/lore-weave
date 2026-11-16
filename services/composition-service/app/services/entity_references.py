"""Shared composition-only inverse reads. Counts are exact; failed sources are not zeroes."""
from __future__ import annotations

import logging
from uuid import UUID

from app.db.repositories.entity_references import EntityReferencesRepo
from app.services.agent_native import REFERENCE_SOURCES

logger = logging.getLogger(__name__)


async def find_entity_references(repo: EntityReferencesRepo, *, book_id: UUID,
                                 entity_id: UUID, sources=None, limit: int = 20) -> dict:
    want = tuple(dict.fromkeys(sources or REFERENCE_SOURCES))
    if any(source not in REFERENCE_SOURCES for source in want):
        raise ValueError("unknown reference source")
    cap = max(1, min(int(limit or 20), 100))
    out = {}
    for source in want:
        try:
            count, refs = await repo.find(source, book_id=book_id, entity_id=entity_id, limit=cap)
        except Exception:  # noqa: BLE001 — independent sources degrade independently
            logger.warning("find_references: source %s failed", source, exc_info=True)
            out[source] = {"error": "this source could not be read"}
            continue
        out[source] = {"count": count, "refs": refs[:cap], "has_more": count > min(len(refs), cap)}
    return {"book_id": str(book_id), "entity_id": str(entity_id), "sources": out,
            "_meta": {"note": "Composition scope only. The prose side is glossary_get_entity "
                      "(chapter links + evidence); the graph side is kg_entity_edge_timeline."}}
