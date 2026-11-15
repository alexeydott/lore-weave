"""P0-2 (round 8) — the throwaway-DB guard lives in exactly one place.

`test_neo4j_to_age_migration_live` used to define its own local
`_guard_throwaway` with a copy of the marker set from this directory's
conftest. The copy was behaviorally identical, but a second copy of a
safety predicate is a drift surface: a future marker added to the shared
helper would silently not reach this suite, whose fixture clears every
graph in its destination database. The module now imports the shared
helper; these tests pin that: the module's `_guard_throwaway` IS the
conftest's, the shared predicate accepts every throwaway marker while
refusing production-shaped names, and the AGE caller's message still
names its own env var (`TEST_AGE_DSN`) and its own destructive action
(clearing AGE graphs) via the shared helper's keyword-only params.
"""

from __future__ import annotations

import pytest

from tests.integration.db import test_neo4j_to_age_migration_live
from tests.integration.db.conftest import _guard_throwaway

_MARKERS = ("test", "smoke", "audit", "scratch", "throwaway", "tmp", "sandbox", "ephemeral")
_PRODUCTION_NAMES = (
    "loreweave_knowledge",
    "loreweave_book",
    "loreweave_composition",
    "production",
    "maindb",
)


def _dsn(db: str) -> str:
    return f"postgresql://u:p@h:5432/{db}"


@pytest.mark.parametrize("marker", _MARKERS)
def test_guard_accepts_every_throwaway_marker(marker: str) -> None:
    _guard_throwaway(_dsn(f"loreweave_knowledge_{marker}"))


@pytest.mark.parametrize("db", _PRODUCTION_NAMES)
def test_guard_refuses_production_shaped_names(db: str) -> None:
    with pytest.raises(RuntimeError) as excinfo:
        _guard_throwaway(_dsn(db))
    assert "REFUSING" in str(excinfo.value)
    assert db in str(excinfo.value)


def test_migration_live_uses_the_shared_guard() -> None:
    assert test_neo4j_to_age_migration_live._guard_throwaway is _guard_throwaway


def test_default_refusal_names_the_knowledge_test_var() -> None:
    with pytest.raises(RuntimeError) as excinfo:
        _guard_throwaway(_dsn("loreweave_knowledge"))
    assert "TEST_KNOWLEDGE_DB_URL" in str(excinfo.value)


def test_age_caller_refusal_names_its_own_var_and_action() -> None:
    """The AGE fixture's refusal must name TEST_AGE_DSN, not the default var."""
    with pytest.raises(RuntimeError) as excinfo:
        _guard_throwaway(
            _dsn("loreweave_knowledge"),
            var_name="TEST_AGE_DSN",
            destroys="This fixture DROPs every AGE graph in it — point it at a disposable DB, never a real knowledge store.",
        )
    message = str(excinfo.value)
    assert "TEST_AGE_DSN" in message
    assert "TEST_KNOWLEDGE_DB_URL" not in message
    assert "AGE graph" in message
