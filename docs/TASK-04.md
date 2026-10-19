# Task 04: the watsonx Orchestrate agent (plan step 7)

Read `docs/PLAN.md`, `docs/DECISIONS.md` and this file. Same rules: invented data only, no secrets in the repo, engine logic must not drift.

## Status

- Bob is connected to watsonx Orchestrate. The active environment is `hackathon` (IBM Cloud, ca-tor, auth `ibm_iam`).
- The ADK CLI is not on PATH. Use the full path: `~/.cache/uv/archive-v0/xFG5IKoXGNaItoY_/bin/orchestrate` (or the ADK extension's own commands).
- The account has **no watsonx.ai project**, so no direct Granite calls. The LLM is the one Orchestrate gives the agent (the existing native agent uses `gpt-oss-120b`). Use whatever model Orchestrate offers by default; list the available models first and pick the best one for Hebrew + English.
- The tool must run **inside Orchestrate** (cloud). It cannot call `localhost`.

## Goal

An Orchestrate agent, **`blues_deal_desk`**, that has the same conversation as our local agent (identify, gather, confirm, submit), in Hebrew or English, and uses a deterministic sizing tool. Never shows a price. Never invents feature codes.

## A. The tool: `size_flashsystem` (Python, ADK)

- Port `reference/sizer.js` to Python in `orchestrate/tools/sizer.py`, **logic only, 1:1**. Same rules, tables, routes and output shape as `BluesSizer.size(spec, ctx)`.
- Expose it as an ADK Python tool `size_flashsystem(spec: dict, ctx: dict) -> dict`, with a clear docstring describing every spec field (the tool contract in `docs/PLAN.md` §3), so the agent knows how to fill it.
- **Parity test, mandatory:** a small Node script (`scripts/make-golden.js`) runs the JS engine on at least 40 varied specs (all demo requests plus generated combinations of capacity type, connectivity, speed, ports, SAN, EC years and level, model, transceivers) and writes `orchestrate/tests/golden.json`. A Python test (`orchestrate/tests/test_parity.py`) runs the port on the same inputs and asserts that `route`, `recommendation`, `econfig.lines` and `public.headline` are equal. All must pass before importing.
- If something in the JS cannot be ported exactly, stop and write it in `docs/ENGINE_NOTES.md` instead of guessing.

## B. The agent

- `orchestrate/agents/blues_deal_desk.yaml` (native agent). Instructions in English, but reply in the user's language (Hebrew or English).
- Behaviour, in short:
  1. Ask for company name and contact email, one at a time.
  2. Gather what is missing, one question at a time, in priority: capacity and type, connectivity and speed, SAN switches (FC only), Expert Care years and level. Call `size_flashsystem` after every new piece of information and use its `questions`.
  3. Show the `public` summary (headline, lines, assumptions, disclaimer). Ask once for an optional IBM opportunity ID (starts with 006).
  4. Ask "Submit to Blues?". On yes, return a short request reference and say a Blues salesperson will reply with a price.
  - Never show prices, internal notes, `verify` items, or feature codes to the reseller.
  - Off-topic: politely say it only helps with IBM FlashSystem configurations.
- Add 3 short starter prompts (one Hebrew, two English).

## C. Import and test

- Import the tool and the agent into the `hackathon` environment with the ADK CLI.
- Run one Hebrew and one English test conversation against the deployed agent (ADK chat or the API) and save the transcripts to `docs/orchestrate-test-runs.md`.
- Add `orchestrate/README.md`: how to import, test and update.

## D. Do not change

- The local app (`server.js`, `agent/`, `web/`) keeps working without Orchestrate. Only add, in `README.md`, a short section "Running with watsonx Orchestrate".

Report the Bobcoins used, then stop. If an import or test command fails twice, stop and show the error instead of retrying.
