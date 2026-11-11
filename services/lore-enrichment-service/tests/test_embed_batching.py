"""Unit tests for the ingest embed BATCHING (#user-report 2026-11-10).

Grounding 2 chapters sent 40+ chunk texts in ONE /internal/embed call; the
provider round-trip blew the 30s embed timeout and every multi-chapter ground
failed (503 "embedding failed: timeout"). The store must embed in bounded
batches with the per-call count contract checked per batch.
"""

from __future__ import annotations

from app.retrieval.store import _EMBED_BATCH, _batched


def test_batched_partitions_deterministically_and_preserves_order():
    items = [str(i) for i in range(50)]
    batches = list(_batched(items, _EMBED_BATCH))
    assert [len(b) for b in batches] == [_EMBED_BATCH, _EMBED_BATCH, _EMBED_BATCH, 2]
    assert [x for b in batches for x in b] == items  # order + content preserved
    assert batches[0][0] == "0" and batches[-1][-1] == "49"


def test_batched_handles_empty_and_exact_fits():
    assert list(_batched([], 16)) == []
    assert [len(b) for b in _batched(["a"] * 16, 16)] == [16]
    assert [len(b) for b in _batched(["a", "b"], 16)] == [2]
