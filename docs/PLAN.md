# Blues Deal Desk – Plan

_Drafted by IBM Bob · awaiting team approval before any application code is written._

---

## 1. Solution summary

Blues Deal Desk wraps Blues' existing production sizing engine (`reference/sizer.js`) in an AI intake layer so that a reseller can describe a storage need in plain Hebrew or English, and the system turns that description into a complete, validated IBM FlashSystem configuration within minutes—24/7, with no salesperson required for the first pass. The agent handles the language: understanding the request, asking only the questions that are genuinely missing, and composing a clear answer the reseller can read without knowing IBM part numbers. The engine handles the configuration: it never invents a feature code—it only produces what `BluesSizer.size()` returns. A Blues salesperson reviews the structured spec and the e-config line list in a desk view, then approves, edits, or sends a question back. Nothing reaches IBM or the reseller without that human approval.

---

## 2. Architecture

### 2.1 Component diagram

```
Reseller (browser)          Blues Salesperson (browser)
      │                               │
      │  Hebrew / English chat        │  Desk view (spec + e-config + price)
      ▼                               ▼
┌─────────────────────────────────────────────┐
│                  web/                        │
│  - reseller chat screen  (Hebrew RTL + EN)  │
│  - salesperson desk screen                  │
└───────────────────┬─────────────────────────┘
                    │ REST / WebSocket
                    ▼
┌─────────────────────────────────────────────┐
│                agent/                        │
│  watsonx Orchestrate (primary)              │
│  – or –  local agent loop (fallback)        │
│                                             │
│  One registered tool: size_flashsystem()   │
└───────────────────┬─────────────────────────┘
                    │ HTTP POST /size  (JSON)
                    ▼
┌─────────────────────────────────────────────┐
│                engine/                       │
│  Thin Node.js wrapper around                │
│  reference/sizer.js  (no logic changes)     │
│  + unit tests (invented scenarios)          │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
        reference/sizer.js
        (BluesSizer.size — production code, untouched)
```

### 2.2 Data flow

1. Reseller types a request in the chat (Hebrew or English).
2. Agent extracts a partial spec, calls `size_flashsystem(spec)`.
3. Engine returns the full result object; agent inspects `questions` and `route`.
4. If questions remain, agent asks them one at a time in the chat.
5. Once enough information is collected, agent presents the `public` summary to the reseller (model, capacity, connectivity, support level, request ID). **No price is shown.**
6. The full result (including `econfig`, mock price, `route`, `reasons`, `verify`) is saved and surfaces in the salesperson desk view.
7. Salesperson approves → request is ready to enter IBM e-config manually. Salesperson edits or sends back → agent relays the question to the reseller.

---

## 3. Tool contract: `size_flashsystem`

### 3.1 Input (`spec` object passed to `BluesSizer.normalize`)

All fields are optional; the engine handles missing values gracefully.

| Field | Type | Description | Example values |
|---|---|---|---|
| `cap` | number | Required capacity in TB | `40` |
| `capType` | `"effective"` \| `"usable"` \| `"raw"` \| `"unsure"` | How to interpret `cap` | `"effective"` |
| `conn` | string \| string[] | Connectivity type(s) | `"iscsi25"`, `["fc32","iscsi25"]` |
| `speed` | `"fc32"` \| `"fc64"` \| `"iscsi25"` \| `"onboard"` \| `"unsure"` | Protocol / speed | `"fc32"` |
| `fcPorts` | number | Number of FC ports requested | `8` |
| `sanSw` | `"has"` \| `"need"` \| `"direct"` \| `"unsure"` | SAN switch situation | `"need"` |
| `ec` | `3` \| `5` | Expert Care duration in years | `5` |
| `ecLevel` | `"Basic"` \| `"Advanced"` | Expert Care tier | `"Advanced"` |
| `model` | `"FS5600"` \| `"FS7600"` \| `null` | Preferred model (or auto) | `null` |
| `tier` | `"entry"` \| `"mid"` \| `"high"` \| `"auto"` | Min model tier | `"auto"` |
| `txType` | `"sfp28"` \| `"sfp10"` \| `"rj45"` \| `"none"` \| `null` | Transceiver type | `"sfp28"` |
| `cables` | boolean | Include FC OM3 cables | `true` |
| `sa` | `1` \| `2` \| `false` | Storage Assurance | `false` |

Context fields passed alongside `spec`:

| Field | Type | Description |
|---|---|---|
| `reseller` | string | Invented reseller name for e-config name field |
| `endCustomer` | string | Invented end-customer name |
| `hasOpportunity` | boolean | Whether an IBM opportunity ID is known |

### 3.2 Output (`BluesSizer.size` return value)

```jsonc
{
  "engine": "blues-sizer",
  "version": "1.5.6",
  "family": "FlashSystem",
  "route": "auto" | "review" | "custom",
  "reasons": [{ "he": "...", "en": "..." }],
  "questions": [{ "he": "...", "en": "..." }],
  "notes": [{ "he": "...", "en": "..." }],
  "verify": [{ "he": "...", "en": "..." }],
  "input": { /* normalized spec */ },

  "recommendation": {
    "model": "FlashSystem 5600",
    "mtm": "5127-A20",
    "drives": { "count": 6, "sizeTB": 6.6, "bundle": "ADK9" },
    "capacityTB": {
      "raw": 39.6, "usable": 19.8, "effectiveEstimate": 45,
      "effectiveSource": "ibm-catalog", "basis": "effective", "requested": 40
    },
    "connectivity": "8x32Gb FC",
    "fcPorts": 8,
    "expertCare": { "years": 5, "level": "Advanced" },
    "san": null,
    "storageAssurance": false
  },

  "econfig": {
    "name": "Negev Data Systems - FS5600 - 6x6.6TB FCM - 8x32Gb FC - Expert Care Adv 5Y",
    "nameAscii": "...",
    "brand": "Storage Subsystem Products",
    "ceid": "Blues Distribution Ltd - IL",
    "geography": "EMEA",
    "country": "Israel",
    "product": { "mtm": "5127-A20", "name": "FlashSystem 5600", "qty": 1 },
    "mode": "custom",
    "lines": [
      { "feature": "ADK9", "qty": 1, "he": "Value Bundle: 6 כונני FCM5 של 6.6TB" },
      { "feature": "ALB9", "qty": 1, "he": "1 זוג כרטיסי FC 32Gb (8 פורטים)" },
      { "feature": "ACSR", "qty": 8, "he": "8 כבלי OM3" },
      { "feature": "ALK5", "qty": 1, "he": "Expert Care Advanced 5 שנים" },
      { "feature": "AKNC", "qty": 1, "he": "משלוח Premium" }
    ],
    "settings": { "mediaRetention": false, "includeFcCables": true, "keepSan24b7": false, "remove5608PC2": true, "keepSupportLine": true },
    "verify": []
  },

  "public": {
    "route": "auto",
    "headline": { "he": "IBM FlashSystem 5600 עם 6 כונני FCM5 של 6.6TB", "en": "IBM FlashSystem 5600 with 6 × 6.6TB FCM5" },
    "lines": [ /* human-readable capacity / connectivity / EC bullets */ ],
    "questions": [],
    "reasons": [],
    "disclaimer": { "he": "הערכה ראשונית בלבד...", "en": "Preliminary estimate only..." }
  }
}
```

The agent shows `public` to the reseller. The desk view shows the full object plus the mock price.

---

## 4. Task list

Steps are ordered so a working end-to-end demo exists as early as possible (Steps 1–5). Later steps polish, harden, and document.

> **Bobcoin cost key** — S = ~1–2 coins, M = ~3–4 coins, L = ~5–7 coins.

| # | Step | What | Cost |
|---|---|---|---|
| 1 | **Engine wrapper + tests** | `engine/index.js`: re-export `BluesSizer`; add `POST /size` Express endpoint. `engine/tests/`: 6–8 invented scenarios (routine iSCSI, FC, missing capacity, too large, Hebrew names, Basic vs Advanced). Verify all pass and the engine is untouched. | M |
| 2 | **Mock price list** | `data/mock-pricelist.json`: fake round-number prices keyed by model + drive bundle feature code. Clearly labelled `MOCK – demo only`. | S |
| 3 | **Demo requests** | `data/demo-requests.json`: 6–8 invented requests covering each scenario (routine, missing info, >500TB, FC, iSCSI, Basic, Hebrew, English). | S |
| 4 | **Agent (local fallback)** | `agent/loop.js`: a minimal Node agent loop. Parses a message, builds `spec` incrementally, calls the engine, returns follow-up questions or the final `public` summary. No watsonx dependency yet — just an LLM call (OpenAI-compatible or watsonx.ai `granite-3-8b-instruct`). | L |
| 5 | **Web – reseller chat** | `web/`: React (or plain HTML+JS) chat screen. Calls the agent. Renders `public.headline`, `public.lines`, `public.questions`. Hebrew RTL, English toggle. Shows no prices. | L |
| 6 | **Web – salesperson desk** | Desk screen: list of requests, detail panel with full spec, e-config line list, mock price, route badge, verify checklist, Approve / Edit / Ask buttons. | L |
| 7 | **watsonx Orchestrate agent** | Register `size_flashsystem` as an OpenAPI tool in Orchestrate. Replace the local loop with the Orchestrate skill. Keep local loop as fallback. | M |
| 8 | **PATH\_TO\_PRODUCTION.md** | Explain how this plugs into the live Blues website, IBM e-config, and ePricer, including the human approval gate. | S |
| 9 | **SUBMISSION.md + DEMO\_SCRIPT.md** | Problem & solution statement (≤500 words), demo script (≤3 min video outline). | S |
| 10 | **ENGINE\_NOTES.md** | Document any bugs or gaps found in `reference/sizer.js` (e.g. FS7600 feature codes marked `null`, Basic EC for non-5-year). Do not change the engine. | S |
| 11 | **Polish & rehearsal** | Accessibility pass, mobile layout, Hebrew copy review, load the demo scenarios, do a timed run-through. | M |

**Total estimated cost: ~30–35 Bobcoins** (leaving ~15 as buffer for iteration and surprises).

---

## 5. Open questions for the team

1. **watsonx Orchestrate access** — do we have an Orchestrate instance provisioned for the hackathon, or do we start with the local agent loop and upgrade later? (Affects Step 4 vs Step 7 order.)

2. **LLM choice** — for the intake parsing, prefer `granite-3-8b-instruct` on watsonx.ai (stays IBM-internal) or is an OpenAI key available as fallback? Both need a key in `.env`.

3. **FS7600 feature codes** — `reference/sizer.js` leaves connectivity and drive feature codes as `null` for the 7600 and marks it `verified: false`. Is there a correct feature-code list we can add, or do all FS7600 requests always route to `review`? (Document in `ENGINE_NOTES.md` either way—do not change the engine without approval.)

4. **Expert Care Basic for 3 years** — the engine has no feature code stored for `Basic 3Y` (only `Basic 5Y = ALJ5`). The note tells the salesperson to pick it in e-config. Is that acceptable for the demo, or do we need the code?

5. **Reseller identity in the chat** — should the chat require a login (reseller name), or is the first chat message enough to capture it? This affects how `ctx.reseller` is populated and whether we need auth.

6. **Real opportunity ID field** — the engine asks for an IBM opportunity number when `ctx.hasOpportunity === false`. In the demo, we always pass `hasOpportunity: false` so the question surfaces. Is that the right default, or should we hide this from the reseller chat entirely and show it only on the desk?

7. **Numbers for the pitch** — `BOB_BRIEF.md` has three `TBD` metrics (time per config today, share of requests missing details, off-hours requests). Ben to fill these in before `SUBMISSION.md` is drafted.

8. **Hebrew copy** — the engine already has Hebrew strings. Do we want a human to review those strings before the demo, or are they good as-is?
