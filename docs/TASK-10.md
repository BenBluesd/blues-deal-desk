# Task 10: internal team agent, from a reseller email to a priced draft (small)

Read `orchestrate/tools/sizer.py` (the wrapper part only), `orchestrate/tools/submit_request.py`, `agent/price.js` and `data/mock-pricelist.json`.

Same rules as before:
- The ported engine stays untouched (parity 44/44).
- Invented data only.
- No new packages and no keys.
- Build directly. Bobcoins are limited.

## Why
The Blues sales team gets reseller emails all day. The team wants an **internal agent**: paste a reseller's email and get back a ready summary, a configuration with an alternative, MOCK pricing on request, and a draft reply when information is missing.

The model (GPT-OSS 120B) is weak with long instructions. **All calculations, prices and confirmations live in the tools.**

## A. New file `orchestrate/tools/internal_tools.py` with three tools

### 1. `analyze_request(spec: dict, reseller: str, end_customer: str = "", quotes: list = [], lang: str = "he") -> dict`
- `spec` uses the same fields as `size_flashsystem`. The model fills only fields the email states explicitly. `quotes` holds the exact sentences from the email that support each field, at most 6.
- The tool runs the engine **twice**:
  1. on the spec;
  2. for an **alternative**: the next model up (FS5600 → FS7600) with the same capacity, or, if the main option is already the 7600, the same model with the next drive size.
- It returns `{ok, reseller, end_customer, main, alternative, missing, assumptions, quotes, display, draft_email}`.
  - `main` and `alternative` each hold: `model`, `mtm`, `summary_line`, and `items` (a list of `{code, qty, desc}` taken from the engine result).
  - `missing` lists required fields that are not in `spec`: capacity, connectivity, SAN switches (FC only), Expert Care years and Expert Care level. The labels are fixed Hebrew labels.
  - `assumptions` contains the engine's statements without "?", **excluding any line that contains "ePricer" or "Value Seller"**.
  - `draft_email` is non-empty only when `missing` is not empty. It is a short Hebrew email to the reseller. It opens with "היי <reseller>,", has one bullet per missing item, and ends with "תודה, צוות בלוז".
  - `display` is Markdown in Hebrew, built from all of the above, with these fixed headings, in this order:
    1. **לקוח ומשווק**
    2. **תצורה מוצעת**
    3. **חלופה**
    4. **פריטים**
    5. **ציטוטים מהמייל**
    6. **הנחות**
    7. **מה חסר**
    8. **טיוטת מייל למשווק** (only when something is missing)
    9. As the last line: "לשלוח לתמחור? (כן / לא)"
  - Usable capacity is labelled "לפני דחיסה". Apply `_isolate_ltr` in Hebrew.
- **The reseller is the company the email came from** (the sender), not the end customer. The YAML says this. The tool returns `ok:false` with a message if `reseller` is empty.

### 2. `price_quote(spec: dict, user_confirmation: str, margin_pct: float = 8, lang: str = "he") -> dict`
- **The confirmation is checked inside the tool**, with the same rule as the website agent: an explicit "כן", "yes", "מאשר" or "ok", and no "לא" or "no" as a separate word. If it fails, the tool returns `ok:false` and `display`: "צריך אישור מפורש לפני תמחור. לשלוח לתמחור? (כן / לא)".
- Prices come **only** from `data/mock-pricelist.json`. Use the same lookups as `agent/price.js`, ported to Python inside this file. The tool reads the JSON from a copy at `orchestrate/tools/data/mock-pricelist.json`, which this task creates by copying the file. Add a test that checks the two files are identical.
- Margin: `margin_pct` defaults to 8, and is allowed only between 0 and 40.
- It returns `{ok, lines, cost_total, margin_pct, sell_total, label, display}`.
  - `display` is a Markdown table with the fixed Hebrew columns "פריט", "קוד", "כמות", "מחיר רשימה" and "סה\"כ".
  - After the table come three fixed lines:
    - "סה\"כ עלות: …"
    - "מרווח: 8%"
    - "מחיר מכירה מוצע: …"
  - The last line is always: "מחירי MOCK להדגמה בלבד, לא להצעה אמיתית."
  - Unknown codes are listed under "לבדוק ב-e-config" with no price, and are not added to the total.
- Currency is USD, rounded to whole dollars.

### 3. Reuse `submit_request` as is, to place the request on the desk after pricing. Do not change it.

## B. New agent `orchestrate/agents/blues_quote_desk_internal.yaml`
- Same LLM. Tools: `analyze_request`, `price_quote` and `submit_request`.
- The instructions start with **numbered binding rules**, no more than 8:
  1. Hebrew by default. English only if the user writes in English.
  2. When the user pastes an email, call `analyze_request` once, with only explicit fields. The reseller is the sender's company. Never invent names. If no sender company is clear, ask: "מאיזו חברה המייל?"
  3. Show each tool's `display` exactly as returned. No rewording.
  4. Never state a price yourself. Prices come only from `price_quote`.
  5. Call `price_quote` only after the user's reply. Pass the reply, as written, in `user_confirmation`.
  6. After pricing, ask "להעלות לדסק של בלוז? (כן / לא)". On "כן", call `submit_request` with the reseller, the end customer and the spec.
  7. Hebrew names: transliterate to English only for `submit_request` fields.
  8. If unsure, say so. Do not guess.
- `welcome_content`: "הדביקו מייל של משווק ואכין סיכום, תצורה וטיוטת תשובה."
- `starter_prompts`: 3 invented example emails in Hebrew. All companies are invented (for example "אלפא מחשוב", "טכנו-נט" and "גליל IT"). One of them is missing information, so that it shows the draft email.

## C. Tests: `orchestrate/tests/test_internal_tools.py`
Mock HTTP and use no network.
- `analyze_request`:
  - On a full spec it returns `main` and `alternative` with different models or different drive sizes. `missing` is empty and `draft_email` is empty.
  - On a spec without connectivity, `missing` contains the connectivity label and `draft_email` starts with "היי".
  - `assumptions` never contains "ePricer".
- `price_quote`:
  - With "כן" it returns a total equal to the sum of the lines.
  - `sell_total` = `cost_total` × 1.08, rounded.
  - "לא" and an empty string fail, with no calculation.
  - A margin of 50 is rejected.
  - The label contains "MOCK".
- The copy of the price list is identical to `data/mock-pricelist.json`.
- Run parity (44/44), all the Python tests and `npm test`.

## D. Import
- Add the new tools and agent to `orchestrate/scripts/import-all.sh`, and run it once.
- **Do not deploy Live.**

Report the Bobcoins used, then stop.
