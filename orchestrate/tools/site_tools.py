"""
orchestrate/tools/site_tools.py

ADK Python tools for the Blues website customer-facing agent.
Never shows prices, feature codes, or MTMs to the visitor.
"""

import re

import requests as http_requests

from ibm_watsonx_orchestrate.agent_builder.tools import tool

try:
    from tools.sizer import size, _isolate_ltr
except ImportError:
    from sizer import size, _isolate_ltr  # type: ignore[no-redef]

BLUES_API_URL = "https://bluesd.co.il/api/bob-demo/requests"
TIMEOUT_SECONDS = 15

_DIGITS_RE = re.compile(r"\d+")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# A standalone "לא" or "no" (not part of a larger word) means refusal
_NO_WORD_RE = re.compile(r"(?<!\w)(לא|no)(?!\w)", re.IGNORECASE)
# Explicit yes words
_YES_RE = re.compile(r"(?<!\w)(כן|מאשר|מאשרת|yes|confirm|ok)(?!\w)", re.IGNORECASE)


def _confirm_check(visitor_confirmation: str) -> bool:
    """Return True only if the string contains an explicit yes and no explicit no."""
    text = visitor_confirmation.strip()
    if not _YES_RE.search(text):
        return False
    if _NO_WORD_RE.search(text):
        return False
    return True


@tool
def suggest_storage(
    capacity_tb: float,
    capacity_type: str = "effective",
    connectivity: str = "unsure",
    lang: str = "he",
) -> dict:
    """Suggest an IBM FlashSystem model for a website visitor based on their capacity need.

    Never returns a price, feature code, or MTM.

    Args:
        capacity_tb: Required storage capacity in terabytes (e.g. 20).
        capacity_type: One of "effective", "usable", or "raw". Default "effective".
        connectivity: One of "fc", "iscsi", or "unsure". "unsure" maps to iSCSI.
        lang: Language for the reply: "he" (Hebrew) or "en" (English). Default "he".

    Returns:
        dict with keys:
            - ok      (bool)    True on success.
            - sentence (str)    One sentence describing the recommended model and capacities.
            - display  (str)    sentence followed by a call-to-action asking for contact details.
            - error    (str)    Error message (only present when ok=False).
    """
    resolved_lang = lang if lang in ("he", "en") else "he"

    if capacity_tb <= 0 or capacity_tb > 2000:
        if resolved_lang == "he":
            msg = "נפח האחסון חייב להיות בין 0.1 ל-2000 טרה."
        else:
            msg = "Capacity must be between 0.1 TB and 2000 TB."
        return {"ok": False, "error": msg}

    # Map connectivity to spec value
    conn_map = {"fc": "fc32", "iscsi": "iscsi25", "unsure": "iscsi25"}
    conn_val = conn_map.get(connectivity, "iscsi25")

    # Map capacity_type
    cap_type_map = {"effective": "effective", "usable": "usable", "raw": "raw"}
    cap_type_val = cap_type_map.get(capacity_type, "effective")

    spec = {
        "cap": capacity_tb,
        "capType": cap_type_val,
        "conn": conn_val,
        "ec": 5,
        "ecLevel": "Advanced",
    }
    result = size(spec)

    rec = result.get("recommendation") or {}
    model_name = rec.get("model", "FlashSystem")
    cap_info = rec.get("capacityTB") or {}
    usable_tb = cap_info.get("usable")
    effective_tb = cap_info.get("effective")

    def _fmt(v):
        return str(round(float(v), 1))

    if resolved_lang == "he":
        usable_part = f"כ-{_fmt(usable_tb)}TB נטו לפני דחיסה" if usable_tb is not None else ""
        eff_part = f", וכ-{_fmt(effective_tb)}TB אפקטיבי לפי הערכה" if effective_tb is not None else ""
        sentence = _isolate_ltr(f"מערכת IBM {model_name} עם {usable_part}{eff_part}.")
        cta = "רוצים שאיש מכירות של בלוז יחזור אליכם? אצטרך שם חברה, שם איש קשר, טלפון ומייל."
        display = sentence + "\n" + cta
    else:
        usable_part = f"approximately {_fmt(usable_tb)} TB usable (before compression)" if usable_tb is not None else ""
        eff_part = f" and approximately {_fmt(effective_tb)} TB effective (estimated)" if effective_tb is not None else ""
        sentence = f"IBM {model_name} with {usable_part}{eff_part}."
        cta = "Would you like a Blues salesperson to contact you? I will need company name, contact name, phone and email."
        display = sentence + "\n" + cta

    return {"ok": True, "sentence": sentence, "display": display}


@tool
def create_customer_lead(
    company: str,
    contact_name: str,
    phone: str,
    email: str,
    need_summary: str,
    visitor_confirmation: str,
    capacity_tb: float = 0,
    lang: str = "he",
) -> dict:
    """Create a website lead and post it to the Blues demo portal.

    The visitor_confirmation must be the visitor's own latest message. The tool
    checks for an explicit yes before submitting. Never invents a reference number.

    Args:
        company: Visitor's company name (required).
        contact_name: Visitor's contact name (required). Never invented by the agent.
        phone: Contact phone number (required, 9-12 digits after removing spaces/dashes).
        email: Contact email address (required, valid format).
        need_summary: Short description of the storage need.
        visitor_confirmation: The visitor's latest message, copied verbatim.
        capacity_tb: Capacity in TB from suggest_storage, if available. Default 0.
        lang: "he" or "en". Default "he".

    Returns:
        dict with keys:
            - ok      (bool)   True on success.
            - ref     (str)    Reference number from the Blues portal (success only).
            - display (str)    Ready-to-show message in the visitor's language.
    """
    resolved_lang = lang if lang in ("he", "en") else "he"

    def _err(msg):
        return {"ok": False, "display": msg}

    # 1. Confirmation check
    if not _confirm_check(visitor_confirmation):
        if resolved_lang == "he":
            msg = "לפני שאני שולח, צריך אישור מפורש. לשלוח את הפרטים לצוות של בלוז? (כן / לא)"
        else:
            msg = "Before I submit, I need an explicit confirmation. Shall I send your details to the Blues team? (yes / no)"
        return _err(msg)

    # 2. Required fields
    if not company or not company.strip():
        return _err("שם חברה חסר." if resolved_lang == "he" else "Company name is required.")
    if not contact_name or not contact_name.strip():
        return _err("שם איש קשר חסר." if resolved_lang == "he" else "Contact name is required.")
    if not phone or not phone.strip():
        return _err("מספר טלפון חסר." if resolved_lang == "he" else "Phone number is required.")

    # 3. Phone validation: 9-12 digits after removing spaces/dashes
    digits = "".join(_DIGITS_RE.findall(phone))
    if not (9 <= len(digits) <= 12):
        return _err(
            "מספר הטלפון אינו תקין (נדרשות 9–12 ספרות)." if resolved_lang == "he"
            else "Phone number must contain 9–12 digits."
        )

    # 4. Email validation
    if not email or not _EMAIL_RE.match(email.strip()):
        return _err(
            "כתובת המייל אינה תקינה." if resolved_lang == "he"
            else "Email address is not valid."
        )

    payload = {
        "reseller": company,
        "email": email.strip(),
        "endCustomer": contact_name,
        "summary": "[website lead] " + need_summary + " | phone: " + phone,
        "spec": {"cap": capacity_tb, "capType": "effective"},
        "lang": resolved_lang,
    }

    try:
        response = http_requests.post(
            BLUES_API_URL,
            json=payload,
            timeout=TIMEOUT_SECONDS,
            headers={"Content-Type": "application/json"},
        )
        data = response.json()
    except http_requests.exceptions.Timeout:
        return _err(
            "שרת בלוז לא הגיב בזמן. אנסה שוב בעוד רגע." if resolved_lang == "he"
            else "The Blues portal did not respond in time. Please try again."
        )
    except Exception as exc:  # noqa: BLE001
        return _err(
            f"שגיאת רשת בעת השליחה: {exc}" if resolved_lang == "he"
            else f"Network error while submitting: {exc}"
        )

    if not response.ok or not data.get("ok"):
        err = data.get("error", f"HTTP {response.status_code}")
        return _err(
            f"השליחה נכשלה: {err}" if resolved_lang == "he"
            else f"Submission failed: {err}"
        )

    ref = data["ref"]
    if resolved_lang == "he":
        display = _isolate_ltr(
            f"תודה! הפנייה נשלחה לצוות של בלוז. מספר הפנייה: {ref}. איש מכירות יחזור אליכם."
        )
    else:
        display = f"Thank you! Your enquiry was sent to the Blues team. Reference: {ref}. A salesperson will get back to you."

    return {"ok": True, "ref": ref, "display": display}
