"""
orchestrate/tools/submit_request.py

ADK Python tool: submit a completed FlashSystem sizing request to the Blues
demo API (https://bluesd.co.il/api/bob-demo/requests).

Returns { ref, route, headline } on success.
Never invents a reference number — only returns what the API gave back.
"""

import requests as http_requests

from ibm_watsonx_orchestrate.agent_builder.tools import tool


BLUES_API_URL = "https://bluesd.co.il/api/bob-demo/requests"
TIMEOUT_SECONDS = 15


@tool
def submit_request(
    reseller: str,
    email: str,
    spec: dict,
    lang: str = "en",
    end_customer: str = "",
    opportunity_id: str = "",
    summary: str = "",
) -> dict:
    """Submit a completed FlashSystem sizing request to the Blues demo portal.

    Call this tool only after the user has confirmed "yes, submit to Blues".
    Never call it before confirmation. Never invent a reference number —
    always return the `ref` from this tool's response.

    Args:
        reseller: The reseller company name (required, max 200 chars).
        email: The reseller contact email address (required).
        spec: The sizing specification dict. Must contain only these fields:
            - cap       (number)  Required capacity in TB.
            - capType   (str)     "effective" | "usable" | "raw" | "unsure"
            - conn      (str|list) "iscsi25" | "fc32" | "fc64"
            - fcPorts   (int)     Number of FC ports (default 8 if FC).
            - sanSw     (str)     "has" | "need" | "direct" | "unsure"
            - ec        (int)     Expert Care years: 3 or 5.
            - ecLevel   (str)     "Basic" | "Advanced"
            - cables    (bool)    Include OM3 cables for FC (default True).
            - tier      (str)     "entry" | "mid" | "high" | "auto"
            - model     (str)     "FS5600" | "FS7600" (optional override)
            - txType    (str)     "sfp28" | "sfp10" | "rj45" | "none"
        lang: Language of the conversation: "he" (Hebrew) or "en" (English).
            Default "en". Pass the same lang used for size_flashsystem.
        end_customer: Name of the end customer. If the user named an end customer
            ANYWHERE in the conversation, you MUST pass it here (required when known).
        opportunity_id: IBM opportunity ID starting with 006 (optional).
        summary: Short text summary of the request for the salesperson (optional).

    Returns:
        dict with keys:
            - ok           (bool)  True on success.
            - ref          (str)   Human-friendly request reference, e.g. "BD-2026-4821".
                                   Show this to the user. Never invent one.
            - route        (str)   "auto" | "review" | "custom".
            - headline     (str)   Short configuration headline in the user's language.
            - end_customer (str)   Echo of the end_customer passed in (if any). Include
                                   in the confirmation message shown to the reseller.
            - error        (str)   Error message (only present on failure).
    """
    payload: dict = {
        "reseller": reseller,
        "email": email,
        "spec": spec,
        "lang": lang if lang in ("he", "en") else "en",
    }
    if end_customer:
        payload["endCustomer"] = end_customer
    if opportunity_id:
        payload["opportunityId"] = opportunity_id
    if summary:
        payload["summary"] = summary

    try:
        response = http_requests.post(
            BLUES_API_URL,
            json=payload,
            timeout=TIMEOUT_SECONDS,
            headers={"Content-Type": "application/json"},
        )
        data = response.json()
    except http_requests.exceptions.Timeout:
        return {
            "ok": False,
            "error": "The Blues portal did not respond within 15 seconds. Please try again.",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": f"Network error while submitting: {exc}",
        }

    if not response.ok or not data.get("ok"):
        err = data.get("error", f"HTTP {response.status_code}")
        return {"ok": False, "error": f"Submission failed: {err}"}

    result: dict = {
        "ok": True,
        "ref": data["ref"],
        "route": data.get("route", ""),
        "headline": data.get("headline", ""),
    }
    if end_customer:
        result["end_customer"] = end_customer
    return result
