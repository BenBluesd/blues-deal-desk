# Task 09: website customer agent (small)

Read `orchestrate/tools/sizer.py` (only `size_flashsystem`, `_public_for_lang`, `_isolate_ltr` and `_build_display`), `orchestrate/tools/submit_request.py` and `orchestrate/agents/blues_deal_desk.yaml`.

Same rules as before:
- The ported engine stays untouched, so parity stays at 44/44.
- Use invented data only.
- No new packages and no keys.
- Build directly, with no plan step. Bobcoins are limited.

## Why
Today we have one agent, for resellers. Blues also wants a **customer agent for the website**. It talks to visitors (end customers), never shows prices or part codes, and turns the visit into a lead for a salesperson.

The model in Orchestrate (GPT-OSS 120B) follows long instructions badly. **So every check and every calculation lives in the tools.** The YAML stays short.

## A. New file `orchestrate/tools/site_tools.py` with two tools

### 1. `suggest_storage(capacity_tb: float, capacity_type: str = "effective", connectivity: str = "unsure", lang: str = "he") -> dict`
- It calls the existing engine (`size` from `sizer.py`). It maps the inputs as follows:
  - `capacity_type`: one of "effective", "usable" or "raw".
  - `connectivity`: one of "fc", "iscsi" or "unsure". "unsure" means iSCSI.
  - Expert Care: 5 years Advanced.
- It returns `{ok, sentence, display}`.
  - `sentence` is **one** sentence in `lang`, built only from the model name and the capacities. For example: "מערכת IBM FlashSystem 5600 עם כ-26.4TB נטו לפני דחיסה, וכ-63TB אפקטיבי לפי הערכה."
  - **Usable capacity is always labelled "לפני דחיסה" / "before compression".**
  - **The tool returns no prices, no feature codes and no MTM.**
- `display` is `sentence`, followed by the line "רוצים שאיש מכירות של בלוז יחזור אליכם? אצטרך שם חברה, שם איש קשר, טלפון ומייל." (in English: "Would you like a Blues salesperson to contact you? I will need company name, contact name, phone and email.").
- In Hebrew, apply `_isolate_ltr`.
- Bad input (capacity ≤ 0 or above 2000) returns `ok:false` and a short message in `lang`.

### 2. `create_customer_lead(company: str, contact_name: str, phone: str, email: str, need_summary: str, visitor_confirmation: str, lang: str = "he") -> dict`
- **The confirmation is checked inside the tool.** `visitor_confirmation` must be the visitor's own latest message, as written. It passes only if it contains an explicit yes: "כן", "מאשר", "מאשרת", "yes", "confirm" or "ok", case-insensitive. It fails if it also contains "לא" or "no" as a separate word.
  - If it fails, the tool returns `ok:false` with `display` in `lang`: "לפני שאני שולח, צריך אישור מפורש. לשלוח את הפרטים לצוות של בלוז? (כן / לא)".
- Validation, with a clear message in `lang` for each problem:
  - company, contact_name and phone are required;
  - phone must have 9–12 digits after removing spaces and dashes;
  - email must be valid.
- The tool posts to the same demo API as `submit_request` (`BLUES_API_URL`, POST, JSON):
  - `reseller` = company
  - `email`
  - `endCustomer` = contact_name
  - `summary` = `"[website lead] " + need_summary + " | phone: " + phone`
  - `spec` = `{"cap": 0, "source": "site"}`
  - `lang`
  - Do not change the website or the API.
- On success it returns `{ok:true, ref, display}`. `display` is "תודה! הפנייה נשלחה לצוות של בלוז. מספר הפנייה: <ref>. איש מכירות יחזור אליכם." (with an English version). Apply `_isolate_ltr` in Hebrew.
- Hebrew names stay as written. Never invent a name.

## B. New agent `orchestrate/agents/blues_site_advisor.yaml`
- Same LLM as `blues_deal_desk`. Tools: `suggest_storage` and `create_customer_lead`.
- The instructions start with **numbered binding rules**, no more than 8:
  1. Reply in the language of the visitor's latest message.
  2. Never show a price, feature code or MTM. If asked about price, say exactly: "המחיר נקבע בהצעה של איש מכירות מבלוז." / "Pricing comes in a quote from a Blues salesperson."
  3. Show each tool's `display` exactly as returned.
  4. Ask for company name, contact name, phone and email, one at a time. **Never invent or guess a name. Always ask for the contact name explicitly.**
  5. Before `create_customer_lead`, ask "לשלוח את הפרטים לצוות של בלוז? (כן / לא)", and pass the visitor's reply, as written, in `visitor_confirmation`.
  6. Use the fixed answers below. Do not improvise other facts.
  7. If the visitor does not know the capacity, ask "בערך כמה נפח אחסון אתם צריכים היום, בטרה?"
  8. Topics other than IBM storage: answer politely that you only help with IBM FlashSystem storage.
- Fixed answers, short:
  - Who are you? "העוזר הדיגיטלי של בלוז הפצה, מפיצת IBM בישראל."
  - Delivery time? "איש המכירות יעדכן לפי המלאי וההזמנה."
  - Installation? "בלוז עובדת עם משווקים שמתקינים ומלווים את הפרויקט."
- `welcome_content`: one Hebrew line and one English line.
- `starter_prompts`: 4, all in Hebrew:
  - "צריך אחסון של 20 טרה למשרד"
  - "מה ההבדל בין נפח נטו לאפקטיבי?"
  - "אני רוצה שיחזרו אליי"
  - "יש לכם משהו מהיר למסדי נתונים?"

## C. Tests: `orchestrate/tests/test_site_tools.py`
Mock HTTP and use no network.
- `suggest_storage` returns one sentence. It has no digits followed by "$", none of the codes ADK, ADS, AL, AC, AH, and no "5127". It contains "לפני דחיסה" in Hebrew.
- The confirmation check:
  - "כן, תשלחו" passes, and so does "yes please".
  - "לא" fails, and so do "אולי" and an empty string.
  - When it fails, no HTTP call is made.
- A bad phone and a bad email are each rejected without an HTTP call.
- On success, `display` contains the ref, and the payload has `endCustomer` = contact_name and `summary` that starts with "[website lead]".
- Run the parity tests (44/44), all the Python tests and `npm test`.

## D. Import
- Add the new tools and agent to `orchestrate/scripts/import-all.sh`. Keep the existing ones.
- Run it once.
- **Do not deploy a Live version.** The team tests in Draft Preview first.

Report the Bobcoins used, then stop.
