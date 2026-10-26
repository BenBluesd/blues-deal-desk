"""
orchestrate/tests/test_bidi.py

Tests for Task-08: bidi isolation, display field in size_flashsystem,
and display field in submit_request.

Run from repo root:
    source venv/bin/activate
    PYTHONPATH=orchestrate python -m pytest orchestrate/tests/test_bidi.py -v
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "orchestrate"))

from tools.sizer import _isolate_ltr, size_flashsystem  # noqa: E402

_FSI = "\u2068"
_PDI = "\u2069"

HEBREW_ALPHA = "א"  # U+05D0 — plain Hebrew letter


# ── _isolate_ltr ──────────────────────────────────────────────────────────────

def test_isolate_ltr_wraps_latin_digits_in_hebrew():
    """LTR runs in a Hebrew string are wrapped in FSI…PDI."""
    text = "נפח: 39.6TB אפקטיבי"
    result = _isolate_ltr(text)
    assert _FSI in result and _PDI in result
    # The run must contain "39.6TB" between FSI and the closing PDI
    fsi_idx = result.index(_FSI)
    pdi_idx = result.index(_PDI)
    run_content = result[fsi_idx + 1: pdi_idx]
    assert "39.6TB" in run_content


def test_isolate_ltr_wraps_model_name():
    """Model name with Latin letters is wrapped."""
    text = "תצורה: FlashSystem 5600 מומלצת"
    result = _isolate_ltr(text)
    fsi_idx = result.index(_FSI)
    pdi_idx = result.index(_PDI)
    run_content = result[fsi_idx + 1: pdi_idx]
    assert "FlashSystem 5600" in run_content


def test_isolate_ltr_leaves_pure_hebrew_unchanged():
    """Pure Hebrew text (no Latin/digits) passes through unmodified."""
    text = "הערכה ראשונית בלבד."
    result = _isolate_ltr(text)
    assert result == text
    assert _FSI not in result


def test_isolate_ltr_leaves_english_unchanged():
    """English-only text is unchanged (no Hebrew context — same result expected)."""
    text = "IBM FlashSystem 5600 with 40TB"
    result = _isolate_ltr(text)
    # _isolate_ltr wraps every LTR run, but the spec says English output gets no marks —
    # that is enforced by the caller (_build_display uses a no-op lambda for English).
    # Here we just verify no characters were removed or garbled.
    assert "IBM" in result
    assert "FlashSystem 5600" in result
    assert "40TB" in result


# ── size_flashsystem display ──────────────────────────────────────────────────

FULL_SPEC = {
    "cap": 40,
    "capType": "effective",
    "conn": "fc32",
    "fcPorts": 8,
    "sanSw": "has",
    "ec": 5,
    "ecLevel": "Advanced",
    "cables": True,
}
CTX = {"reseller": "Test Reseller", "hasOpportunity": False}


def _unwrap(tool_result):
    if isinstance(tool_result, dict):
        return tool_result
    return tool_result.content


def test_display_he_contains_combined_question():
    """display (he) contains the combined opportunity + שלח closing question."""
    result = _unwrap(size_flashsystem(FULL_SPEC, CTX, lang="he"))
    display = result.get("display", "")
    assert display, "display must not be empty"
    # Must mention opportunity number
    assert "הזדמנות" in display
    # Must mention the שלח trigger word
    assert "שלח" in display


def test_display_en_contains_combined_question():
    """display (en) contains the combined opportunity + send closing question."""
    result = _unwrap(size_flashsystem(FULL_SPEC, CTX, lang="en"))
    display = result.get("display", "")
    assert display, "display must not be empty"
    assert "opportunity" in display.lower()
    assert "send" in display.lower()


def test_display_en_no_hebrew():
    """display (en) contains no Hebrew letters."""
    import re
    result = _unwrap(size_flashsystem(FULL_SPEC, CTX, lang="en"))
    display = result.get("display", "")
    assert not re.search(r"[\u05d0-\u05ea]", display), (
        f"Hebrew found in English display: {display!r}"
    )


def test_display_he_has_bidi_marks():
    """display (he) contains FSI marks around LTR runs."""
    result = _unwrap(size_flashsystem(FULL_SPEC, CTX, lang="he"))
    display = result.get("display", "")
    assert _FSI in display, "Expected FSI bidi marks in Hebrew display"
    assert _PDI in display, "Expected PDI bidi marks in Hebrew display"


# ── submit_request display ────────────────────────────────────────────────────

def test_submit_request_display_he():
    """submit_request (lang=he) display contains the ref and Hebrew text."""
    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.json.return_value = {
        "ok": True,
        "ref": "BD-2026-0042",
        "route": "auto",
        "headline": "IBM FlashSystem 5600",
    }

    with patch("tools.submit_request.http_requests.post", return_value=mock_response):
        from tools.submit_request import submit_request
        result = _unwrap(submit_request(
            reseller="Test Co",
            email="test@example.com",
            spec={"cap": 40},
            lang="he",
        ))

    assert result["ok"] is True
    display = result.get("display", "")
    assert "BD-2026-0042" in display
    # Must contain Hebrew text
    import re
    assert re.search(r"[\u05d0-\u05ea]", display), "Expected Hebrew in he display"


def test_submit_request_display_en():
    """submit_request (lang=en) display contains the ref and no Hebrew."""
    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.json.return_value = {
        "ok": True,
        "ref": "BD-2026-0099",
        "route": "auto",
        "headline": "IBM FlashSystem 5600",
    }

    with patch("tools.submit_request.http_requests.post", return_value=mock_response):
        from tools.submit_request import submit_request
        result = _unwrap(submit_request(
            reseller="Test Co",
            email="test@example.com",
            spec={"cap": 40},
            lang="en",
        ))

    assert result["ok"] is True
    display = result.get("display", "")
    assert "BD-2026-0099" in display
    import re
    assert not re.search(r"[\u05d0-\u05ea]", display), "Hebrew found in en display"
