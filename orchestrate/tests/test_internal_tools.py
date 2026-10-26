"""
orchestrate/tests/test_internal_tools.py

Tests for orchestrate/tools/internal_tools.py.
No network calls — HTTP is mocked where needed via monkeypatching.

Run from repo root:
    source venv/bin/activate
    PYTHONPATH=orchestrate python -m pytest orchestrate/tests/test_internal_tools.py -v
"""

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent  # blues-deal-desk/
sys.path.insert(0, str(REPO_ROOT / "orchestrate"))

from tools.internal_tools import analyze_request, price_quote  # noqa: E402


def _unwrap(tool_result) -> dict:
    """Extract the underlying dict from a ToolResponse (or plain dict)."""
    if isinstance(tool_result, dict):
        return tool_result
    return tool_result.content


# ─────────────────────────── analyze_request ──────────────────────────────────

FULL_SPEC = {
    "cap": 80,
    "capType": "effective",
    "conn": "fc32",
    "fcPorts": 8,
    "sanSw": "has",
    "ec": 5,
    "ecLevel": "Advanced",
}


def test_analyze_full_spec_returns_main_and_alternative():
    """Full spec: main and alternative differ (model or drive size), missing is empty."""
    result = _unwrap(analyze_request(
        spec=FULL_SPEC,
        reseller="אלפא מחשוב",
        end_customer="מגדל ביטוח",
        quotes=["הלקוח צריך 80TB אפקטיבי", "FC 32Gb, 8 פורטים"],
        lang="he",
    ))
    assert result["ok"] is True
    assert result["missing"] == []
    assert result["draft_email"] == ""

    main = result["main"]
    alt = result["alternative"]

    # Must have actual model names
    assert main["model"]
    assert alt["model"]

    # main and alternative must differ — either different models or different drive size in summary
    different = (main["model"] != alt["model"]) or (main["summary_line"] != alt["summary_line"])
    assert different, f"main and alternative are identical:\n{main}\n{alt}"

    # items non-empty
    assert len(main["items"]) > 0
    assert len(alt["items"]) > 0


def test_analyze_missing_connectivity():
    """Without connectivity, missing uses fixed Hebrew label and draft starts with היי."""
    spec_no_conn = {
        "cap": 80,
        "capType": "effective",
        "ec": 5,
        "ecLevel": "Advanced",
    }
    result = _unwrap(analyze_request(
        spec=spec_no_conn,
        reseller="טכנו-נט",
        lang="he",
    ))
    assert result["ok"] is True

    missing_labels = result["missing"]
    assert any("סוג חיבור" in m for m in missing_labels), f"missing={missing_labels}"
    # Must not show raw codes
    for m in missing_labels:
        assert "iscsi25" not in m and "fc32" not in m and "fc64" not in m, \
            f"Raw code in missing label: {m}"

    draft = result["draft_email"]
    assert draft.startswith("היי"), f"draft_email does not start with 'היי': {draft[:50]}"


def test_analyze_missing_labels_no_raw_codes():
    """_MISSING_LABELS must not contain raw API codes like iscsi25, fc32, fc64."""
    from tools.internal_tools import _MISSING_LABELS
    for key, label in _MISSING_LABELS.items():
        for code in ("iscsi25", "fc32", "fc64", "iscsi10", "iscsi100"):
            assert code not in label, f"Raw code '{code}' found in label for '{key}': {label}"


def test_analyze_summary_labels_usable_and_effective():
    """Summary line must use 'שמיש לפני דחיסה' and 'אפקטיבי אחרי דחיסה' — not 'לפני דחיסה' alone."""
    result = _unwrap(analyze_request(
        spec=FULL_SPEC,
        reseller="אלפא מחשוב",
        end_customer="מגדל ביטוח",
        lang="he",
    ))
    assert result["ok"] is True
    summary = result["main"]["summary_line"]
    assert "שמיש לפני דחיסה" in summary, f"summary_line missing 'שמיש לפני דחיסה': {summary}"
    assert "אפקטיבי אחרי דחיסה" in summary, f"summary_line missing 'אפקטיבי אחרי דחיסה': {summary}"


def test_analyze_items_desc_no_leading_number():
    """Item desc must not start with a digit (qty is already in the qty column)."""
    result = _unwrap(analyze_request(
        spec=FULL_SPEC,
        reseller="אלפא מחשוב",
        lang="he",
    ))
    assert result["ok"] is True
    import re as _re
    for item in result["main"]["items"]:
        desc = item["desc"]
        assert not _re.match(r"^\d+\s", desc), f"desc starts with number: {desc!r}"


def test_analyze_missing_conn_adds_assumption():
    """When connectivity is missing, assumptions must contain the FC default note."""
    spec_no_conn = {"cap": 80, "capType": "effective", "ec": 5, "ecLevel": "Advanced"}
    result = _unwrap(analyze_request(spec=spec_no_conn, reseller="גליל IT", lang="he"))
    assert result["ok"] is True
    assumptions = result["assumptions"]
    assert any("לא צוין חיבור" in a for a in assumptions), \
        f"connectivity assumption missing from: {assumptions}"


def test_analyze_display_last_line():
    """The last non-empty line of display must be exactly 'לשלוח לתמחור? (כן / לא)'."""
    result = _unwrap(analyze_request(spec=FULL_SPEC, reseller="אלפא מחשוב", lang="he"))
    assert result["ok"] is True
    lines = [l for l in result["display"].splitlines() if l.strip()]
    assert lines[-1] == "לשלוח לתמחור? (כן / לא)", \
        f"Last line is: {lines[-1]!r}"


def test_analyze_assumptions_no_epricer():
    """assumptions must never contain 'ePricer'."""
    result = _unwrap(analyze_request(spec=FULL_SPEC, reseller="גליל IT", lang="he"))
    for assumption in result["assumptions"]:
        assert "ePricer" not in assumption, f"assumption contains ePricer: {assumption}"


def test_analyze_empty_reseller_returns_error():
    result = _unwrap(analyze_request(spec=FULL_SPEC, reseller="", lang="he"))
    assert result["ok"] is False
    assert "error" in result


# ─────────────────────────── price_quote ──────────────────────────────────────

PRICE_SPEC = {
    "cap": 30,
    "capType": "effective",
    "conn": "iscsi25",
    "ec": 3,
    "ecLevel": "Advanced",
}


def test_price_quote_yes_total_equals_sum_of_lines():
    """With 'כן', sell_total equals sum of line totals × margin, and cost equals sum of inMock lines."""
    result = _unwrap(price_quote(spec=PRICE_SPEC, user_confirmation="כן", margin_pct=8, lang="he"))
    assert result["ok"] is True

    computed_cost = sum(
        line["total"] for line in result["lines"] if line.get("in_mock") and line["total"] is not None
    )
    assert result["cost_total"] == computed_cost, (
        f"cost_total {result['cost_total']} != sum of lines {computed_cost}"
    )


def test_price_quote_sell_total_is_cost_times_margin():
    """sell_total = round(cost_total * 1.08)."""
    result = _unwrap(price_quote(spec=PRICE_SPEC, user_confirmation="כן", margin_pct=8, lang="he"))
    assert result["ok"] is True
    expected = round(result["cost_total"] * 1.08)
    assert result["sell_total"] == expected, (
        f"sell_total={result['sell_total']} expected={expected}"
    )


def test_price_quote_no_fails():
    """'לא' must fail with no calculation."""
    result = _unwrap(price_quote(spec=PRICE_SPEC, user_confirmation="לא", lang="he"))
    assert result["ok"] is False
    assert "cost_total" not in result


def test_price_quote_empty_fails():
    """Empty string must fail with no calculation."""
    result = _unwrap(price_quote(spec=PRICE_SPEC, user_confirmation="", lang="he"))
    assert result["ok"] is False
    assert "cost_total" not in result


def test_price_quote_margin_50_rejected():
    """Margin above 40 must be rejected."""
    result = _unwrap(price_quote(spec=PRICE_SPEC, user_confirmation="כן", margin_pct=50, lang="he"))
    assert result["ok"] is False


def test_price_quote_label_contains_mock():
    """The label field must contain 'MOCK'."""
    result = _unwrap(price_quote(spec=PRICE_SPEC, user_confirmation="yes", margin_pct=8, lang="he"))
    assert result["ok"] is True
    assert "MOCK" in result["label"], f"label={result['label']}"


# ─────────────────────────── pricelist copy ───────────────────────────────────

def test_pricelist_copy_identical_to_source():
    """orchestrate/tools/data/mock-pricelist.json must be identical to data/mock-pricelist.json."""
    source = REPO_ROOT / "data" / "mock-pricelist.json"
    copy = REPO_ROOT / "orchestrate" / "tools" / "data" / "mock-pricelist.json"

    assert source.exists(), f"Source not found: {source}"
    assert copy.exists(), f"Copy not found: {copy}"

    with open(source, encoding="utf-8") as f:
        source_data = json.load(f)
    with open(copy, encoding="utf-8") as f:
        copy_data = json.load(f)

    assert source_data == copy_data, "Pricelist copy differs from source"
