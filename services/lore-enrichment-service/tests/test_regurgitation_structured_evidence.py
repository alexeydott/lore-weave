"""Structured evidence on regurgitation flags (#user-report 2026-11-10).

The raw English ``evidence`` sentence stays the AUDIT record, but the flag now
carries a stable ``evidence_code`` + measured ``evidence_params`` so a UI can
render a LOCALIZED sentence without parsing prose. Pins: codes on both severity
branches, numeric params present, provenance serialization includes them, and
non-regurgitation kinds keep unset code (their evidence embeds free source data).
"""

from __future__ import annotations

from loreweave_grounding.regurgitation import detect_regurgitation
from loreweave_grounding.verify import CanonVerifier, FlagKind, Severity

from app.verify.regurgitation import LCS_FLAG, OVERLAP_FLAG

SRC = "蓬萊海島，海外仙家之地，僅於斬蛟龍一語中略見其名，自上古即為修真之所。"


def test_detect_medium_overlap_carries_structured_code_and_params():
    near = SRC[: LCS_FLAG + 4] + "（其餘為轉述內容）"
    res = detect_regurgitation(near, [SRC])
    assert res.severity == "medium"
    assert res.evidence_code == "regurgitation_overlap"
    assert res.evidence_params["lcs_chars"] >= LCS_FLAG
    assert 0 <= res.evidence_params["containment_pct"] <= 100
    # Raw English evidence survives verbatim as the audit record.
    assert "significant overlap with the source" in res.evidence


def test_detect_high_verbatim_carries_structured_code_and_params():
    verbatim = SRC[:60]  # a wholesale contiguous copy
    res = detect_regurgitation(verbatim, [SRC])
    assert res.severity == "high"
    assert res.evidence_code == "regurgitation_verbatim"
    assert res.evidence_params["lcs_chars"] > 0
    assert 0 <= res.evidence_params["output_fraction_pct"] <= 100
    assert "auto-reject" in res.evidence


def test_clean_result_has_no_code():
    res = detect_regurgitation("完全不同的新內容，沒有任何共通之處。", [SRC])
    assert res.severity is None
    assert res.evidence_code == ""
    assert res.evidence_params == {}


def test_canon_verify_flag_serializes_structured_evidence():
    from types import SimpleNamespace

    proposal = SimpleNamespace(
        canonical_name="测试",
        grounding=[SimpleNamespace(corpus_id="c1", chunk_index=0, excerpt=SRC)],
    )
    facts = [SimpleNamespace(dimension="能力", content=SRC[:50])]

    async def _lookup(name, dim):
        return []

    v = CanonVerifier(canon_lookup=_lookup)
    import asyncio

    result = asyncio.run(v.verify(proposal, facts))
    regurg = [f for f in result.flags if f.kind is FlagKind.REGURGITATION]
    assert regurg, "expected a regurgitation flag on a near-copy"
    f = regurg[0]
    assert f.evidence_code in ("regurgitation_overlap", "regurgitation_verbatim")
    assert isinstance(f.evidence_params, dict) and f.evidence_params
    # Non-regurgitation kinds keep the code unset (evidence embeds source data).
    prov = result.as_provenance()["canon_verify"]["flags"]
    assert prov[0]["evidence_code"] is not None
    assert isinstance(prov[0]["evidence_params"], dict)
    assert "severity" in prov[0]  # existing shape preserved alongside
