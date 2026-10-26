"""
orchestrate/tests/test_site_tools.py

Tests for orchestrate/tools/site_tools.py.
All HTTP calls are mocked — no network access required.

Run from repo root:
    source venv/bin/activate
    PYTHONPATH=orchestrate python -m pytest orchestrate/tests/test_site_tools.py -v
"""

import sys
import re
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "orchestrate"))

from tools.site_tools import suggest_storage, create_customer_lead  # noqa: E402


# ── helpers ───────────────────────────────────────────────────────────────────

def _unwrap(tool_result) -> dict:
    """Extract the underlying dict from a ToolResponse (or plain dict)."""
    if isinstance(tool_result, dict):
        return tool_result
    return tool_result.content


def _mock_ok_response(ref="BD-2026-0001"):
    resp = MagicMock()
    resp.ok = True
    resp.status_code = 200
    resp.json.return_value = {"ok": True, "ref": ref, "route": "auto", "headline": "test"}
    return resp


# ── suggest_storage ───────────────────────────────────────────────────────────

class TestSuggestStorage:
    def test_returns_one_sentence(self):
        result = _unwrap(suggest_storage(20.0))
        assert result["ok"] is True
        sentence = result["sentence"]
        # One sentence ends with a period
        assert sentence.strip().endswith(".")
        # No newline inside the sentence itself
        assert "\n" not in sentence

    def test_no_price_digits_with_dollar(self):
        result = _unwrap(suggest_storage(20.0))
        assert result["ok"] is True
        sentence = result["sentence"]
        # No digit followed by "$"
        assert not re.search(r"\d\$", sentence)

    def test_no_feature_codes(self):
        result = _unwrap(suggest_storage(20.0))
        assert result["ok"] is True
        text = result["sentence"] + result["display"]
        for code in ("ADK", "ADS", "AL", "AC", "AH", "5127"):
            assert code not in text, f"Forbidden code/string found: {code}"

    def test_hebrew_contains_lipney_dchisa(self):
        result = _unwrap(suggest_storage(20.0, lang="he"))
        assert result["ok"] is True
        assert "לפני דחיסה" in result["sentence"]

    def test_bad_capacity_zero(self):
        result = _unwrap(suggest_storage(0.0))
        assert result["ok"] is False
        assert "error" in result

    def test_bad_capacity_negative(self):
        result = _unwrap(suggest_storage(-5.0))
        assert result["ok"] is False

    def test_bad_capacity_above_2000(self):
        result = _unwrap(suggest_storage(2001.0))
        assert result["ok"] is False

    def test_display_contains_sentence(self):
        result = _unwrap(suggest_storage(20.0, lang="he"))
        assert result["ok"] is True
        # display should start with the sentence
        assert result["display"].startswith(result["sentence"])

    def test_english_no_lipney_dchisa(self):
        result = _unwrap(suggest_storage(20.0, lang="en"))
        assert result["ok"] is True
        assert "before compression" in result["sentence"]
        assert "לפני דחיסה" not in result["sentence"]

    def test_no_question_mark_in_sentence(self):
        """Neither usable nor effective TB should produce a '?' in the sentence."""
        result = _unwrap(suggest_storage(20.0))
        assert result["ok"] is True
        assert "?" not in result["sentence"]

    def test_no_double_fsi_marks(self):
        """_isolate_ltr must be applied only once — no FSI immediately followed by FSI."""
        result = _unwrap(suggest_storage(20.0, lang="he"))
        assert result["ok"] is True
        FSI = "\u2068"
        assert FSI + FSI not in result["sentence"]

    def test_missing_effective_omits_effective_clause(self):
        """When the engine returns no effective capacity, the sentence must omit it."""
        from unittest.mock import patch as _patch
        fake_result = {
            "recommendation": {
                "model": "5200",
                "capacityTB": {"usable": 22.0},  # no "effective" key
            }
        }
        with _patch("tools.site_tools.size", return_value=fake_result):
            result = _unwrap(suggest_storage(20.0, lang="he"))
        assert result["ok"] is True
        assert "?" not in result["sentence"]
        assert "אפקטיבי" not in result["sentence"]


# ── create_customer_lead — confirmation ───────────────────────────────────────

class TestConfirmation:
    def test_yes_passes(self):
        with patch("tools.site_tools.http_requests.post", return_value=_mock_ok_response()):
            result = _unwrap(create_customer_lead(
                company="ACME",
                contact_name="דנה כהן",
                phone="0501234567",
                email="dana@acme.co.il",
                need_summary="20TB office",
                visitor_confirmation="כן, תשלחו",
            ))
        assert result["ok"] is True

    def test_yes_please_passes(self):
        with patch("tools.site_tools.http_requests.post", return_value=_mock_ok_response()):
            result = _unwrap(create_customer_lead(
                company="ACME",
                contact_name="Dana Cohen",
                phone="0501234567",
                email="dana@acme.co.il",
                need_summary="20TB office",
                visitor_confirmation="yes please",
                lang="en",
            ))
        assert result["ok"] is True

    def test_no_fails(self):
        with patch("tools.site_tools.http_requests.post") as mock_post:
            result = _unwrap(create_customer_lead(
                company="ACME",
                contact_name="דנה כהן",
                phone="0501234567",
                email="dana@acme.co.il",
                need_summary="20TB",
                visitor_confirmation="לא",
            ))
        assert result["ok"] is False
        mock_post.assert_not_called()

    def test_maybe_fails(self):
        with patch("tools.site_tools.http_requests.post") as mock_post:
            result = _unwrap(create_customer_lead(
                company="ACME",
                contact_name="דנה כהן",
                phone="0501234567",
                email="dana@acme.co.il",
                need_summary="20TB",
                visitor_confirmation="אולי",
            ))
        assert result["ok"] is False
        mock_post.assert_not_called()

    def test_empty_fails(self):
        with patch("tools.site_tools.http_requests.post") as mock_post:
            result = _unwrap(create_customer_lead(
                company="ACME",
                contact_name="דנה כהן",
                phone="0501234567",
                email="dana@acme.co.il",
                need_summary="20TB",
                visitor_confirmation="",
            ))
        assert result["ok"] is False
        mock_post.assert_not_called()

    def test_lachen_fails(self):
        """'לכן' contains 'כן' as a substring — must not count as confirmation."""
        with patch("tools.site_tools.http_requests.post") as mock_post:
            result = _unwrap(create_customer_lead(
                company="ACME",
                contact_name="דנה כהן",
                phone="0501234567",
                email="dana@acme.co.il",
                need_summary="20TB",
                visitor_confirmation="לכן תחזרו",
            ))
        assert result["ok"] is False
        mock_post.assert_not_called()

    def test_muchan_fails(self):
        """'מוכן' contains 'כן' as a substring — must not count as confirmation."""
        with patch("tools.site_tools.http_requests.post") as mock_post:
            result = _unwrap(create_customer_lead(
                company="ACME",
                contact_name="דנה כהן",
                phone="0501234567",
                email="dana@acme.co.il",
                need_summary="20TB",
                visitor_confirmation="מוכן",
            ))
        assert result["ok"] is False
        mock_post.assert_not_called()




# ── create_customer_lead — validation ────────────────────────────────────────

class TestValidation:
    def test_bad_phone_rejected_no_http(self):
        with patch("tools.site_tools.http_requests.post") as mock_post:
            result = _unwrap(create_customer_lead(
                company="ACME",
                contact_name="דנה כהן",
                phone="123",          # too short
                email="dana@acme.co.il",
                need_summary="20TB",
                visitor_confirmation="כן",
            ))
        assert result["ok"] is False
        mock_post.assert_not_called()

    def test_bad_email_rejected_no_http(self):
        with patch("tools.site_tools.http_requests.post") as mock_post:
            result = _unwrap(create_customer_lead(
                company="ACME",
                contact_name="דנה כהן",
                phone="0501234567",
                email="not-an-email",
                need_summary="20TB",
                visitor_confirmation="כן",
            ))
        assert result["ok"] is False
        mock_post.assert_not_called()


# ── create_customer_lead — success ────────────────────────────────────────────

class TestSuccess:
    def test_display_contains_ref(self):
        ref = "BD-2026-TEST"
        with patch("tools.site_tools.http_requests.post", return_value=_mock_ok_response(ref)):
            result = _unwrap(create_customer_lead(
                company="ACME",
                contact_name="דנה כהן",
                phone="0501234567",
                email="dana@acme.co.il",
                need_summary="20TB office",
                visitor_confirmation="כן, מאשרת",
            ))
        assert result["ok"] is True
        assert ref in result["display"]

    def test_payload_end_customer_and_summary(self):
        ref = "BD-2026-TEST2"
        with patch("tools.site_tools.http_requests.post", return_value=_mock_ok_response(ref)) as mock_post:
            _unwrap(create_customer_lead(
                company="ACME Ltd",
                contact_name="Dana Cohen",
                phone="0501234567",
                email="dana@acme.co.il",
                need_summary="20TB office storage",
                visitor_confirmation="yes",
                lang="en",
            ))
        call_kwargs = mock_post.call_args
        payload = call_kwargs[1]["json"] if call_kwargs[1] else call_kwargs[0][1]
        assert payload["endCustomer"] == "Dana Cohen"
        assert payload["summary"].startswith("[website lead]")

    def test_spec_has_no_source_key(self):
        """spec must not contain 'source' — the demo API rejects unknown fields."""
        with patch("tools.site_tools.http_requests.post", return_value=_mock_ok_response()) as mock_post:
            _unwrap(create_customer_lead(
                company="ACME",
                contact_name="Dana Cohen",
                phone="0501234567",
                email="dana@acme.co.il",
                need_summary="20TB",
                visitor_confirmation="yes",
                lang="en",
            ))
        payload = mock_post.call_args[1]["json"]
        assert "source" not in payload["spec"]
        assert "cap" in payload["spec"]
        assert "capType" in payload["spec"]

    def test_spec_capacity_tb_forwarded(self):
        """capacity_tb param must appear as spec['cap'] in the posted payload."""
        with patch("tools.site_tools.http_requests.post", return_value=_mock_ok_response()) as mock_post:
            _unwrap(create_customer_lead(
                company="ACME",
                contact_name="Dana Cohen",
                phone="0501234567",
                email="dana@acme.co.il",
                need_summary="20TB",
                visitor_confirmation="yes",
                capacity_tb=20.0,
                lang="en",
            ))
        payload = mock_post.call_args[1]["json"]
        assert payload["spec"]["cap"] == 20.0
