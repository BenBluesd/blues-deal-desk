# Technology statement

**IBM technology**
- **IBM Bob (IDE):** used to build the whole project in 12 focused tasks (about 60 Bobcoins). Screenshots of every task summary are in `bob_sessions/`.
- **IBM watsonx Orchestrate (ADK + cloud, ca-tor):** three agents (`blues_deal_desk`, `blues_site_advisor`, `blues_quote_desk_internal`) with Python tools, imported with `orchestrate/scripts/import-all.sh`. LLM: GPT-OSS 120B, as available in the hackathon account.
- **watsonx.ai:** used in a separate watsonx.ai project to compare candidate models (`docs/MODEL_EVALUATION.md`).

**Design**
- A deterministic sizing engine (Blues' existing JavaScript configurator, ported 1:1 to Python and checked by 44 parity tests) produces every feature code. The model only handles language.
- Checks that matter live inside the tools, not in the prompt: explicit-yes confirmation, phone and email validation, MOCK-only pricing, no prices for resellers or end customers.
- Hebrew display uses Unicode bidi isolation so mixed Hebrew and product names render correctly.

**Other components**
- Node.js local demo (`server.js`, `agent/`, `web/`): reseller chat and salesperson desk.
- A demo API and a hidden desk page on Blues' live website (Netlify Functions and Netlify Blobs).

**Tests**
- 101 Python tests (including parity), 153 JavaScript tests and 13 smoke checks.

**Data**
- Invented companies, emails and a MOCK price list only. No customer data, no API keys in the repository.
