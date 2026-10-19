"""
orchestrate/tests/test_parity.py

Parity test: runs the Python port (orchestrate/tools/sizer.py) on every
case in orchestrate/tests/golden.json and asserts that:
  - route
  - recommendation (model, drives, capacityTB, connectivity, fcPorts, expertCare, san, storageAssurance)
  - econfig.lines  (feature + qty only)
  - public.headline (he + en)

all match the JS engine's output exactly.

Run from repo root:
    source venv/bin/activate
    PYTHONPATH=orchestrate python -m pytest orchestrate/tests/test_parity.py -v
"""

import json
import sys
from pathlib import Path

import pytest

# Allow `from tools.sizer import size` without the package being installed
REPO_ROOT = Path(__file__).resolve().parent.parent.parent  # blues-deal-desk/
sys.path.insert(0, str(REPO_ROOT / "orchestrate"))

from tools.sizer import size  # noqa: E402

GOLDEN_PATH = Path(__file__).resolve().parent / "golden.json"

with open(GOLDEN_PATH, encoding="utf-8") as f:
    GOLDEN_CASES = json.load(f)


# ── helpers ──────────────────────────────────────────────────────────────────

def _norm_lines(lines):
    """Strip free-text 'he' field; keep only feature + qty for comparison."""
    if lines is None:
        return None
    return [{"feature": l.get("feature"), "qty": l.get("qty")} for l in lines]


def _norm_rec(rec):
    """Return a comparable subset of recommendation (omits san.he which is
    a display string and irrelevant for parity)."""
    if rec is None:
        return None
    san = rec.get("san")
    if san:
        san = {k: v for k, v in san.items() if k != "he"}
    return {
        "model": rec.get("model"),
        "mtm": rec.get("mtm"),
        "drives": rec.get("drives"),
        "capacityTB": rec.get("capacityTB"),
        "connectivity": rec.get("connectivity"),
        "fcPorts": rec.get("fcPorts"),
        "expertCare": rec.get("expertCare"),
        "san": san,
        "storageAssurance": rec.get("storageAssurance"),
    }


# ── parametrised test ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("case", GOLDEN_CASES, ids=[c["id"] for c in GOLDEN_CASES])
def test_parity(case):
    spec = case["spec"]
    ctx  = case["ctx"]
    py_result = size(spec, ctx)

    # 1. route
    assert py_result["route"] == case["route"], (
        f"[{case['id']}] route: Python={py_result['route']} JS={case['route']}"
    )

    # 2. recommendation
    py_rec = _norm_rec(py_result.get("recommendation"))
    js_rec = _norm_rec(case.get("recommendation"))
    assert py_rec == js_rec, (
        f"[{case['id']}] recommendation mismatch:\n"
        f"  Python: {json.dumps(py_rec, ensure_ascii=False)}\n"
        f"  JS    : {json.dumps(js_rec, ensure_ascii=False)}"
    )

    # 3. econfig.lines (feature + qty)
    py_lines = _norm_lines(
        py_result.get("econfig", {}).get("lines") if py_result.get("econfig") else None
    )
    js_lines = _norm_lines(case.get("econfigLines"))
    assert py_lines == js_lines, (
        f"[{case['id']}] econfig.lines mismatch:\n"
        f"  Python: {json.dumps(py_lines, ensure_ascii=False)}\n"
        f"  JS    : {json.dumps(js_lines, ensure_ascii=False)}"
    )

    # 4. public.headline
    py_headline = py_result.get("public", {}).get("headline") if py_result.get("public") else None
    js_headline = case.get("publicHeadline")
    assert py_headline == js_headline, (
        f"[{case['id']}] public.headline mismatch:\n"
        f"  Python: {json.dumps(py_headline, ensure_ascii=False)}\n"
        f"  JS    : {json.dumps(js_headline, ensure_ascii=False)}"
    )
