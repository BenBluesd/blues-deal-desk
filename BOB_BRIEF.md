# Brief for IBM Bob: Blues Deal Desk

Team: **Blues Distribution**. Hackathon: *From <bob> to Business Impact* (IBM Israel). Submissions close **2 Nov 2026, 22:00**.
Read this whole file before doing anything. It is the source of truth for scope and rules.

---

## 1. The business problem (why this matters)

Blues Distribution is Israel's largest official IBM distributor. It sells IBM storage and servers **through resellers and integrators** (and in the future also to end customers directly).

At IBM, **the first partner to register a deal gets the best price**. Speed is money.

Today, when a reseller needs an IBM FlashSystem for a customer:
1. The reseller sends a loose request ("~40TB, iSCSI, 5 years support") by email or WhatsApp.
2. A Blues salesperson translates it by hand into an exact IBM configuration in IBM e-config (models, drives, adapters, transceivers, Expert Care codes), then prices it in IBM ePricer.
3. Missing details mean back-and-forth. Requests that arrive in the evening, on weekends or holidays wait for the next workday.

Pain: slow first answer, errors in feature codes, resellers going to the distributor that answers first, and senior people spending hours on routine configurations.

> Numbers for the pitch (Ben fills these in, do not invent them): time per routine configuration today: `TBD`; share of requests missing details: `TBD`; requests arriving off-hours: `TBD`.

## 2. The solution

**Blues Deal Desk**: an AI agent that turns a reseller's free-text request (Hebrew or English) into a validated IBM FlashSystem configuration in minutes, 24/7, with a human approving before anything goes to IBM or to the reseller.

Two users:
- **Reseller** (chat): describes the need in plain words. The agent asks only the questions that are really missing, then shows a clear recommendation (model, capacity, connectivity, support) and a request ID. **The reseller never sees a price.**
- **Blues salesperson** (desk view): sees each request with the agent's structured spec, the recommended configuration, the exact e-config feature lines, a "verify in e-config" checklist, a route (`auto` = routine / `review` = needs a human), and an indicative price from a **mock** price list. One click to approve, edit or send back with a question.

Why it is different: the AI does the language part (understanding, asking, explaining), and a **deterministic rules engine** does the configuration part (it never invents a feature code). Every recommendation is explainable and checkable.

## 3. What already exists (use it)

`reference/sizer.js` is Blues' existing sizing engine (plain JavaScript, no dependencies, runs in Node and in the browser). It already works in production on the Blues website.
- Entry point: `BluesSizer.size(spec, ctx)` returns `{ recommendation, econfig, route, reasons, questions, notes, verify, public }`.
- Also exports `normalize`, `usableOf`, `quickKey`, `MODELS`, `RULES`, `TX`, `EC_LEVELS`.
- Scope today: FlashSystem 5600 and 7600 only, Expert Care Basic or Advanced only.
- The spec shape is whatever `normalize()` accepts: read the code to learn the fields (capacity + type, connectivity, speed, FC ports, Expert Care, SAN switches, preferred model, transceivers).

**Treat `reference/sizer.js` as the tool the agent calls.** Wrap it, test it, do not rewrite its rules. If you find a bug, write it up in `docs/ENGINE_NOTES.md` instead of silently changing behaviour.

## 4. Hard rules (non-negotiable)

1. **No real client data.** No real reseller or end-customer names, no real quotes, no personal data, no data from social media. Use invented companies only (e.g. "Negev Data Systems", "Carmel IT Integrators").
2. **No real prices.** Any price shown is from `data/mock-pricelist.json`, which you create with clearly fake round numbers and the label `MOCK – demo only` on every screen that shows it.
3. **No secrets in the repo.** API keys only in `.env` (git-ignored). Use the IBM hackathon repository template (`.gitignore` and `.bobignore`). Check before every commit.
4. **Public repo.** Everything committed will be public. Write code and comments in English.
5. **Bobcoins are limited (about 50 per person).** Plan before you build, keep tasks focused, do not regenerate large files without need, and tell us when a step will be expensive.
6. **Human in the loop.** The agent never sends anything to IBM or to a reseller on its own. It prepares; a person approves.

## 5. Suggested architecture (challenge it if you have a better idea)

- `engine/` – thin wrapper around `reference/sizer.js` + unit tests with invented scenarios.
- `agent/` – the intake agent. Preferred: **watsonx Orchestrate** agent with one tool `size_flashsystem(spec)` that calls the engine (exposed as a small HTTP/OpenAPI or MCP tool). Fallback if Orchestrate is not ready yet: a local agent loop with the same tool contract, so we can swap later.
- `web/` – two simple screens: reseller chat and salesperson desk. Clean, fast, Hebrew RTL support with an English toggle.
- `data/` – mock price list and 6–8 invented demo requests (routine, missing info, too big for 5600, FC vs iSCSI, Basic vs Advanced, Hebrew and English).
- `docs/` – plan, architecture diagram, path to production, demo script.
- `bob_sessions/` – screenshots of Bob task session summaries (required for judging).

## 6. Judging (20 points, 5 each) and how we score

| Criterion | How we win it |
|---|---|
| Completeness & feasibility | End-to-end demo that really runs; engine already in production |
| Creativity & innovation | AI for language + deterministic engine for correctness; asks only what is missing |
| Design & usability | Reseller gets an answer in under 2 minutes, in Hebrew; desk view needs no training |
| Effectiveness & efficiency | Measurable: minutes per request instead of hours, 24/7 first response, fewer code errors; scales to Power servers, SAN and more IBM lines |

Also required: "Show us the path to production." `docs/PATH_TO_PRODUCTION.md` must explain how this plugs into the live Blues website, e-config and ePricer, with a human approval step.

## 7. Deliverables we must submit

- Public repo with code + `bob_sessions/` screenshots.
- Problem & solution statement (max 500 words) – draft it in `docs/SUBMISSION.md`.
- Optional but planned: tech statement (how we used Bob and watsonx Orchestrate) and a demo video of up to 3 minutes (`docs/DEMO_SCRIPT.md`).

## 8. Your first task (do only this, then stop)

1. Read this file and `reference/sizer.js`.
2. Write `docs/PLAN.md` with:
   - a one-paragraph summary of the solution in your own words,
   - the architecture (with a simple diagram),
   - the tool contract between the agent and the engine (input and output JSON),
   - a task list split into small steps, each with an estimated Bobcoin cost, ordered so that we have a working demo as early as possible,
   - open questions for the team.
3. Do **not** write application code yet. Stop and wait for our approval of the plan.
