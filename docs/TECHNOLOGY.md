# Technology statement

## IBM Bob

We built the project in the Bob IDE in 12 tasks, for about 60 Bobcoins. Each task started from a short task file in `docs/` (TASK-02 to TASK-10). Bob read the existing code, made the changes, ran the tests and imported the agents into Orchestrate from its terminal. The task summaries are in `bob_sessions/`.

## IBM watsonx Orchestrate

The three agents run in the hackathon's Orchestrate instance (ca-tor):

- `blues_deal_desk` for resellers
- `blues_site_advisor` for website visitors
- `blues_quote_desk_internal` for our sales team

Each agent calls Python tools built with the ADK (`orchestrate/tools/`). We import them with `orchestrate/scripts/import-all.sh`. The LLM is GPT-OSS 120B, which is what the hackathon account offers.

We also used watsonx.ai, in a separate project, to compare candidate models. The results are in `docs/MODEL_EVALUATION.md`.

## How it is built

The configuration comes from Blues' existing JavaScript configurator. We ported it 1:1 to Python and check it with 44 parity tests. The model only talks to the user and fills in the fields. It never chooses feature codes.

Anything that has to be right is checked in the tools, not left to the prompt:

- the explicit "yes" before a lead or a price
- phone and email validation
- MOCK-only pricing
- no prices shown to resellers or end customers

Hebrew output uses Unicode bidi isolation so that Hebrew text mixed with product names displays correctly.

## Other parts

- A local Node.js demo (`server.js`, `agent/`, `web/`) with a reseller chat and a salesperson desk.
- A demo API and a hidden desk page on our live website (Netlify Functions and Netlify Blobs).

## Tests

101 Python tests (including the parity tests), 153 JavaScript tests and 13 smoke checks.

## Data

Only invented companies and emails, and a MOCK price list. No customer data and no API keys in the repository.
