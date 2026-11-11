"""list_objects() storage boundary (#user-report 2026-11-10).

The dev stack names `lore-enrichment-uploads` but nothing provisions it until
the first upload, so the reaper's paginator raised NoSuchBucket every sweep.
The docstring already promised [] for an absent bucket — pin it, AND pin that
any OTHER ClientError still propagates (a silent [] on access-denied would turn
the orphan sweep into a no-op that looks clean).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from botocore.exceptions import ClientError

from app.storage import minio_client


def _client_error(code: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": code}}, "ListObjectsV2")


@pytest.mark.asyncio
async def test_list_objects_missing_bucket_returns_empty(monkeypatch):
    class _Paginator:
        def paginate(self, Bucket):
            raise _client_error("NoSuchBucket")

    monkeypatch.setattr(minio_client, "_s3_client", lambda: SimpleNamespace(
        get_paginator=lambda op: _Paginator()))
    assert await minio_client.list_objects() == []


@pytest.mark.asyncio
async def test_list_objects_access_denied_propagates(monkeypatch):
    class _Paginator:
        def paginate(self, Bucket):
            raise _client_error("AccessDenied")

    monkeypatch.setattr(minio_client, "_s3_client", lambda: SimpleNamespace(
        get_paginator=lambda op: _Paginator()))
    with pytest.raises(ClientError):
        await minio_client.list_objects()


@pytest.mark.asyncio
async def test_list_objects_happy_path_maps_objects(monkeypatch):
    from datetime import datetime, timezone

    class _Paginator:
        def paginate(self, Bucket):
            yield {"Contents": [
                {"Key": "u/b/uid.txt", "LastModified": datetime(2026, 1, 1, tzinfo=timezone.utc)},
            ]}

    monkeypatch.setattr(minio_client, "_s3_client", lambda: SimpleNamespace(
        get_paginator=lambda op: _Paginator()))
    out = await minio_client.list_objects()
    assert len(out) == 1 and out[0].key == "u/b/uid.txt"



