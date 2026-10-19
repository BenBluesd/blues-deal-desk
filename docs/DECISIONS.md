# Team decisions on PLAN.md (round 1)

Plan approved. Good work. Answers to section 5, then what to do next.

## Answers to open questions

1. **watsonx Orchestrate**: we are requesting the team IBM Cloud account now. Build the local agent loop first (Step 4) with the **same tool contract**, so we can switch to Orchestrate in Step 7 without rewriting the web layer.
2. **LLM**: use **IBM Granite on watsonx.ai** (from the team IBM Cloud account). No OpenAI. Until the account is active, the agent loop must also run with a small rule-based extractor (`agent/extract-fallback.js`) so the demo never depends on a key.
3. **FS7600 feature codes**: keep the engine as is. Any FS7600 result routes to `review`. Note it in `ENGINE_NOTES.md`.
4. **Expert Care Basic 3Y**: acceptable for the demo. The desk shows the engine's note. No code change.
5. **Reseller identity**: no login in the demo. The chat starts by asking for company name and contact email (invented values in demo data). Put a "login comes in production" line in `PATH_TO_PRODUCTION.md`.
6. **Opportunity ID**: ask the reseller once, clearly optional ("if you already registered the deal with IBM"). Show it prominently on the desk. Default `hasOpportunity: false`.
7. **Pitch numbers**: Ben will supply. Leave `TBD` until then.
8. **Hebrew copy**: Ben reviews before the demo. Keep the engine strings as they are.

## Stack choices (to save Bobcoins)

- **One Node.js project**: Express server that serves the API and the static web pages. No React build step. Plain HTML + CSS + vanilla JS, Hebrew RTL first, English toggle.
- **Storage**: a JSON file (`data/requests.json`) for submitted requests. No database.
- **Repo hygiene from day one**: add `.gitignore` and `.bobignore` equivalent to the IBM hackathon template (ignore `.env`, `node_modules`, logs), `.env.example` with placeholder keys only, `README.md` with how to run, and an empty `bob_sessions/` folder with a `README.md` explaining the screenshots.

## Next task (do only this, then stop)

Steps **0–3** from the plan:

0. Project setup: `package.json`, folders, `.gitignore`, `.bobignore`, `.env.example`, `README.md`, `bob_sessions/README.md`.
1. Engine wrapper + `POST /api/size` + tests with 6–8 invented scenarios. Use `node --test` (no extra test framework). Run the tests and show the results.
2. `data/mock-pricelist.json` (fake round numbers, `"label": "MOCK – demo only"`).
3. `data/demo-requests.json`: 6–8 invented reseller requests in Hebrew and English, invented company names only.

Ask before installing anything other than `express`. Report the Bobcoins used, then stop.
