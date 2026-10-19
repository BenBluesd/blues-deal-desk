# Blues Deal Desk: problem and solution statement

**Team:** Blues Distribution · **Hackathon:** From &lt;bob&gt; to Business Impact (IBM Israel, 2026)

## The problem

Blues Distribution is Israel's largest official IBM distributor. When a reseller's customer needs IBM storage, the reseller comes to us. In IBM's deal-registration model, the first partner to register an opportunity gets the best price, so speed matters.

Today a reseller sends a loose request by email or WhatsApp, such as "about 40TB, iSCSI, five years of support". A Blues expert turns it into an exact IBM FlashSystem configuration (model, drives, adapters, transceivers, support codes) and prices it.

The configuration itself takes an expert about five minutes, yet the reseller waits hours for an answer:

- **Most requests arrive incomplete**, so each one starts a round of questions.
- **Requests queue up** behind other work for the few people who can configure them.
- **Requests sent after hours** wait for the next workday.

The result: slow answers, risk of wrong feature codes, and resellers drifting to whoever answers first.

## The solution

Blues Deal Desk is an AI agent on **IBM watsonx Orchestrate** that answers resellers 24/7, in Hebrew or English.

1. **The reseller chats with the agent.** It asks only for what is missing, then calls a deterministic sizing tool: Blues' existing configuration engine, already live on our website, ported 1:1 to Python and checked by 44 parity tests.
2. **The reseller gets a clear recommendation and a reference number**: model, drives, capacity, connectivity and support. It contains no price.
3. **A Blues salesperson reviews the request on a desk page.** The page shows the structured spec, the exact e-config feature lines, a "verify in e-config" checklist and a routine or needs-review route. The salesperson approves the request or asks the reseller a question. Nothing goes to IBM or to the reseller without a person.

Language is the AI's job; correctness is the engine's job. The model never invents a feature code.

## Built with IBM Bob

We built the whole project in IBM Bob, in eight focused tasks, for about 40 Bobcoins (screenshots in `bob_sessions/`). It includes:

- a local demo with a reseller chat and a salesperson desk;
- the Python engine port with parity tests;
- the Orchestrate agent and its two tools;
- a live API and a hidden desk page on our real website, `bluesd.co.il`.

A request made in the Orchestrate chat appears on that desk page within about a minute.

## Business impact

- **First answer in minutes instead of hours**, at any time, in the reseller's language.
- **Fewer rounds of questions**: missing details are collected up front.
- **Fewer errors**: feature codes come only from the verified engine.
- **Expert time moves to complex deals**: routine requests arrive pre-configured.
- **Earlier deal registration**, which keeps resellers with Blues.

## Path to production

The engine and the demo API already run on our live hosting. Next come real ePricer pricing behind the salesperson's approval, CRM and login integration, and more IBM lines (Power, SAN, tape). See `docs/PATH_TO_PRODUCTION.md`.

Model selection is documented in [`docs/MODEL_EVALUATION.md`](docs/MODEL_EVALUATION.md).
