# Task 05: real submissions on the live Blues website (hidden demo)

Read `docs/TASK-04.md` and `orchestrate/README.md` first. Same rules. Keep this task small: Bobcoins are limited (about 23 left). Plan briefly, then build.

## Why

Today the Orchestrate agent invents a reference number (for example `BLUES-2026-3F9A`) and nothing is saved. We will host a small demo API and a hidden desk page on the real Blues website (Netlify, `https://bluesd.co.il`), so a request made in the Orchestrate chat really appears on the salesperson desk. This is our "path to production" proof.

## A. Netlify function: `deploy/netlify/functions/bob-demo.mjs`

Netlify Functions v2 (ES module, `export default async (req) => Response`, `export const config = { path: ["/api/bob-demo/requests", "/api/bob-demo/requests/*"] }`), storage with `import { getStore } from "@netlify/blobs"`, store name `bob-demo-requests`.

- `POST /api/bob-demo/requests`
  - Body: `{ reseller, email, endCustomer?, spec, opportunityId?, lang, summary? }`.
  - Validate: JSON only, body under 20 KB, strings trimmed and length-limited, email format, `spec` only with the known fields of the tool contract.
  - **Re-run the engine on the server** with `spec` (import the engine from `deploy/netlify/shared/sizer.cjs`, a copy of `reference/sizer.js`). Never trust a result sent by the caller.
  - Save `{ id, ref, created, status: "new", reseller, email, endCustomer, opportunityId, lang, spec, sizing, source: "orchestrate", demo: true }`. `ref` is human-friendly, like `BD-2026-4821`.
  - Keep at most 200 records (drop the oldest). Simple rate limit: at most 20 POSTs per IP per hour (store counters in the same store under `rl:` keys).
  - Response: `{ ok: true, id, ref, route, headline }`. Never return prices.
- `GET /api/bob-demo/requests` returns a list, newest first, with `{ id, ref, created, status, reseller, endCustomer, route, headline }`.
- `GET /api/bob-demo/requests/:id` returns the full record plus a **mock price** computed with `agent/price.js` logic from `data/mock-pricelist.json` (copy what is needed into the function, labelled MOCK).
- `PATCH /api/bob-demo/requests/:id` with `{ status: "approved" | "asked", note? }` updates the status.
- CORS: allow `GET, POST, PATCH` from any origin (demo, invented data only).
- Add `deploy/README.md`: what each file is and where it goes in the Blues site.

## B. Orchestrate tool: `submit_request`

- `orchestrate/tools/submit_request.py`: ADK Python tool that POSTs to `https://bluesd.co.il/api/bob-demo/requests` and returns `{ ref, route, headline }`. Timeout 15 s, clear error message on failure. `requests` in a `requirements.txt` next to the tool if the ADK needs it.
- Update `orchestrate/agents/blues_deal_desk.yaml`:
  - On "submit", call `submit_request` and show **only the `ref` it returns**. Never invent a reference.
  - **Use what the user already said.** If the first message already contains the company, capacity, connectivity or Expert Care, do not ask for them again. Ask only what is missing.
  - **Language:** always reply in the language of the user's latest message.
- Update `orchestrate/scripts/import-all.sh` to import the new tool too. Re-import the tool and the agent, then run one short English test conversation that ends in a real submission, and append the transcript to `docs/orchestrate-test-runs.md`. (If the website endpoint is not live yet, the tool call will fail: that is expected. Record it and stop; we deploy the site separately.)

## C. Hidden desk page: `deploy/site/e/zw181wz9/index.html`

- A copy of `web/desk.html` adapted to the demo API above (list, detail, Approve, Ask). Same look. Banner: "Demo: invented companies and mock prices".
- `<meta name="robots" content="noindex,nofollow">`. No links to it from anywhere.
- Auto-refresh the list every 10 seconds, so in the demo video a new request appears live.

## D. Repo hygiene

- Add to `.gitignore`: `venv/`, `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`.

## E. Tests

- `deploy/tests/bob-demo.test.mjs`: unit tests for validation and the handler logic with an in-memory store mock (no network). Run `npm test` and the parity tests. All must pass.

Report the Bobcoins used, then stop.
