"""D-A-RECOGNISABLE-PLACEHOLDER-UUID-PASSES-THE-FABRICATION-GUARD
   + D-FABRICATION-GUARD-IS-BLIND-TO-A-VALID-LOOKING-UUID.

    THE INVARIANT. A syntactically valid UUID that is RECOGNISABLE as a placeholder without
    knowing any real id is knowably invented, not merely possibly-wrong.

`_invented_supplier_ids` tests SYNTAX, so a model that invents a well-formed UUID walks through
it, `_missing_required_names` sees the argument as PRESENT, and the call is dispatched to a
Tier-A write tool. Measured live on two tools and two arguments:

    plan_bootstrap_apply  proposal_id=77777777-7777-7777-7777-777777777777   (2 of 5 runs)
    plan_bootstrap_apply  proposal_id=78965432-1234-5678-90ab-cdef12345678   (1 of 5)
    (and 66966666-6666-6666-6666-666666666666 on a different tool entirely)

Both rows said the same thing: a shape test is plausible, its PRECISION is unknown, and "that
measurement is the next step, not the fix". This is that measurement, and then the fix.

🔴 THE MEASUREMENT, 2026-08-27, over TWO populations — the second because it is the one this
function actually sees:

                          38,314 real ids       390 GENUINE ids the model passed
    all-digits-identical         2                      0
    sequential run >= 8          0                      0
    --- measured and REJECTED ---
    distinct hex <= 2           20                      0
    UUID version != 7       11,618                      -

`version != 7` is refuted outright by 11,618 genuine v4 ids — exactly as
D-FABRICATION-GUARD-IS-BLIND-TO-A-VALID-LOOKING-UUID warned it would be. Re-derived later over
every uuid column in five databases, it is 1,073,328 of 1,296,259 distinct ids: five sixths of
every identifier the platform holds. That rule is dead.

🔴 `distinct <= 2` SHIPPED 2026-09-02 ON THE OWNER'S RULING (DQ-T92), SIX WEEKS AFTER THIS FILE
SAID IT WOULD NOT. What changed is the DENOMINATOR, not the rule. Every rejection of it —
including the paragraph this replaces — measured it against the STORES, where it fires on 21
hand-authored sentinels that DO resolve. The guard never inspects a stored id. It inspects a tool
ARGUMENT, and on 14,037 UUID-shaped `*_id` arguments it has ZERO false positives; the sentinel
appears zero times as an argument, and so does this row's own quoted instance.

AND THE SENTINELS ARE STILL SAFE — BY PROVENANCE, NOT BY SHAPE. `_invented_supplier_ids` now
takes the turn's `IdLedger`, and a value the PLATFORM published to the model is never refused as
invented, whatever its digits look like. That is the property a literal exemption would only
approximate, and the row's caution names why the approximation is not good enough: "this loop has
already paid once for a blacklist that the very next run walked around."

THE EXEMPTION COSTS NOTHING AND, TODAY, FIRES NOTHING: of 58 degenerate arguments in the whole
recorded corpus, 58 were never published in-session and 0 were published. It is a safety valve
against the failure that killed the UUID-version rule, not a filter carrying present load.

RECALL IS STILL PARTIAL. Three distinct hex digits is outside the rule and stays outside it;
widening again needs its own measurement on the ARGUMENT population.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
from uuid import UUID, uuid5, NAMESPACE_URL

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.services.stream_service import (  # noqa: E402
    _DEGENERATE_SEQ_RUN,
    _invented_supplier_ids,
    _is_degenerate_uuid,
    _is_nil_uuid,
)

REPDIGIT = "77777777-7777-7777-7777-777777777777"
SEQUENTIAL = "78965432-1234-5678-90ab-cdef12345678"
REAL = "01a04107-5b4a-789c-8b22-30f17c8abb00"
SENTINEL = "00000000-0000-0000-0000-00000000000a"
TWO_DIGIT = "66966666-6666-6666-6666-666666666666"


def test_the_measured_call_is_caught():
    """THE FALSIFIER, on the ORIGINAL instance: the exact argument from the live run."""
    assert _invented_supplier_ids({"proposal_id": REPDIGIT}, contract=None) == ["proposal_id"]
    assert _invented_supplier_ids({"proposal_id": SEQUENTIAL}, contract=None) == ["proposal_id"]


def test_it_fires_without_a_contract():
    """The value is wrong for EVERY supplier, so it cannot be conditioned on one — the same
    reasoning the nil-UUID arm beside it already carries."""
    for c in (None, {}, {"proposal_id": {"supplier": "plan"}}):
        assert _invented_supplier_ids({"proposal_id": REPDIGIT}, contract=c) == ["proposal_id"]


def test_a_real_id_is_untouched():
    """The existing rule stands: a valid UUID is accepted even if it is WRONG, because whether
    it is the right row is the tool's question."""
    assert not _is_degenerate_uuid(REAL)
    assert _invented_supplier_ids({"proposal_id": REAL}, contract=None) == []


class _Ledger:
    """The provenance oracle, with `IdLedger`'s one relevant method.

    Not a stand-in for `IdLedger` — `test_the_real_IdLedger_satisfies_this_protocol` below
    pins the production class to the same shape, so this stub cannot drift away from it.
    """

    def __init__(self, **published):
        self._by_value = {v: k for k, v in published.items()}

    def type_of(self, value):
        return self._by_value.get(value)


def test_a_RESOLVING_sentinel_is_left_alone():
    """🔴 RE-AIMED 2026-09-02 ON THE OWNER'S RULING (DQ-T92): the sentinel is spared by
    PROVENANCE, not by shape.

    THIS TEST USED TO ASSERT `not _is_degenerate_uuid(SENTINEL)` — that the SHAPE test does not
    reach it. That is no longer true and is no longer the guarantee worth holding. `distinct <= 2`
    now ships, because on the population this guard actually inspects — 14,037 UUID-shaped `*_id`
    ARGUMENTS — it has ZERO false positives and the sentinel occurs zero times there. The 20-ids
    figure that blocked it for six weeks was measured against the STORES, which this function
    never sees.

    WHAT MUST STILL HOLD, AND IT IS THE STRONGER PROPERTY: a value the PLATFORM published to the
    model is never refused as invented, whatever its digits look like. That is a statement about
    the guard end to end, so it is asserted through `_invented_supplier_ids` and not through the
    shape helper.
    """
    # The shape arm DOES fire now — stated outright so this test cannot be read as still
    # claiming the old guarantee.
    assert _is_degenerate_uuid(SENTINEL)
    assert _is_degenerate_uuid(TWO_DIGIT)

    # 🔴 THE GUARANTEE. The platform handed this value over under `entity_id`; the model
    # did not invent it; the guard must not delete it.
    assert _invented_supplier_ids(
        {"proposal_id": SENTINEL}, contract=None,
        published_ids=_Ledger(entity_id=SENTINEL)) == []


def test_the_exemption_is_PROVENANCE_and_not_a_LIST_OF_SHAPES():
    """🔴 THE TEETH, and the reason the ruling chose provenance over a literal exemption.

    A sentinel-SHAPED value the platform never published is still refused, and a value that
    looks nothing like a sentinel is spared the moment the platform vouches for it. Neither
    half is derivable from the value's digits, which is exactly the point: a shape exemption
    is a blacklist, and this row's own caution is that "this loop has already paid once for a
    blacklist that the very next run walked around".
    """
    # Same shape, no provenance -> refused.
    assert _invented_supplier_ids({"proposal_id": SENTINEL}, contract=None) == ["proposal_id"]
    # A ledger that saw a DIFFERENT value does not vouch for this one.
    assert _invented_supplier_ids(
        {"proposal_id": SENTINEL}, contract=None,
        published_ids=_Ledger(entity_id="01a04107-5b4a-789c-8b22-30f17c8abb01")
    ) == ["proposal_id"]
    # A NINETEENTH sentinel, one nobody added to any list, is spared for the same reason as the
    # eighteen that exist — the property is not fitted to today's values.
    ninth = "00000000-0000-0000-0000-0000000000ff"
    assert _is_degenerate_uuid(ninth)
    assert _invented_supplier_ids(
        {"proposal_id": ninth}, contract=None, published_ids=_Ledger(node_id=ninth)) == []


def test_the_exemption_FAILS_SAFE_when_no_ledger_is_threaded():
    """A caller that forgets `published_ids` must lose the EXEMPTION, never the GUARD.

    The opposite default would turn every un-threaded call site into a silently disabled
    fabrication guard, which is the failure mode this file exists to prevent.
    """
    for ledger in (None, _Ledger()):
        assert _invented_supplier_ids(
            {"proposal_id": REPDIGIT}, contract=None, published_ids=ledger) == ["proposal_id"]


def test_a_BROKEN_ledger_does_not_take_the_dispatch_down_with_it():
    """The oracle is advisory. If it raises, the guard still answers — by refusing, which is
    the safe direction."""

    class _Broken:
        def type_of(self, value):
            raise RuntimeError("ledger unavailable")

    assert _invented_supplier_ids(
        {"proposal_id": REPDIGIT}, contract=None, published_ids=_Broken()) == ["proposal_id"]


def test_the_real_IdLedger_satisfies_this_protocol():
    """🔴 THE STUB ABOVE IS NOT THE THING THAT SHIPS. This asserts the production
    `IdLedger` answers the same question the same way — otherwise every test above could pass
    against a stub while the wired call site spares nothing."""
    from app.services.id_ledger import IdLedger

    led = IdLedger()
    led.record({"result": {"entities": [{"entity_id": SENTINEL}]}})
    assert led.type_of(SENTINEL) == "entity_id"
    assert led.type_of(REPDIGIT) is None
    assert _invented_supplier_ids({"proposal_id": SENTINEL}, contract=None,
                                  published_ids=led) == []
    assert _invented_supplier_ids({"proposal_id": REPDIGIT}, contract=None,
                                  published_ids=led) == ["proposal_id"]


def test_the_threshold_has_a_measured_margin():
    """Eight is not a taste. The longest sequential run across 38,314 real ids is SIX, so the
    threshold carries a two-nibble margin — and a run of exactly 6 or 7 must NOT fire."""
    assert _DEGENERATE_SEQ_RUN == 8
    assert not _is_degenerate_uuid("019f01e0-f456-789b-8840-8446f03f7b53")  # a real id, run 6
    assert _is_degenerate_uuid("789e4567-89ab-cdef-0123-456789abcdef")


def test_non_uuids_and_junk_are_not_this_functions_business():
    for v in ("", "not-a-uuid", "run_12345_placeholder", None, 7, []):
        assert not _is_degenerate_uuid(v)


def test_the_nil_arm_is_unchanged():
    """It was there first and is still the one that catches the all-zero value."""
    assert _is_nil_uuid("00000000-0000-0000-0000-000000000000")
    assert _invented_supplier_ids(
        {"map_id": "00000000-0000-0000-0000-000000000000"}, contract=None) == ["map_id"]


def test_only_identifier_shaped_names_are_touched():
    """PRECISION on the other axis: the guard reads `*_id` / `*_ref`, and a placeholder-looking
    value in some other field is not its business."""
    assert _invented_supplier_ids({"title": REPDIGIT}, contract=None) == []
    assert _invented_supplier_ids({"proposal_ref": REPDIGIT}, contract=None) == ["proposal_ref"]


_LIVE_DATABASES = (
    "loreweave_book", "loreweave_composition", "loreweave_knowledge", "loreweave_glossary",
    "loreweave_translation", "loreweave_jobs", "loreweave_chat",
)
_LIVE_MIN_IDS = 5000


def _live_query(db, sql):
    """Read-only census. Missing sources are NOT an empty successful population."""
    try:
        result = subprocess.run(
            ["docker", "exec", "-i", "infra-postgres-1", "psql", "-U", "loreweave",
             "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
            capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        pytest.skip(f"live UUID census NOT RUN: {db} unavailable ({type(exc).__name__})")
    if result.returncode != 0:
        pytest.skip(f"live UUID census NOT RUN: {db} query failed (exit {result.returncode})")
    return result.stdout.strip().splitlines()


def _collect_live_ids(query):
    ids = set()
    for db in _LIVE_DATABASES:
        columns = query(db, "SELECT table_name||'.'||column_name FROM information_schema.columns "
                        "WHERE table_schema='public' AND data_type='uuid' LIMIT 400;")
        if not columns:
            pytest.skip(f"live UUID census NOT RUN: {db} has no readable UUID columns")
        for column in columns:
            table, _, field = column.partition(".")
            ids.update(value for value in query(
                db, f'SELECT DISTINCT "{field}"::text FROM public."{table}" '
                    f'WHERE "{field}" IS NOT NULL LIMIT 200;') if value)
    if len(ids) < _LIVE_MIN_IDS:
        pytest.skip(f"live UUID census NOT RUN: only {len(ids)} distinct IDs; need {_LIVE_MIN_IDS}")
    return ids


def _assert_live_ids_are_not_refused(ids):
    """Every observed UUID exercises the real guard; no sentinel needs to preexist."""
    from app.services.id_ledger import IdLedger

    for value in ids:
        UUID(value)  # census values must really be UUIDs, not malformed query output
        ledger = IdLedger()
        ledger.record({"entity_id": value})
        # Ordinary genuine UUIDs also exercise the guard WITHOUT an exemption.
        # Stored sentinel-shaped UUIDs require the separately tested provenance arm.
        if not _is_degenerate_uuid(value):
            assert _invented_supplier_ids({"entity_id": value}, contract=None) == []
        assert _invented_supplier_ids(
            {"entity_id": value}, contract=None, published_ids=ledger,
        ) == [], f"the guard refused the platform-published stored UUID {value}"


def test_the_precision_holds_against_the_LIVE_stores(record_property):
    """Measure false refusals over >=5000 actual IDs from all required stores.

    Recall belongs to synthetic positives, not to the accidental presence of nil/repdigit
    rows in somebody's database. An entirely ordinary live population is valid coverage.
    """
    ids = _collect_live_ids(_live_query)
    record_property("live_uuid_count", len(ids))
    record_property("required_database_count", len(_LIVE_DATABASES))
    _assert_live_ids_are_not_refused(ids)


@pytest.mark.parametrize("value", [
    "00000000-0000-0000-0000-000000000000",
    "11111111-1111-1111-1111-111111111111",
    REPDIGIT, SEQUENTIAL, TWO_DIGIT,
])
def test_synthetic_placeholder_positives_are_rejected_without_live_seed_rows(value):
    assert _is_degenerate_uuid(value)
    assert _invented_supplier_ids({"proposal_id": value}, contract=None) == ["proposal_id"]
    _assert_live_ids_are_not_refused({value})  # publishing even this shape must spare it


def test_a_live_census_with_no_placeholder_rows_still_exercises_every_genuine_id():
    values = {str(uuid5(NAMESPACE_URL, f"https://fixture.test/entity/{n}")) for n in range(5000)}
    assert len(values) == _LIVE_MIN_IDS
    assert not any(_is_degenerate_uuid(value) for value in values)
    assert _collect_live_ids(lambda db, sql: ["entities.id"] if "information_schema" in sql
                             else list(values)) == values
    _assert_live_ids_are_not_refused(values)


def test_the_live_precision_check_fails_on_a_false_refusal(monkeypatch):
    monkeypatch.setitem(globals(), "_invented_supplier_ids", lambda *a, **k: ["entity_id"])
    with pytest.raises(AssertionError):
        _assert_live_ids_are_not_refused({REAL})


def test_an_incomplete_live_population_is_not_reported_as_a_precision_measurement():
    with pytest.raises(pytest.skip.Exception, match="only 1 distinct IDs"):
        _collect_live_ids(lambda db, sql: ["entities.id"] if "information_schema" in sql else [REAL])


def test_a_missing_live_database_population_is_not_silently_ignored():
    def query(db, sql):
        if db == "loreweave_chat":
            return []
        return ["entities.id"] if "information_schema" in sql else [REAL]

    with pytest.raises(pytest.skip.Exception, match="loreweave_chat has no readable UUID columns"):
        _collect_live_ids(query)


def test_a_failed_live_query_is_not_counted_as_an_empty_success(monkeypatch):
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: subprocess.CompletedProcess([], 1, "", "missing database"))
    with pytest.raises(pytest.skip.Exception, match="query failed"):
        _live_query("loreweave_chat", "SELECT 1")



def test_the_two_digit_fabrications_are_NOW_caught():
    """🔴 THIS TEST INVERTED 2026-09-02, AND ITS OLD FORM IS WHY.

    It used to assert these are NOT caught, with the message "this now fires — the
    recall/precision trade recorded on the row has changed and must be re-measured rather than
    quietly widened". That tripwire did its job: the trade WAS re-measured (14,037 arguments,
    zero false positives, DQ-T92) and the owner ruled on the result, so the widening is neither
    quiet nor unmeasured. `66966666-…` is the instance
    D-FABRICATION-GUARD-IS-BLIND-TO-A-VALID-LOOKING-UUID was opened on, and
    `76666666-…` is the one seen 22 times in the recorded corpus.
    """
    for now_caught in (TWO_DIGIT, "76767676-7676-7676-7676-767676767676",
                       "76666666-7666-7666-7666-766666666666"):
        assert _is_degenerate_uuid(now_caught), now_caught
        assert _invented_supplier_ids({"proposal_id": now_caught},
                                      contract=None) == ["proposal_id"]


def test_the_recall_this_still_does_NOT_reach_is_recorded():
    """Every fix states what it does not cover. THREE distinct digits is outside the rule, and
    that boundary is deliberate rather than an oversight — widening it again needs its own
    measurement on the ARGUMENT population, not this file's permission."""
    three_digits = "12121212-2121-1212-2121-121212121233"
    assert len(set(three_digits.replace("-", ""))) == 3
    assert not _is_degenerate_uuid(three_digits)
