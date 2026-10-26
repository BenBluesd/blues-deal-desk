"""
Blues Sizer – Python 1:1 port of reference/sizer.js (Blues Distribution).

Logic, tables, routes and output shape are identical to BluesSizer.size(spec, ctx).
This file is the implementation; the ADK @tool wrapper is size_flashsystem() at the bottom.

Spec fields (all optional):
    cap        (number)  Required capacity in TB
    capType    (str)     "effective" | "usable" | "raw" | "unsure"
    conn       (str|list) Connectivity: "iscsi25", "fc32", "fc64", "onboard", or list
    speed      (str)     "fc32" | "fc64" | "iscsi25" | "onboard" | "unsure"
    fcPorts    (number)  Number of FC ports requested
    sanSw      (str)     "has" | "need" | "direct" | "unsure"
    ec         (int)     Expert Care years: 3 or 5
    ecLevel    (str)     "Basic" | "Advanced"
    model      (str)     "FS5600" | "FS7600" | null
    tier       (str)     "entry" | "mid" | "high" | "auto"
    txType     (str)     "sfp28" | "sfp10" | "rj45" | "none" | null
    cables     (bool)    Include FC OM3 cables (default True)
    sa         (int)     Storage Assurance: 1, 2, or False

Context fields alongside spec:
    reseller       (str)  Reseller company name
    endCustomer    (str)  End customer name
    hasOpportunity (bool) Whether an IBM opportunity ID is already registered
"""

import math
import re
from ibm_watsonx_orchestrate.agent_builder.tools import tool, ToolPermission

# ── Constants (mirrors JS) ───────────────────────────────────────────────────

VERSION = "1.5.6"

RULES = {
    "effectivePerUsable": 2.4,
    "reviewAboveEffTB": 500,
    "defaultFcPorts": 8,
    "shipping": {"feature": "AKNC", "he": "משלוח Premium"},
}

MODELS = [
    {"key": "FS5600", "name": "FlashSystem 5600", "mtm": "5127-A20", "slots": 12,
     "sizes": [6.6, 13.2, 26.4, 52.8], "fcPortsMax": 16, "verified": True},
    {"key": "FS7600", "name": "FlashSystem 7600", "mtm": "5075-A30", "slots": 24,
     "sizes": [6.6, 13.2, 26.4, 52.8], "fcPortsMax": 32, "verified": False},
]

FCM_FEATURE_5600 = {6.6: "ADSJ", 13.2: "ADSK", 26.4: "ADSL", 52.8: "ADSM"}

BUNDLES_5600 = [
    {"feature": "ADK7", "count": 2, "size": 13.2},
    {"feature": "ADK9", "count": 6, "size": 6.6},
    {"feature": "ADK8", "count": 2, "size": 26.4},
]

IBM_PUBLISHED_EFF = {
    "FS5600:2x13.2": 30, "FS5600:6x6.6": 45, "FS5600:2x26.4": 65,
    "FS5600:8x6.6": 80, "FS5600:12x6.6": 145, "FS5600:12x13.2": 295,
    "FS5600:10x26.4": 460, "FS5600:8x52.8": 655,
    "FS7600:14x6.6": 175, "FS7600:24x6.6": 315, "FS7600:18x13.2": 465,
    "FS7600:24x13.2": 635, "FS7600:18x26.4": 935,
}

EC_LEVELS = ["Basic", "Advanced"]

TX = {
    "sfp28": {"feature": "ACJ5", "name": "25GbE SW SFP28 transceivers",
               "he": "25GbE SW SFP28 transceivers", "tag": "SFP28", "verified": True},
    "sfp10": {"feature": "ACJ6", "name": "10GbE SW SFP+ transceivers",
               "he": "10GbE SW SFP+ transceivers", "tag": "SFP+", "verified": True},
    "rj45":  {"feature": "ACJC", "name": "10GbE SFP+ RJ45 transceivers",
               "he": "10GbE SFP+ RJ45 transceivers", "tag": "RJ45", "verified": True},
}
TX_TYPES = ["none"] + list(TX.keys())

EC_FEATURE_5600 = {
    "Advanced": {3: "ALK3", 5: "ALK5"},
    "Basic":    {5: "ALJ5"},
}

EC_NOBUNDLE_5600 = {
    "Advanced": {5: [
        {"feature": "ALH0", "qty": 1, "he": "Expert Care Indicator"},
        {"feature": "ALK5", "qty": 1, "he": "5 year IBM Storage Expert Care Advanced (N/C)"},
        {"feature": "5132-A05", "qty": 1, "he": "Expert Care Advanced ל-5 שנים (שירות 5132-A05)"},
    ]},
    "Basic": {5: [
        {"feature": "ALH0", "qty": 1, "he": "Expert Care Indicator"},
        {"feature": "ALJ5", "qty": 1, "he": "5 year IBM Storage Expert Care Basic (שירות ה-Basic נוסף לבד ב-e-config)"},
    ]},
}

CAP_TYPE = {0: "effective", 1: "usable", 2: "raw", 3: "unsure"}
SPEED    = {0: "fc32", 1: "fc64", 2: "iscsi25", 3: "unsure", 4: "onboard"}
SAN_SW   = {0: "has", 1: "need", 2: "direct", 3: "unsure"}

# ── Helpers ──────────────────────────────────────────────────────────────────

def H(he, en):
    return {"he": he, "en": en}


def r1(n):
    return round(n * 10) / 10


def _num(v):
    try:
        n = float(v)
        return n if math.isfinite(n) and n > 0 else 0
    except (TypeError, ValueError):
        return 0


def _pick(mapping, v, dflt):
    """Mirrors JS pick(): numeric index OR string value lookup, else default."""
    if v == "" or v is None:
        return dflt
    # Integer/numeric index
    try:
        idx = int(v)
        if idx in mapping:
            return mapping[idx]
    except (TypeError, ValueError):
        pass
    # String value already in the mapping values
    if v in mapping.values():
        return v
    return dflt


def _allowed_counts(slots):
    """Same as JS allowedCounts(): [2, 6, 7, … slots]"""
    return [2] + list(range(6, slots + 1))


def _usable_of(n, s):
    return s if n == 2 else (n - 3) * s


# ── normalize ────────────────────────────────────────────────────────────────

def normalize(spec):
    spec = spec or {}

    raw_conn = spec.get("conn")
    if isinstance(raw_conn, list):
        conn = [str(c) for c in raw_conn]
    elif raw_conn is not None:
        conn = [str(raw_conn)]
    else:
        conn = []

    want_fc = (
        len(conn) == 0 or
        any(re.search(r"fc", c, re.IGNORECASE) or c == "0" for c in conn)
    )
    want_iscsi = any(re.search(r"iscsi", c, re.IGNORECASE) or c == "1" for c in conn)

    ec_raw = spec.get("ec")
    ec_years = 5 if ec_raw in (1, "1", 5, "5") else 3

    ec_level_raw = str(spec.get("ecLevel") or "")
    ec_level = "Basic" if re.search(r"basic", ec_level_raw, re.IGNORECASE) else "Advanced"

    sa_raw = spec.get("sa")
    storage_assurance = sa_raw in (1, 2, "1", "2")

    tier_raw = spec.get("tier")
    tier = tier_raw if tier_raw in ("entry", "mid", "high") else "auto"

    model_raw = spec.get("model")
    model = model_raw if model_raw in ("FS5600", "FS7600") else None

    cables_raw = spec.get("cables")
    cables = False if cables_raw is False else True

    tx_raw = spec.get("txType")
    tx_fallback = spec.get("tx")
    if tx_raw in TX_TYPES:
        tx_type = tx_raw
    elif tx_fallback in (True, 1, "1"):
        tx_type = "sfp28"
    else:
        tx_type = None

    return {
        "cap": _num(spec.get("cap")),
        "capType": _pick(CAP_TYPE, spec.get("capType"), "unsure"),
        "wantFC": want_fc,
        "wantISCSI": want_iscsi,
        "speed": _pick(SPEED, spec.get("speed"), "unsure"),
        "fcPorts": _num(spec.get("fcPorts")),
        "sanSw": _pick(SAN_SW, spec.get("sanSw"), "unsure"),
        "ecYears": ec_years,
        "ecLevel": ec_level,
        "storageAssurance": storage_assurance,
        "tier": tier,
        "model": model,
        "cables": cables,
        "txType": tx_type,
    }


# ── sizeDrives ───────────────────────────────────────────────────────────────

def _size_drives(model, need):
    cands = []
    for s in model["sizes"]:
        for n in _allowed_counts(model["slots"]):
            raw = n * s
            usable = _usable_of(n, s)
            key = f"{model['key']}:{n}x{s}"
            published = IBM_PUBLISHED_EFF.get(key)
            eff = published if published is not None else usable * RULES["effectivePerUsable"]
            E = 1e-6
            if need["type"] == "raw":
                ok = raw + E >= need["tb"]
            elif need["type"] == "usable":
                ok = usable + E >= need["tb"]
            else:
                ok = eff + E >= need["tb"]
            if ok:
                cands.append({
                    "count": n, "size": s,
                    "raw": r1(raw), "usable": r1(usable),
                    "effective": round(eff),
                    "effSource": "ibm-catalog" if published is not None else "formula",
                })
                break  # inner loop: take the first count that fits for this size

    cands.sort(key=lambda c: (c["raw"], c["count"]))
    return cands[0] if cands else None


# ── modelsToTry ──────────────────────────────────────────────────────────────

def _models_to_try(n):
    if n["model"]:
        idx = next((i for i, m in enumerate(MODELS) if m["key"] == n["model"]), 0)
        return MODELS[idx:]
    min_idx = 1 if n["tier"] in ("high", "mid") else 0
    return MODELS[min_idx:]


# ── asciiName ────────────────────────────────────────────────────────────────

def _ascii_name(name, base):
    s = str(name or "")
    s = re.sub(r"[\u2013\u2014]", "-", s)
    s = re.sub(r"[^\x20-\x7E]", "", s)
    s = re.sub(r"\(\s*\)", "", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"^[\s\-]+", "", s).strip()
    result = s if len(s) >= len(base) else base
    return result[:120]


# ── addTx ────────────────────────────────────────────────────────────────────

def _add_tx(lines, out, tt, ports, where):
    t = TX.get(tt)
    if not t:
        out["notes"].append(H(
            "בלי משדרים: הלקוח מחבר את הפורטים במשדרים או בכבלי DAC משלו.",
            "No transceivers: customer supplies transceivers or DAC cables.",
        ))
        return
    lines.append({"feature": t["feature"], "qty": ports // 2,
                  "he": f"{t['he']}: {ports} משדרים {where}"})
    if not t["verified"]:
        out["verify"].append(H(
            f"{t['feature']} ({t['name']}): לאמת ב-e-config את הקוד ושכל יחידה היא זוג משדרים ({ports // 2} יחידות ל-{ports} פורטים).",
            f"{t['feature']}: verify code and pack size in e-config.",
        ))


# ── connectivity ─────────────────────────────────────────────────────────────

def _connectivity(model, n, out):
    """Returns {lines, fcPorts, label, iscsi} or None if too many FC ports."""
    lines = []
    fc_ports = 0

    if n["speed"] == "onboard":
        tt = n["txType"] or "none"
        if model["key"] == "FS5600":
            _add_tx(lines, out, tt, 4, "לפורטים המובנים")
        else:
            lines.append({"feature": None, "qty": 1,
                          "he": f"פורטים מובנים (לבדוק ב-e-config מה יש ב-{model['name']})"})
            out["verify"].append(H(
                f"{model['name']}: לבדוק ב-e-config אילו פורטים מובנים יש.",
                f"{model['name']}: check onboard ports in e-config.",
            ))
        if tt in ("sfp10", "rj45"):
            speed_label = "4x10GbE onboard" + ((" + " + TX[tt]["tag"]) if tt in TX else "")
        else:
            speed_label = "4x25GbE onboard" + ((" + " + TX[tt]["tag"]) if tt in TX else "")
        return {"lines": lines, "fcPorts": 0, "label": speed_label, "iscsi": True}

    iscsi_only = (not n["wantFC"] and n["wantISCSI"]) or \
                 (n["speed"] == "iscsi25" and not n["fcPorts"])

    if iscsi_only:
        speed_label = "8x25GbE"
        if model["key"] == "FS5600":
            lines.append({"feature": "ALB6", "qty": 1,
                          "he": "25/10 GbE Adapter pair (4 port): ‏4 פורטים בכרטיסים, יחד עם 4 המובנים 8 פורטים"})
            tt = n["txType"] or "sfp28"
            _add_tx(lines, out, tt, 8, "לכל 8 הפורטים (4 בכרטיסים + 4 מובנים)")
            if tt != "none":
                out["notes"].append(H(
                    "אם המשווק ביקש פחות משדרים (למשל ארבעה בלבד, כמו בשדה בוקר), להוריד לחצי מהיחידות.",
                    "If fewer transceivers were requested, halve the quantity.",
                ))
            if tt in ("sfp10", "rj45"):
                speed_label = "8x10GbE"
            if tt in TX:
                speed_label += " + " + TX[tt]["tag"]
        else:
            lines.append({"feature": None, "qty": 1,
                          "he": "כרטיסי 25GbE ל-iSCSI, 8 פורטים (לבחור קוד ב-e-config)"})
        return {"lines": lines, "fcPorts": 0, "label": speed_label, "iscsi": True}

    # FC path
    fc64 = n["speed"] == "fc64"
    fc_ports = max(
        RULES["defaultFcPorts"],
        math.ceil((n["fcPorts"] or RULES["defaultFcPorts"]) / 8) * 8,
    )
    if fc_ports > model["fcPortsMax"]:
        return None
    pairs = fc_ports // 8
    speed_label = f"{fc_ports}x{64 if fc64 else 32}Gb FC"
    if model["key"] == "FS5600":
        lines.append({"feature": "ALB8" if fc64 else "ALB9", "qty": pairs,
                      "he": f"{pairs} זוגות כרטיסי FC ‏{64 if fc64 else 32}Gb ({fc_ports} פורטים)"})
        if fc64:
            out["verify"].append(H(
                "ALB8 (64Gb FC): לאמת ב-e-config כמה פורטים יש בכל זוג.",
                "ALB8 (64Gb FC): verify ports per pair in e-config.",
            ))
        if n["cables"]:
            lines.append({"feature": "ACSR", "qty": fc_ports,
                          "he": f"{fc_ports} כבלי OM3 באורך 5 מ'"})
    else:
        lines.append({"feature": None, "qty": fc_ports,
                      "he": f"{fc_ports} פורטי FC ‏{64 if fc64 else 32}Gb (לבחור קודים ב-e-config)"})

    if n["wantISCSI"]:
        out["notes"].append(H(
            "iSCSI בנוסף ל-FC: יש פורטי 25/10Gb מובנים. אם צריך יותר, להוסיף כרטיס.",
            "iSCSI in addition to FC: onboard 25/10Gb ports exist; add a card if more are needed.",
        ))

    return {"lines": lines, "fcPorts": fc_ports, "label": speed_label, "iscsi": n["wantISCSI"]}


# ── finish ───────────────────────────────────────────────────────────────────

def _finish(out, _ctx):
    r = out["recommendation"]
    if r:
        headline = H(
            f"IBM {r['model']} עם {r['drives']['count']} כונני FCM5 של {r['drives']['sizeTB']}TB",
            f"IBM {r['model']} with {r['drives']['count']} × {r['drives']['sizeTB']}TB FCM5",
        )
        draid = "DRAID1" if r["drives"]["count"] == 2 else "DRAID6"
        lines = [
            H(
                f"נפח: {r['capacityTB']['raw']}TB פיזי, כ-{r['capacityTB']['usable']}TB שמיש ({draid}), כ-{r['capacityTB']['effectiveEstimate']}TB אפקטיבי אחרי דחיסה (הערכה)",
                f"Capacity: {r['capacityTB']['raw']}TB physical, ~{r['capacityTB']['usable']}TB usable ({draid}), ~{r['capacityTB']['effectiveEstimate']}TB effective (estimate)",
            ),
            H(f"קישוריות: {r['connectivity']}", f"Connectivity: {r['connectivity']}"),
            H(
                f"Expert Care {r['expertCare']['level']} ל-{r['expertCare']['years']} שנים",
                f"Expert Care {r['expertCare']['level']}, {r['expertCare']['years']} years",
            ),
        ]
        if r.get("san"):
            san = r["san"]
            lines.append(H(
                san["he"],
                f"2 × SAN24B-7 switches (dual fabric), ~{san['activePortsPerSwitch']} active ports each",
            ))
    else:
        headline = H(
            "הבקשה עוברת לבניית תצורה אישית",
            "This request goes to a custom configuration",
        )
        lines = []

    out["public"] = {
        "route": out["route"],
        "headline": headline,
        "lines": lines,
        "questions": out["questions"],
        "reasons": out["reasons"],
        "disclaimer": H(
            "הערכה ראשונית בלבד. התצורה הסופית והמחיר יגיעו מבלוז.",
            "Preliminary estimate only. Final configuration and price come from Blues.",
        ),
    }
    return out


# ── size ─────────────────────────────────────────────────────────────────────

def size(spec, ctx=None):
    """
    Core sizing function — mirrors BluesSizer.size(spec, ctx).

    Returns the full result dict with keys:
        engine, version, family, route, reasons, questions, notes, verify,
        input, recommendation, econfig, public
    """
    ctx = ctx or {}
    n = normalize(spec)
    out = {
        "engine": "blues-sizer", "version": VERSION, "family": "FlashSystem",
        "route": "auto", "reasons": [], "questions": [], "notes": [], "verify": [],
        "input": n, "recommendation": None, "econfig": None, "public": None,
    }

    def Q(he, en):
        out["questions"].append(H(he, en))

    if not n["cap"]:
        out["route"] = "custom"
        out["reasons"].append(H("לא צוינה קיבולת", "No capacity given"))
        return _finish(out, ctx)

    need = {"tb": n["cap"], "type": "effective" if n["capType"] == "unsure" else n["capType"]}

    # Find the best model + drive combination
    chosen = None
    for m in _models_to_try(n):
        conn_probe = _connectivity(m, n, {"verify": [], "notes": []})
        if conn_probe is None:
            continue
        d = _size_drives(m, need)
        if d is None:
            continue
        chosen = {"model": m, "drives": d}
        break

    if chosen is None:
        out["route"] = "custom"
        out["reasons"].append(H(
            "הצורך גדול ממה שנכנס בכוננים הפנימיים או בפורטים של הדגמים. כנראה צריך מדפי הרחבה (למשל 4662-92G) או שתי מערכות. הצוות שלנו בונה אותה ידנית.",
            "Requirement exceeds internal drives or ports. Likely needs expansion drawers (e.g. 4662-92G) or two systems. Our team builds it manually.",
        ))
        return _finish(out, ctx)

    model = chosen["model"]
    drives = chosen["drives"]

    if n["model"] and model["key"] != n["model"]:
        out["notes"].append(H(
            f"הנפח או הפורטים לא נכנסים ב-{n['model'].replace('FS', 'FlashSystem ')}, לכן הומלץ {model['name']}.",
            f"Did not fit {n['model']}; recommended {model['name']}.",
        ))

    conn = _connectivity(model, n, out)

    if not model["verified"]:
        out["verify"].append(H(
            f"{model['name']}: מספר המפרצים, הגדלים ומקסימום הפורטים לא נבדקו עדיין ב-e-config. לאמת.",
            f"{model['name']}: slots, sizes and max ports not yet verified in e-config.",
        ))

    # Drive lines
    bundle = None
    if model["key"] == "FS5600":
        bundle = next(
            (b for b in BUNDLES_5600 if b["count"] == drives["count"] and b["size"] == drives["size"]),
            None,
        )
    if bundle:
        drive_lines = [{"feature": bundle["feature"], "qty": 1,
                        "he": f"Value Bundle: {drives['count']} כונני FCM5 של {drives['size']}TB"}]
    else:
        feat = FCM_FEATURE_5600.get(drives["size"]) if model["key"] == "FS5600" else None
        drive_lines = [{"feature": feat, "qty": drives["count"],
                        "he": f"{drives['count']} כונני FCM5 של {drives['size']}TB"}]

    # EC lines
    ec_no_bundle = None
    ec_feature = None
    if model["key"] == "FS5600":
        if not bundle:
            ec_no_bundle = ((EC_NOBUNDLE_5600.get(n["ecLevel"]) or {}).get(n["ecYears"]) or None)
        else:
            ec_feature = ((EC_FEATURE_5600.get(n["ecLevel"]) or {}).get(n["ecYears"]) or None)

    if model["key"] == "FS5600" and not bundle and not ec_no_bundle and n["ecLevel"] == "Advanced":
        out["notes"].append(H(
            f"Expert Care Advanced ל-{n['ecYears']} שנים בלי Value Bundle: לבחור ב-e-config (ל-5 שנים זה ALH0 + 5132-A05).",
            "Expert Care without bundle: pick in e-config.",
        ))
    if n["ecLevel"] == "Basic" and n["ecYears"] != 5:
        out["notes"].append(H(
            f"Expert Care Basic: ב-e-config לבחור \"{n['ecYears']} year IBM Storage Expert Care Basic\" (הקוד עוד לא נשמר במנוע).",
            f"Expert Care Basic: pick \"{n['ecYears']} year IBM Storage Expert Care Basic\" in e-config.",
        ))
    ec_level_raw = str((spec or {}).get("ecLevel") or "")
    if re.search(r"premium", ec_level_raw, re.IGNORECASE):
        out["notes"].append(H(
            "המשווק ביקש Premium, שלא מוצע כרגע. חושב לפי Advanced.",
            "Premium requested but not offered now; sized as Advanced.",
        ))

    # SAN switches
    san = None
    if n["sanSw"] == "need":
        per_switch = min(24, max(8, math.ceil(conn["fcPorts"] / 2) + 8))
        san = {
            "model": "SAN24B-7", "mtm": "8969-P24", "qty": 2,
            "activePortsPerSwitch": per_switch,
            "he": f"2 מתגי SAN24B-7 (שני Fabric), כ-{per_switch} פורטים פעילים בכל מתג",
        }
        Q("הוספנו שני מתגים לשרידות. כמה שרתים יתחברו, ובכמה פורטים כל אחד?",
          "We added two switches for redundancy. How many servers connect, and with how many ports each?")
    elif n["sanSw"] == "unsure" and conn["fcPorts"]:
        Q("יש ללקוח מתגי SAN, או שצריך מתגים חדשים?",
          "Does the customer have SAN switches, or are new ones needed?")

    if n["capType"] == "unsure":
        Q("לא צוין אם הקיבולת היא Effective או Usable. חישבנו לפי Effective, כלומר אחרי דחיסה.",
          "Capacity type not given. We assumed effective (after data reduction).")
    if need["type"] == "effective":
        Q(f"הקיבולת האפקטיבית מניחה דחיסה של כ-{RULES['effectivePerUsable']}:1 ותלויה בסוג המידע. כדאי לבדוק מה סוג המידע אצל הלקוח (מסדי נתונים, VM, קבצים, מידע מוצפן).",
          f"Effective capacity assumes ~{RULES['effectivePerUsable']}:1 data reduction and depends on the data type.")
    if n["speed"] == "unsure" and conn["fcPorts"]:
        Q("לוודא שמהירות 32Gb FC מתאימה ללקוח.", "Confirm 32Gb FC suits the customer.")
    if not n["fcPorts"] and conn["fcPorts"]:
        Q(f"לא צוין מספר פורטי FC. הנחנו {conn['fcPorts']}.",
          f"No FC port count given. We assumed {conn['fcPorts']}.")
    if ctx.get("hasOpportunity") is False:
        Q("מה מספר ההזדמנות (Opportunity, מתחיל ב-006) ברישום העסקה מול IBM? בלעדיו ePricer לא נותן מחיר Value Seller.",
          "What is the IBM opportunity ID (starts with 006)? ePricer cannot price without it.")

    if drives["count"] == 2:
        out["notes"].append(H(
            "2 כוננים בתצורת שיקוף (DRAID1). מתאים לנפח קטן. להרחבה עתידית עדיף 6 כוננים ומעלה.",
            "2 drives mirrored (DRAID1); 6+ drives preferred for future growth.",
        ))
    if drives["count"] < model["slots"]:
        out["notes"].append(H(
            f"נשארים {model['slots'] - drives['count']} מפרצים פנויים להרחבה עתידית.",
            f"{model['slots'] - drives['count']} free slots for growth.",
        ))

    if drives["effective"] > RULES["reviewAboveEffTB"] or \
       (need["type"] == "effective" and n["cap"] > RULES["reviewAboveEffTB"]):
        out["route"] = "review"
        out["reasons"].append(H(
            "בקשה גדולה: הצוות שלנו בודק את התצורה לפני שהיא יוצאת.",
            "Large request: our team reviews it before it goes out.",
        ))
    if out["verify"] and out["route"] == "auto":
        out["route"] = "review"
        out["reasons"].append(H(
            "יש נתונים בתצורה שצריך לאמת ב-e-config.",
            "Some configuration details need e-config verification.",
        ))

    ec_label = f"Expert Care {'Basic' if n['ecLevel'] == 'Basic' else 'Adv'} {n['ecYears']}Y"
    drive_label = f"{drives['count']}x{drives['size']}TB FCM"
    base_name = f"{model['key']} - {drive_label} - {conn['label']} - {ec_label}"
    who_parts = [ctx.get("reseller"), ctx.get("endCustomer")]
    who = " ".join(p for p in who_parts if p).strip()

    out["recommendation"] = {
        "model": model["name"], "mtm": model["mtm"],
        "drives": {"count": drives["count"], "sizeTB": drives["size"],
                   "bundle": bundle["feature"] if bundle else None},
        "capacityTB": {
            "raw": drives["raw"], "usable": drives["usable"],
            "effectiveEstimate": drives["effective"], "effectiveSource": drives["effSource"],
            "basis": need["type"], "requested": n["cap"],
        },
        "connectivity": conn["label"], "fcPorts": conn["fcPorts"],
        "expertCare": {"years": n["ecYears"], "level": n["ecLevel"]},
        "san": san, "storageAssurance": n["storageAssurance"],
    }

    ec_lines = ec_no_bundle if ec_no_bundle else [
        {"feature": ec_feature, "qty": 1, "he": f"Expert Care {n['ecLevel']} ל-{n['ecYears']} שנים"}
    ]

    econfig_name = (who + " - " if who else "") + base_name
    out["econfig"] = {
        "name": econfig_name,
        "brand": "Storage Subsystem Products",
        "ceid": "Blues Distribution Ltd - IL",
        "geography": "EMEA",
        "country": "Israel",
        "product": {"mtm": model["mtm"], "name": model["name"], "qty": 1},
        "mode": "custom",
        "lines": drive_lines + conn["lines"] + ec_lines + [
            {"feature": RULES["shipping"]["feature"], "qty": 1, "he": RULES["shipping"]["he"]}
        ],
        "settings": {
            "mediaRetention": False,
            "includeFcCables": bool(conn["fcPorts"] and n["cables"]),
            "keepSan24b7": bool(san),
            "remove5608PC2": True,
            "keepSupportLine": True,
        },
        "verify": [v["he"] for v in out["verify"]],
        "nameAscii": None,
    }
    out["econfig"]["nameAscii"] = _ascii_name(out["econfig"]["name"], base_name)

    return _finish(out, ctx)


# ── ADK @tool wrapper ─────────────────────────────────────────────────────────

def _public_for_lang(public: dict, lang: str) -> dict:
    """Return a copy of the public block with all bilingual dicts resolved to `lang`."""
    if not public:
        return public

    def pick(val):
        if isinstance(val, dict) and "he" in val and "en" in val:
            return val[lang]
        return val

    result = {}
    for key, val in public.items():
        if isinstance(val, list):
            result[key] = [pick(item) for item in val]
        else:
            result[key] = pick(val)
    return result


# FSI / PDI Unicode bidi-isolation marks
_FSI = "\u2068"
_PDI = "\u2069"

# A "run" is a maximal sequence of ASCII letters, digits, and the punctuation
# chars commonly found in storage spec strings, that contains at least one
# Latin letter or digit.
import re as _re
_LTR_RUN = _re.compile(r"[A-Za-z0-9.,:/×x+\-()~ ]+")


def _isolate_ltr(text: str) -> str:
    """Wrap every LTR run in FSI…PDI bidi-isolation marks (Hebrew output only).

    A run is a maximal sequence of [A-Za-z0-9.,:/×x+\\-()~ ] chars that
    contains at least one Latin letter or digit. Leading/trailing spaces of the
    run are trimmed outside the marks so Hebrew text stays flush.
    """
    def _replace(m: "_re.Match") -> str:
        run = m.group(0)
        alnum = [i for i, ch in enumerate(run) if ch.isascii() and ch.isalnum()]
        if not alnum:
            return run  # pure punctuation / spaces — leave alone
        a, b = alnum[0], alnum[-1] + 1
        # keep a bracket pair together; everything else (":", "-", spaces) stays outside
        if run[a:b].count("(") > run[a:b].count(")") and b < len(run) and run[b] == ")":
            b += 1
        if run[a:b].count(")") > run[a:b].count("(") and a > 0 and run[a - 1] == "(":
            a -= 1
        return run[:a] + _FSI + run[a:b] + _PDI + run[b:]

    return _LTR_RUN.sub(_replace, text)


@tool(permission=ToolPermission.READ_ONLY)
def size_flashsystem(spec: dict, ctx: dict, lang: str = "en") -> dict:
    """Size an IBM FlashSystem configuration based on a partial specification.

    Calls the Blues sizing engine and returns a complete configuration
    recommendation, e-config line list, and public summary.
    Never invents feature codes — all codes come from the verified engine tables.
    Never returns prices.

    Spec fields (all optional — provide what the reseller has shared so far):
        cap        (number)  Required capacity in TB, e.g. 40
        capType    (str)     "effective" | "usable" | "raw" | "unsure"
        conn       (str|list) "iscsi25" | "fc32" | "fc64" | "onboard", or list of these
        speed      (str)     "fc32" | "fc64" | "iscsi25" | "onboard" | "unsure"
        fcPorts    (number)  Number of FC ports, e.g. 8
        sanSw      (str)     "has" | "need" | "direct" | "unsure"
        ec         (int)     Expert Care years: 3 or 5
        ecLevel    (str)     "Basic" | "Advanced"
        model      (str)     "FS5600" | "FS7600" (omit for auto-select)
        tier       (str)     "entry" | "mid" | "high" | "auto"
        txType     (str)     "sfp28" | "sfp10" | "rj45" | "none"
        cables     (bool)    Include FC OM3 cables (default True)
        sa         (int)     Storage Assurance: 1, 2, or 0/False

    Context fields (ctx):
        reseller       (str)  Reseller company name (for e-config name)
        endCustomer    (str)  End-customer name (for e-config name)
        hasOpportunity (bool) Whether IBM opportunity ID is already registered

    Returns:
        dict: Full result with keys: engine, version, family, route, reasons,
              questions, notes, verify, input, recommendation, econfig, public,
              display.
              Use result["display"] to show the reseller a ready-to-display
              Markdown string in the requested language — show it verbatim.
              Use result["public"] for structured access to individual fields.
              Use result["questions"] to find the next clarifying question.
              Never show result["econfig"], result["verify"], or any price to the reseller.

    Args:
        spec (dict): Partial or complete sizing specification (see fields above).
        ctx (dict): Context about the reseller and deal (see fields above).
        lang (str): The language of the user's LATEST message: 'he' if it contains
            Hebrew letters, else 'en'. Controls the language of public.headline,
            public.lines, public.disclaimer, public.questions, and display.
            Default 'en'.
    Returns:
        dict: Complete sizing result from the Blues engine.
    """
    resolved_lang = lang if lang in ("he", "en") else "en"
    result = size(spec, ctx)
    result["public"] = _public_for_lang(result.get("public"), resolved_lang)
    result["display"] = _build_display(result, resolved_lang)
    return result


def _build_display(result: dict, lang: str) -> str:
    """Build a ready-to-show Markdown string from the sizing result.

    Format:
        **<headline>**
        - <line 1>
        - <line 2>
        ...
        <disclaimer>

        <closing question>

    For Hebrew output every LTR run is wrapped in FSI…PDI bidi-isolation marks.
    """
    pub   = result.get("public") or {}
    route = result.get("route", "auto")

    headline    = pub.get("headline", "")
    lines       = pub.get("lines", []) or []
    disclaimer  = pub.get("disclaimer", "")
    # The assumption about effective capacity may appear once as a plain line
    # if it is present in public.questions as a statement (no "?").
    questions   = pub.get("questions", []) or []
    # Only the compression assumption qualifies; other engine notes (for example the
    # opportunity / ePricer note) are internal and must never reach the reseller.
    assumption  = next((q for q in questions
                        if q and not q.rstrip().endswith("?")
                        and ("דחיס" in q or "compress" in q.lower())
                        and "epricer" not in q.lower()), None)

    if lang == "he":
        if route in ("review", "custom"):
            review_note = "הבקשה תעבור לבדיקה של צוות בלוז לפני הצעת מחיר."
            closing = (
                review_note + "\n"
                "יש לכם מספר הזדמנות ב-\u2068IBM\u2069 (\u2068מתחיל ב-006\u2069)? "
                "אם כן, כתבו אותו. אם לא, כתבו \"\u2068שלח\u2069\" ואעביר את הבקשה לצוות של בלוז."
            )
        else:
            closing = (
                "יש לכם מספר הזדמנות ב-\u2068IBM\u2069 (\u2068מתחיל ב-006\u2069)? "
                "אם כן, כתבו אותו. אם לא, כתבו \"\u2068שלח\u2069\" ואעביר את הבקשה לצוות של בלוז."
            )
        iso = _isolate_ltr
    else:
        if route in ("review", "custom"):
            review_note = "The Blues team will review this request before quoting."
            closing = (
                review_note + "\n"
                'Do you have an IBM opportunity ID (starts with 006)? '
                'If so, type it. If not, type "send" and I will pass the request to the Blues team.'
            )
        else:
            closing = (
                'Do you have an IBM opportunity ID (starts with 006)? '
                'If so, type it. If not, type "send" and I will pass the request to the Blues team.'
            )
        iso = lambda s: s  # noqa: E731

    parts = [f"**{iso(headline)}**", ""]
    for line in lines:
        parts.append(f"- {iso(line)}")
    parts.append("")  # blank line ends the list, so the notes below are not glued to the last bullet
    if assumption:
        parts.append(iso(assumption))
        parts.append("")
    parts.append(iso(disclaimer))
    parts.append("")
    parts.append(iso(closing))
    return "\n".join(parts)
