# Task 02: the working demo (plan steps 4–6)

Read `docs/PLAN.md` and `docs/DECISIONS.md` first. Same rules as before: engine untouched, invented data only, no secrets in the repo, ask before installing anything other than `express`.

Status: the team IBM Cloud account (watsonx Orchestrate + watsonx.ai) was requested today and is not active yet. Everything below must run **without any key**.

## A. Server (`server.js`)

Express app that serves `web/` as static files and these endpoints:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/size` | already exists (engine) |
| POST | `/api/chat` | body `{ sessionId, message, lang }` → `{ reply, state, public?, requestId? }` |
| GET | `/api/requests` | desk list (newest first) |
| GET | `/api/requests/:id` | full record: spec, ctx, engine result, mock price, conversation, history |
| POST | `/api/requests/:id/action` | body `{ action: "approve" \| "ask" \| "edit", note?, spec? }` |

Storage: `data/requests.json` (git-ignored, create on first write). Sessions in memory.

## B. Agent (`agent/`)

- `agent/loop.js`: one function `handleTurn(session, message)`. State machine:
  1. **identify**: collect reseller company name and contact email (one question at a time).
  2. **gather**: extract spec fields from each message, merge into the session spec, call the engine every turn. Ask **one** question at a time, in this priority: capacity (and its type) → connectivity (FC / iSCSI and speed) → SAN switches (only for FC) → Expert Care years and level → engine `questions[]`. Never ask for something the user already said.
  3. **confirm**: show the engine `public` summary (headline + lines + disclaimer) and ask "submit to Blues?" Optional question once: "Do you already have an IBM opportunity ID (starts with 006)?"
  4. **submitted**: save the request, return the request ID. Reply that a Blues salesperson will get back with a price. **Never show a price to the reseller.**
- Reply in the user's language (Hebrew if the message has Hebrew letters, else English).
- `agent/extract.js`: the extractor interface `extract(message, currentSpec) → partialSpec`.
  - `agent/extract-fallback.js`: rule-based, Hebrew + English. Must handle: TB numbers (incl. "40 טרה", "40TB"); capacity type words (effective / אפקטיבי, usable / נטו / שמיש, raw / ברוטו / פיזי); FC / iSCSI and 32/64/25 Gb; number of FC ports; SAN switches (have / need / direct, יש מתגים / צריך מתגים / חיבור ישיר); 3 or 5 years; Basic / Advanced; company name and email.
  - `agent/extract-granite.js`: calls watsonx.ai Granite **only if** `WATSONX_APIKEY`, `WATSONX_PROJECT_ID` and `WATSONX_URL` exist in `.env`; model id from `WATSONX_MODEL_ID`. Asks for JSON matching the tool contract, validates it, and falls back to the rule-based extractor on any error. Add these keys (placeholders only) to `.env.example`.
- Mock price for the desk: `agent/price.js` computes from `data/mock-pricelist.json` using the engine `econfig.lines`. Missing items are listed as "not in mock list". Every price object carries the MOCK label.

## C. Web (`web/`)

Plain HTML + CSS + vanilla JS, no build step, no external CDN. Clean and professional (navy / IBM-blue accents, white cards, generous spacing). Mobile friendly.

- `web/index.html`: **reseller chat**. Hebrew RTL by default, EN toggle (switches UI text and `dir`). Chat bubbles, typing indicator, the final summary as a card, the request ID at the end. Header: "Blues Deal Desk" + "IBM FlashSystem configuration in minutes". Demo button "Load example" that picks a random message from `data/demo-requests.json` (served read-only via `/api/demo-requests`).
- `web/desk.html`: **salesperson desk**. Left: request list with route badge (auto / review / custom), reseller, time, opportunity ID flag. Right: detail panel with the structured spec, engine recommendation, e-config lines table (feature, qty, description), `verify` checklist, `notes`, the mock price with a clear **MOCK – demo only** badge, the full conversation, and buttons **Approve**, **Ask reseller** (text box), **Edit spec** (simple JSON or form, re-runs the engine).
- Banner on both pages: "Demo: invented companies and mock prices".

## D. Tests and checks

- `agent/tests/extract.test.js`: for each item in `data/demo-requests.json`, the fallback extractor on `message` must produce the key fields of `spec` (cap, capType, connectivity, ec, ecLevel where present).
- `agent/tests/loop.test.js`: one full Hebrew conversation and one English conversation from first message to submitted, without any key.
- `scripts/smoke.js`: start the app in-process on a free port, call `/api/chat` through a short conversation, then `/api/requests`, print a short report, and exit.
- Update `package.json` scripts: `start`, `test` (all tests), `smoke`.
- Update `README.md`: how to run (`npm install`, `npm start`, open `http://localhost:3000` and `/desk.html`).

Run `npm test` and `npm run smoke`, show the results, report Bobcoins used, then stop. Do not start a long-running server.
