"""
orchestrate/tools/internal_tools.py

Blues internal-team tools for the blues_quote_desk_internal agent.

Tools:
  analyze_request  – parse a reseller email spec, size main + alternative,
                     detect missing fields, draft a follow-up email when needed.
  price_quote      – compute MOCK pricing from mock-pricelist.json after explicit confirmation.
  submit_request   – re-exported from submit_request.py (no changes).
"""

import json
import re
from pathlib import Path

from ibm_watsonx_orchestrate.agent_builder.tools import tool, ToolPermission

# ── imports from sibling modules ─────────────────────────────────────────────
try:
    from tools.sizer import size, _isolate_ltr, MODELS
except ImportError:
    from sizer import size, _isolate_ltr, MODELS  # type: ignore[no-redef]

# ── price-list ────────────────────────────────────────────────────────────────
_PRICELIST_PATH = Path(__file__).resolve().parent / "data" / "mock-pricelist.json"
with open(_PRICELIST_PATH, encoding="utf-8") as _f:
    _PRICELIST = json.load(_f)

# ── Missing-field labels (fixed Hebrew) ──────────────────────────────────────
_MISSING_LABELS = {
    "cap":       "נפח",
    "conn":      "סוג חיבור (FC או iSCSI)",
    "sanSw":     "מתגי SAN",
    "ec":        "שנות Expert Care",
    "ecLevel":   "רמת Expert Care",
}

# ── helpers ───────────────────────────────────────────────────────────────────

def _lookup_feature(feature: str):
    """Port of agent/price.js lookupFeature — search all pricelist sections."""
    sections = ["bundles", "drives", "connectivity", "transceivers", "expertCare", "shipping"]
    for section in sections:
        entry = _PRICELIST.get(section, {}).get(feature)
        if entry:
            return {"desc": entry["_desc"], "list": entry["list"]}
    return None


def _lookup_base(mtm: str):
    entry = _PRICELIST.get("base", {}).get(mtm)
    return entry["list"] if entry else None


def _compute_price(engine_result):
    """Port of agent/price.js computePrice."""
    result = {
        "label": _PRICELIST["_label"],
        "currency": _PRICELIST["_currency"],
        "lines": [],
        "baseList": None,
        "totalList": 0,
        "missingFeatures": [],
    }
    if not engine_result or not engine_result.get("econfig"):
        return result

    rec = engine_result.get("recommendation") or {}
    mtm = rec.get("mtm")
    model_name = rec.get("model", "")
    if mtm:
        base_price = _lookup_base(mtm)
        result["baseList"] = base_price
        if base_price is not None:
            result["totalList"] += base_price
            result["lines"].insert(0, {
                "feature": mtm,
                "qty": 1,
                "desc": f"Base unit ({model_name})",
                "unitList": base_price,
                "extList": base_price,
                "inMockList": True,
            })
        else:
            result["missingFeatures"].append(mtm)

    for line in (engine_result["econfig"].get("lines") or []):
        feature = line.get("feature")
        qty = line.get("qty") or 1
        if not feature:
            result["lines"].append({
                "feature": None,
                "qty": qty,
                "desc": line.get("he") or line.get("en") or "—",
                "unitList": None,
                "extList": None,
                "inMockList": False,
            })
            continue
        found = _lookup_feature(feature)
        if found:
            ext = found["list"] * qty
            result["lines"].append({
                "feature": feature,
                "qty": qty,
                "desc": found["desc"],
                "unitList": found["list"],
                "extList": ext,
                "inMockList": True,
            })
            result["totalList"] += ext
        else:
            result["lines"].append({
                "feature": feature,
                "qty": qty,
                "desc": line.get("he") or line.get("en") or "—",
                "unitList": None,
                "extList": None,
                "inMockList": False,
            })
            result["missingFeatures"].append(feature)

    return result


def _next_model_spec(spec: dict, main_model_key: str) -> dict:
    """Return a spec for the alternative: next model up, or next drive size."""
    alt = dict(spec)
    model_keys = [m["key"] for m in MODELS]
    if main_model_key == "FS5600":
        alt["model"] = "FS7600"
    else:
        # same model, next drive size — encode via tier hint; engine will pick
        alt["model"] = "FS7600"
        # bump cap slightly to force a larger drive size
        cap = spec.get("cap", 0)
        # find current drive size for FS7600 and nudge past it
        r = size(spec)
        if r.get("recommendation"):
            cur_size = r["recommendation"]["drives"]["sizeTB"]
            # next size in MODELS[1]["sizes"]
            sizes = MODELS[1]["sizes"]
            idx = sizes.index(cur_size) if cur_size in sizes else -1
            if idx >= 0 and idx + 1 < len(sizes):
                # compute usable of 6 drives at next size and use as raw request
                next_size = sizes[idx + 1]
                alt["cap"] = next_size * 6
                alt["capType"] = "raw"
    return alt


def _items_from_engine(engine_result) -> list:
    """Extract [{code, qty, desc}] from an engine result."""
    items = []
    econfig = engine_result.get("econfig") or {}
    rec = engine_result.get("recommendation") or {}
    mtm = rec.get("mtm")
    model_name = rec.get("model", "")
    if mtm:
        items.append({"code": mtm, "qty": 1, "desc": f"Base unit ({model_name})"})
    for line in (econfig.get("lines") or []):
        feature = line.get("feature")
        if feature:
            raw_desc = line.get("he") or line.get("en") or "—"
            qty = line.get("qty") or 1
            # Remove leading "<number> " prefix that duplicates the qty column
            clean_desc = re.sub(r"^\d+\s+", "", raw_desc)
            items.append({
                "code": feature,
                "qty": qty,
                "desc": clean_desc,
            })
    return items


def _summary_line(engine_result) -> str:
    rec = engine_result.get("recommendation")
    if not rec:
        return "תצורה מותאמת אישית"
    d = rec["drives"]
    conn = rec.get("connectivity", "")
    ec = rec.get("expertCare", {})
    usable = rec.get("capacityTB", {}).get("usable", "")
    eff = rec.get("capacityTB", {}).get("effectiveEstimate", "")
    return _isolate_ltr(
        f"{rec['model']} – {d['count']}×{d['sizeTB']}TB FCM5, "
        f"~{usable}TB שמיש לפני דחיסה, ~{eff}TB אפקטיבי אחרי דחיסה (הערכה), "
        f"{conn}, Expert Care {ec.get('level','')} {ec.get('years','')}Y"
    )


def _detect_missing(spec: dict, want_fc: bool) -> list:
    """Return Hebrew labels for required fields not present in spec."""
    missing = []
    if not spec.get("cap"):
        missing.append(_MISSING_LABELS["cap"])
    if not spec.get("conn"):
        missing.append(_MISSING_LABELS["conn"])
    if want_fc and not spec.get("sanSw"):
        missing.append(_MISSING_LABELS["sanSw"])
    if not spec.get("ec"):
        missing.append(_MISSING_LABELS["ec"])
    if not spec.get("ecLevel"):
        missing.append(_MISSING_LABELS["ecLevel"])
    return missing


def _connectivity_assumption(spec: dict) -> str | None:
    """Return an assumption string when connectivity was not specified."""
    if not spec.get("conn"):
        return "לא צוין חיבור, הוצג FC 32Gb כברירת מחדל"
    return None


# ── Tool 1: analyze_request ────────────────────────────────────────────────────

@tool(permission=ToolPermission.READ_ONLY)
def analyze_request(
    spec: dict,
    reseller: str,
    end_customer: str = "",
    quotes: list = [],
    lang: str = "he",
) -> dict:
    """Analyze a reseller email: size the main + alternative configuration, detect missing fields,
    and draft a follow-up email when information is missing.

    Args:
        spec: FlashSystem sizing spec built from explicit email fields only.
              Fields: cap, capType, conn, fcPorts, sanSw, ec, ecLevel, cables, tier, model, txType.
        reseller: The sender's company name (the reseller, NOT the end customer). Required.
        end_customer: The end customer's company name, if mentioned.
        quotes: Up to 6 exact sentences from the email that support the spec fields.
        lang: "he" (default) or "en".

    Returns:
        dict with keys: ok, reseller, end_customer, main, alternative, missing,
        assumptions, quotes, display, draft_email.
    """
    if not reseller or not reseller.strip():
        return {"ok": False, "error": "reseller is required — the sender's company name must be provided."}

    quotes = (quotes or [])[:6]
    want_fc = bool(re.search(r"fc", str(spec.get("conn", "")), re.IGNORECASE))

    # Run engine on main spec
    ctx = {"reseller": reseller, "endCustomer": end_customer or None}
    main_result = size(spec, ctx)

    # Build alternative spec
    main_model_key = (main_result.get("recommendation") or {}).get("mtm", "").split("-")[0]
    # Better: get from recommendation.model string
    rec_main = main_result.get("recommendation") or {}
    model_name_str = rec_main.get("model", "FlashSystem 5600")
    main_model_key = "FS7600" if "7600" in model_name_str else "FS5600"

    alt_spec = _next_model_spec(spec, main_model_key)
    alt_result = size(alt_spec, ctx)

    # Build main/alternative dicts
    def _build_config(eng_res, label_spec):
        rec = eng_res.get("recommendation")
        if rec:
            return {
                "model": rec["model"],
                "mtm": rec["mtm"],
                "summary_line": _summary_line(eng_res),
                "items": _items_from_engine(eng_res),
            }
        return {
            "model": "תצורה מותאמת אישית",
            "mtm": "",
            "summary_line": "תצורה מותאמת אישית",
            "items": _items_from_engine(eng_res),
        }

    main_cfg = _build_config(main_result, spec)
    alt_cfg = _build_config(alt_result, alt_spec)

    missing = _detect_missing(spec, want_fc)

    # Assumptions: questions from engine that do NOT contain "ePricer" or "Value Seller"
    raw_questions = main_result.get("questions") or []
    assumptions = []
    for q in raw_questions:
        text = q.get("he") if isinstance(q, dict) else str(q)
        if text and "?" not in text and "ePricer" not in text and "Value Seller" not in text:
            assumptions.append(text)

    # Add connectivity assumption when not specified
    conn_assumption = _connectivity_assumption(spec)
    if conn_assumption and conn_assumption not in assumptions:
        assumptions.append(conn_assumption)

    # Draft email (only when missing)
    draft_email = ""
    if missing:
        bullets = "\n".join(f"• {m}" for m in missing)
        draft_email = (
            f"היי {reseller},\n\n"
            f"תודה על הפנייה.\n"
            f"כדי להכין הצעה מלאה, אנחנו צריכים עוד כמה פרטים:\n\n"
            f"{bullets}\n\n"
            f"תודה, צוות בלוז"
        )

    # ── display (Markdown Hebrew) ─────────────────────────────────────────────
    lines = []

    lines.append("## לקוח ומשווק")
    lines.append(f"**משווק:** {_isolate_ltr(reseller)}")
    if end_customer:
        lines.append(f"**לקוח קצה:** {_isolate_ltr(end_customer)}")

    lines.append("")
    lines.append("## תצורה מוצעת")
    lines.append(main_cfg["summary_line"])

    lines.append("")
    lines.append("## חלופה")
    lines.append(alt_cfg["summary_line"])

    lines.append("")
    lines.append("## פריטים")
    lines.append("| קוד | כמות | תיאור |")
    lines.append("|-----|------|-------|")
    for item in main_cfg["items"]:
        lines.append(f"| {_isolate_ltr(item['code'] or '')} | {item['qty']} | {item['desc']} |")

    lines.append("")
    lines.append("## ציטוטים מהמייל")
    if quotes:
        for q in quotes:
            lines.append(f"> {q}")
    else:
        lines.append("_לא סופקו ציטוטים_")

    lines.append("")
    lines.append("## הנחות")
    if assumptions:
        for a in assumptions:
            lines.append(f"- {a}")
    else:
        lines.append("_אין הנחות נוספות_")

    lines.append("")
    lines.append("## מה חסר")
    if missing:
        for m in missing:
            lines.append(f"- {m}")
    else:
        lines.append("_המידע מלא_")

    if missing and draft_email:
        lines.append("")
        lines.append("## טיוטת מייל למשווק")
        lines.append("```")
        lines.append(draft_email)
        lines.append("```")

    lines.append("")
    lines.append("---")
    lines.append("לשלוח לתמחור? (כן / לא)")

    display = "\n".join(lines)

    return {
        "ok": True,
        "reseller": reseller,
        "end_customer": end_customer,
        "main": main_cfg,
        "alternative": alt_cfg,
        "missing": missing,
        "assumptions": assumptions,
        "quotes": quotes,
        "display": display,
        "draft_email": draft_email,
    }


# ── Tool 2: price_quote ────────────────────────────────────────────────────────

@tool(permission=ToolPermission.READ_ONLY)
def price_quote(
    spec: dict,
    user_confirmation: str,
    margin_pct: float = 8,
    lang: str = "he",
) -> dict:
    """Compute MOCK pricing for a FlashSystem spec after explicit user confirmation.

    Args:
        spec: FlashSystem sizing spec (same fields as size_flashsystem).
        user_confirmation: The user's reply text. Must contain an explicit "כן", "yes",
            "מאשר", or "ok" (case-insensitive) and must NOT contain "לא" or "no"
            as a separate word.
        margin_pct: Margin percentage, 0–40. Default 8.
        lang: "he" (default) or "en".

    Returns:
        dict with keys: ok, lines, cost_total, margin_pct, sell_total, label, display.
    """
    # ── Confirmation check ────────────────────────────────────────────────────
    confirm_text = (user_confirmation or "").strip().lower()
    approved = bool(re.search(r"(^|[\s,])(?:כן|yes|מאשר|ok)($|[\s,!.])", confirm_text, re.IGNORECASE))
    has_no = bool(re.search(r"\b(לא|no)\b", confirm_text, re.IGNORECASE))
    if not approved or has_no:
        return {
            "ok": False,
            "display": "צריך אישור מפורש לפני תמחור. לשלוח לתמחור? (כן / לא)",
        }

    # ── Margin validation ─────────────────────────────────────────────────────
    if not (0 <= margin_pct <= 40):
        return {
            "ok": False,
            "display": f"מרווח {margin_pct}% מחוץ לטווח המותר (0–40%).",
        }

    # ── Run engine ────────────────────────────────────────────────────────────
    engine_result = size(spec)
    price_data = _compute_price(engine_result)

    cost_total = round(price_data["totalList"])
    sell_total = round(cost_total * (1 + margin_pct / 100))
    label = price_data["label"]

    # Build output lines
    out_lines = []
    for line in price_data["lines"]:
        out_lines.append({
            "code": line.get("feature") or "",
            "qty": line.get("qty", 1),
            "desc": line.get("desc", "—"),
            "list_price": line.get("unitList"),
            "total": line.get("extList"),
            "in_mock": line.get("inMockList", False),
        })

    unknown_codes = price_data.get("missingFeatures", [])

    # ── Display (Markdown) ────────────────────────────────────────────────────
    md = []
    md.append("| פריט | קוד | כמות | מחיר רשימה | סה\"כ |")
    md.append("|------|-----|------|-----------|------|")
    for ol in out_lines:
        if ol["in_mock"]:
            unit_str = f"${ol['list_price']:,}" if ol["list_price"] is not None else "—"
            total_str = f"${ol['total']:,}" if ol["total"] is not None else "—"
        else:
            unit_str = "—"
            total_str = "—"
        code_display = _isolate_ltr(ol["code"]) if ol["code"] else "—"
        md.append(f"| {ol['desc']} | {code_display} | {ol['qty']} | {unit_str} | {total_str} |")

    if unknown_codes:
        md.append("")
        md.append("**לבדוק ב-e-config:** " + ", ".join(_isolate_ltr(c) for c in unknown_codes))

    md.append("")
    md.append(f"סה\"כ עלות: ${cost_total:,}")
    md.append(f"מרווח: {int(margin_pct)}%")
    md.append(f"מחיר מכירה מוצע: ${sell_total:,}")
    md.append("")
    md.append("מחירי MOCK להדגמה בלבד, לא להצעה אמיתית.")

    return {
        "ok": True,
        "lines": out_lines,
        "cost_total": cost_total,
        "margin_pct": margin_pct,
        "sell_total": sell_total,
        "label": label,
        "display": "\n".join(md),
    }
