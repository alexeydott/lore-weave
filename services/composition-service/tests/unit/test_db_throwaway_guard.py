"""P0-2 (round 8) — the throwaway-DB guard lives in exactly one place.

`test_arc_lift` and `test_package_rekey` used to define their own local
`_guard_throwaway` that only accepted a database name containing "test".
That diverged from the shared helper in this directory's conftest in two
ways: it REFUSED legitimate throwaway databases named with any other
marker (`..._smoke`, `..._audit`, `..._tmp`, …), and it duplicated the
marker set, so a future marker added to the shared helper would silently
not reach these two suites. Both modules now import the shared helper;
these tests pin that: the modules' `_guard_throwaway` IS the conftest's,
and the shared predicate accepts every throwaway marker while refusing
production-shaped names.

NOTE on substring matching: the shared predicate matches markers as
substrings, so a name such as "latest" (which contains "test") is accepted
— by the shared helper AND by the old local checks alike. That is a
property of the shared predicate, not of this dedup; closing it would
need a repo-wide predicate change (the db-safety gate uses the same
substring set) and is out of this round's scope.
"""

from __future__ import annotations

import pytest

from tests.integration.db import test_arc_lift, test_package_rekey
from tests.integration.db.conftest import _guard_throwaway

_MARKERS = ("test", "smoke", "audit", "scratch", "throwaway", "tmp", "sandbox", "ephemeral")
_PRODUCTION_NAMES = (
    "loreweave_composition",
    "loreweave_book",
    "loreweave_knowledge",
    "production",
    "maindb",
)


def _dsn(db: str) -> str:
    return f"postgresql://u:p@h:5432/{db}"


@pytest.mark.parametrize("marker", _MARKERS)
def test_guard_accepts_every_throwaway_marker(marker: str) -> None:
    _guard_throwaway(_dsn(f"loreweave_composition_{marker}"))


@pytest.mark.parametrize("db", _PRODUCTION_NAMES)
def test_guard_refuses_production_shaped_names(db: str) -> None:
    with pytest.raises(RuntimeError) as excinfo:
        _guard_throwaway(_dsn(db))
    assert "REFUSING" in str(excinfo.value)
    assert db in str(excinfo.value)


def test_guard_ignores_query_string_when_parsing_db_name() -> None:
    _guard_throwaway(_dsn("loreweave_composition_test") + "?sslmode=require")


def test_guard_accepts_uppercase_marker() -> None:
    _guard_throwaway(_dsn("LOREWEAVE_COMPOSITION_TEST"))


def test_arc_lift_uses_the_shared_guard() -> None:
    assert test_arc_lift._guard_throwaway is _guard_throwaway


def test_package_rekey_uses_the_shared_guard() -> None:
    assert test_package_rekey._guard_throwaway is _guard_throwaway


def test_fixture_path_accepts_smoke_named_db_the_old_local_check_refused() -> None:
    """Regression: the old per-file check refused `..._smoke` (no "test" in it).

    A smoke-named database is a legitimate throwaway per the shared helper;
    the fixture path in both suites must accept it now that they import it.
    """
    dsn = _dsn("loreweave_composition_smoke")
    test_arc_lift._guard_throwaway(dsn)
    test_package_rekey._guard_throwaway(dsn)
