# Blues Deal Desk

AI-assisted IBM FlashSystem sizing and deal desk for Blues Distribution.

## What it does

A reseller describes a storage need in plain Hebrew or English. The AI agent turns that into a complete, validated IBM FlashSystem configuration in minutes, 24/7. A Blues salesperson reviews and approves before anything is sent to IBM or the reseller.

## Prerequisites

- Node.js ≥ 18

## Quick start

```bash
cp .env.example .env   # optional: fill in watsonx.ai credentials for Granite extraction
npm install
npm start              # starts the server on http://localhost:3000
```

Open:
- **Reseller chat**: `http://localhost:3000/`
- **Salesperson desk**: `http://localhost:3000/desk.html`

## Run tests

```bash
npm test       # engine + agent unit tests (no key required)
npm run smoke  # in-process end-to-end smoke test
```

## Environment variables (optional)

Copy `.env.example` to `.env` and fill in values to enable the watsonx.ai chat extractor.
Without these keys the agent uses the built-in rule-based extractor — no functionality is lost.

| Variable | Default | Purpose |
|---|---|---|
| `WATSONX_APIKEY` | *(required)* | IBM Cloud API key |
| `WATSONX_PROJECT_ID` | *(required)* | watsonx.ai project ID |
| `WATSONX_URL` | `https://eu-de.ml.cloud.ibm.com` | watsonx.ai endpoint URL |
| `WATSONX_MODEL_ID` | `mistralai/mistral-small-3-1-24b-instruct-2503` | Model ID (use `ibm/granite-4-h-small` for the cheaper IBM alternative) |
| `PORT` | `3000` | Server port |

See [`docs/MODEL_EVALUATION.md`](docs/MODEL_EVALUATION.md) for the model comparison results.

## Project layout

```
server.js       Main Express server (API + static files)
engine/         Thin wrapper around reference/sizer.js + unit tests
agent/          AI intake agent
  loop.js         State-machine conversation handler
  extract-fallback.js   Rule-based extractor (no key needed)
  extract-granite.js    watsonx.ai Granite extractor (falls back to rule-based)
  extract.js      Extractor interface (re-exports granite with fallback)
  price.js        Mock price calculator
  tests/          Agent tests (extract + loop)
web/            Reseller chat UI + salesperson desk UI
  index.html      Reseller chat (Hebrew RTL default, EN toggle)
  desk.html       Salesperson desk
data/           Mock price list, demo requests, submitted requests
scripts/        smoke.js — in-process end-to-end smoke test
docs/           Plan, architecture, task notes
orchestrate/    watsonx Orchestrate tool + agent (see orchestrate/README.md)
reference/      reference/sizer.js — production engine (do not edit)
bob_sessions/   Screenshots of Bob task sessions (required for judging)
```

## Key rules

- No real client data. All demo names are invented.
- Prices shown are from `data/mock-pricelist.json` — **MOCK, demo only**.
- API keys live in `.env` only; `.env` is git-ignored.
- Nothing is sent to IBM or to a reseller without human approval (desk → Approve).
- The reseller never sees a price.

## Scope

FlashSystem 5600 and 7600 only. Expert Care Basic or Advanced only.
See `docs/PLAN.md` for the full architecture and task list.

## Running with watsonx Orchestrate

The `orchestrate/` directory contains a deployed agent (`blues_deal_desk`) running in
IBM watsonx Orchestrate (IBM Cloud, ca-tor region). The agent uses the same sizing
logic as the local app but runs fully in the cloud — no `localhost` required.

The **local app** (`server.js`, `agent/`, `web/`) continues to work without Orchestrate.
The two modes are independent; you can use either.

### Prerequisites (Orchestrate path)

- Python ≥ 3.11 venv at repo root (already set up: `source venv/bin/activate`)
- `orchestrate env activate hackathon` (IBM Cloud API key in `.env`)

### Parity tests (before any import)

```bash
node scripts/make-golden.js                                          # regenerate golden cases
PYTHONPATH=orchestrate python -m pytest orchestrate/tests/test_parity.py -v   # 44/44 must pass
```

### Import / update

```bash
source venv/bin/activate
bash orchestrate/scripts/import-all.sh
```

### Chat with the deployed agent

In Bob: _"Chat with `blues_deal_desk`: I need a FlashSystem with 40TB effective, FC 32Gb, Advanced 5Y."_

Full details: [`orchestrate/README.md`](orchestrate/README.md)
Test transcripts: [`docs/orchestrate-test-runs.md`](docs/orchestrate-test-runs.md)

