"""
orchestrate/tests/test_lang_wrapper.py

Unit tests for the language-wrapper in size_flashsystem.
Verify that:
  - lang="en" → public fields contain no Hebrew letters
  - lang="he" → public fields contain Hebrew letters
  - parity tests are unaffected (size() still returns bilingual dicts)

Run from repo root:
    source venv/bin/activate
    PYTHONPATH=orchestrate python -m pytest orchestrate/tests/test_lang_wrapper.py -v
"""

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "orchestrate"))

from tools.sizer import size, size_flashsystem, _public_for_lang  # noqa: E402

HEBREW_RE = re.compile(r"[\u05d0-\u05ea]")

SPEC = {
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


def _collect_strings(obj) -> list[str]:
    """Recursively collect all string values from a dict/list."""
    strings = []
    if isinstance(obj, str):
        strings.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            strings.extend(_collect_strings(v))
    elif isinstance(obj, list):
        for item in obj:
            strings.extend(_collect_strings(item))
    return strings


# ── _public_for_lang unit tests ───────────────────────────────────────────────

def test_public_for_lang_en_no_hebrew():
    """lang='en': public block must contain no Hebrew letters."""
    raw = size(SPEC, CTX)
    public_en = _public_for_lang(raw["public"], "en")
    strings = _collect_strings(public_en)
    assert strings, "public block should not be empty"
    for s in strings:
        assert not HEBREW_RE.search(s), (
            f"Found Hebrew in lang='en' public output: {s!r}"
        )


def test_public_for_lang_he_has_hebrew():
    """lang='he': at least one public field must contain Hebrew letters."""
    raw = size(SPEC, CTX)
    public_he = _public_for_lang(raw["public"], "he")
    strings = _collect_strings(public_he)
    assert any(HEBREW_RE.search(s) for s in strings), (
        "Expected Hebrew letters in lang='he' public output, found none"
    )


# ── size_flashsystem wrapper tests ────────────────────────────────────────────

def _unwrap(tool_result) -> dict:
    """Extract the underlying dict from a ToolResponse (or plain dict)."""
    if isinstance(tool_result, dict):
        return tool_result
    # ibm_watsonx_orchestrate wraps return values in ToolResponse; payload is in .content
    return tool_result.content


def test_size_flashsystem_en_no_hebrew():
    """size_flashsystem(lang='en'): public must contain no Hebrew letters."""
    result = _unwrap(size_flashsystem(SPEC, CTX, lang="en"))
    public = result.get("public", {})
    strings = _collect_strings(public)
    assert strings, "public block should not be empty"
    for s in strings:
        assert not HEBREW_RE.search(s), (
            f"Found Hebrew in size_flashsystem(lang='en') public: {s!r}"
        )


def test_size_flashsystem_he_has_hebrew():
    """size_flashsystem(lang='he'): public must contain Hebrew letters."""
    result = _unwrap(size_flashsystem(SPEC, CTX, lang="he"))
    public = result.get("public", {})
    strings = _collect_strings(public)
    assert any(HEBREW_RE.search(s) for s in strings), (
        "Expected Hebrew letters in size_flashsystem(lang='he') public, found none"
    )


def test_size_flashsystem_default_lang_is_en():
    """size_flashsystem without lang= defaults to English (no Hebrew in public)."""
    result = _unwrap(size_flashsystem(SPEC, CTX))
    public = result.get("public", {})
    strings = _collect_strings(public)
    for s in strings:
        assert not HEBREW_RE.search(s), (
            f"Default lang should be 'en' but found Hebrew: {s!r}"
        )


def test_size_engine_still_bilingual():
    """The underlying size() function still returns bilingual dicts (parity unaffected)."""
    raw = size(SPEC, CTX)
    headline = raw.get("public", {}).get("headline")
    assert isinstance(headline, dict), "size() headline should still be a dict"
    assert "he" in headline and "en" in headline, (
        "size() headline should have both 'he' and 'en' keys"
    )
