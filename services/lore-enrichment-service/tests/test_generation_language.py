"""Non-zh books generate in THEIR language (#user-report 2026-11-10).

A ru book used to get: zh-native dimension KEYS (label_for fell back to the
zh-native default for a language with no table), a Chinese-framed citation block
（来源…）, and a raw-ISO "Write in ru" directive — the model answered in Chinese.
Pins the fix: Russian labels, a human-readable language name, a language-neutral
citation frame, and NO CJK gate outside zh. The Fengshen zh golden shape is
asserted unchanged alongside.
"""

from __future__ import annotations

import pytest

from app.db.book_profile import BookProfile
from app.gaps.model import kind_label_for, label_for, language_name_for
from app.generation.generate import build_generation_prompt, parse_grounded_output
from app.generation.repair import RepairError, repair_generation
from app.retrieval.strategy import GroundedProposal

_RU_PROFILE = BookProfile(language="ru", worldview="Современное городское фэнтези")

# The built-in item table has exactly these ids; the ru labels come from
# label_for (the same resolver the prompt uses), so the test stays in sync.
_RU_ITEM_LABELS = {
    label_for(d, "ru", default="?")
    for d in ("origin", "powers", "appearance", "owner", "significance")
}


def _ru_proposal() -> GroundedProposal:
    return GroundedProposal(
        user_id="u1",
        project_id="p1",
        entity_kind="item",
        canonical_name="Телефон",
        target_ref="item:phone",
        dimensions={label: "" for label in _RU_ITEM_LABELS},
        grounding=[],
    )


def test_ru_prompt_uses_russian_labels_and_language_name():
    prompt = build_generation_prompt(_ru_proposal(), _RU_PROFILE)
    # Human-readable directive — never the raw ISO code.
    assert "Write EVERY dimension's content in Russian" in prompt
    assert "Write in ru" not in prompt
    # Dimension labels are the localized ru ones (they key the JSON skeleton).
    for label in _RU_ITEM_LABELS:
        assert label in prompt
    # No zh-native keys may leak into a ru prompt.
    for zh in ("来历", "能力", "持有", "意义"):
        assert zh not in prompt
    # Language-neutral citation frame (the zh-framed ［1］（来源…） is a zh-only signal).
    assert "（来源" not in prompt


def test_ru_labels_resolve_and_zh_demo_is_untouched():
    assert label_for("origin", "ru", default="来历") == "Происхождение"
    assert label_for("abilities", "ru", default="能力") == "Способности"
    assert kind_label_for("item", "ru") == "предмет"
    assert language_name_for("ru") == "Russian"
    assert language_name_for("pt-BR") == "Portuguese"
    assert language_name_for("auto") == ""
    assert language_name_for("zz") == "zz"  # unknown code passes through verbatim
    # Non-zh fallbacks must not leak zh-native keys into generated prompts.
    assert label_for("owner", "de", default="持有") == "Owner"
    assert label_for("custom_fact", "ru", default="自定义") == "custom_fact"
    assert kind_label_for("item", "de") == "item"
    # The Fengshen zh path is byte-identical to before (locked golden shape).
    assert label_for("origin", "zh", default="来历") == "来历"
    assert label_for("origin", "auto", default="来历") == "来历"
    assert kind_label_for("item", "zh") == "物品"


def test_ru_prompt_neutral_frame_and_zh_frame_unchanged():
    from app.retrieval.strategy import GroundingRef

    zh_prop = GroundedProposal(
        user_id="u1",
        project_id="p1",
        entity_kind="item",
        canonical_name="蓬萊鏡",
        target_ref="item:mirror",
        dimensions={"能力": ""},
        grounding=[GroundingRef(corpus_id="c1", chunk_id="k1", chunk_index=0,
                                excerpt="excerpt", score=0.9)],
    )
    zh_prompt = build_generation_prompt(zh_prop, BookProfile(language="zh"))
    assert "（来源" in zh_prompt  # the zh template keeps its citation frame
    assert "Write EVERY" not in zh_prompt
    ru_prop = _ru_proposal()
    ru_prop = ru_prop.model_copy(update={
        "grounding": [GroundingRef(corpus_id="c1", chunk_id="k1", chunk_index=0,
                                   excerpt="excerpt", score=0.9)],
    })
    ru_prompt = build_generation_prompt(ru_prop, _RU_PROFILE)
    assert "(source c1#0" in ru_prompt  # neutral frame for non-zh
    assert "（来源" not in ru_prompt


@pytest.mark.asyncio
async def test_ru_output_passes_parse_without_cjk_gate():
    """A ru book's faithful Russian content MUST survive parse_grounded_output —
    the CJK gate is a zh-only contract (the old gate would mark every ru dim
    ungrounded → zero proposals)."""
    raw = (
        '{"Происхождение": {"grounded": true, "content": "Телефон найден у Хэ '
        'Цзянькуя во время обыска в общежитии."}, "Силы": {"grounded": false, "content": ""}}'
    )
    grounded, ungrounded = parse_grounded_output(
        raw, ["Происхождение", "Силы"], require_cjk=False
    )
    assert "Происхождение" in grounded and "Телефон" in grounded["Происхождение"]
    assert ungrounded == ["Силы"]


def test_repair_cjk_gate_scoped_to_chinese_dimensions():
    """repair_generation's low-CJK reject is a Chinese-content contract: a zh book
    still rejects English leakage, a non-zh book (chinese_dimensions=set()) keeps
    its faithful Russian content."""
    out, _ = repair_generation(
        '{"Происхождение": "Телефон найден при обыске."}',
        expected_keys=["Происхождение"],
        chinese_dimensions=set(),
    )
    assert out["Происхождение"].startswith("Телефон")
    with pytest.raises(RepairError):
        repair_generation(
            '{"历史": "The Penglai island was home to immortals."}',
            expected_keys=["历史"],
        )
