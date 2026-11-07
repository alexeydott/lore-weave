"""#user-report 2026-11-07 — LLM answers and session titles follow the UI
localization language. Covers the two stream_service helpers: the system
directive and the autotitle language name."""
from app.services.stream_service import (
    _ui_language_directive,
    _ui_language_name,
)


def test_ru_ui_yields_russian_directive():
    d = _ui_language_directive("ru")
    assert "Russian" in d
    assert "ru" in d
    assert "Always respond in Russian" in d


def test_base_code_tolerance():
    assert _ui_language_name("ru-RU") == "Russian"
    assert "Russian" in _ui_language_directive("ru-RU")


def test_unknown_locale_yields_no_directive():
    assert _ui_language_name("xx") == ""
    assert _ui_language_directive("xx") == ""
    assert _ui_language_directive(None) == ""
    assert _ui_language_directive("") == ""


def test_regional_variants_map():
    assert _ui_language_name("pt-BR") == "Brazilian Portuguese"
    assert _ui_language_name("zh-CN") == "Simplified Chinese"
    assert _ui_language_name("zh-TW") == "Traditional Chinese"


def test_every_frontend_ui_locale_is_covered():
    # The locale tree (frontend/src/i18n/locales) — these must all resolve.
    for code in ["ar", "bn", "de", "en", "es", "fr", "hi", "id", "ja", "ko",
                 "ms", "pt-BR", "ru", "th", "tr", "vi", "zh-CN", "zh-TW"]:
        assert _ui_language_name(code), code
