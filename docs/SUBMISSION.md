# Blues Deal Desk: problem and solution statement

**Team:** Blues Distribution · **Hackathon:** From &lt;bob&gt; to Business Impact (IBM Israel, 2026)

## The problem

Blues Distribution is Israel's largest official IBM distributor. When a reseller's customer needs IBM storage, the reseller comes to us. In IBM's deal-registration model, the first partner to register an opportunity gets the best price, so speed matters.

Today a reseller sends a loose request by email or WhatsApp, such as "about 40TB, iSCSI, five years of support". A Blues expert turns it into an exact IBM FlashSystem configuration and prices it.

The configuration itself takes an expert about five minutes, yet the reseller waits hours for an answer:

- **Most requests arrive incomplete**, so each one starts a round of questions.
- **Requests queue up** for the few people who can configure them.
- **Requests sent after hours** wait for the next workday.

The result: slow answers, wrong-code risk, and resellers drifting to whoever answers first.

## The solution

Blues Deal Desk is a set of three AI agents on **IBM watsonx Orchestrate**, in Hebrew or English, around one deterministic sizing engine: Blues' existing configuration engine, already live on our website, ported 1:1 to Python and checked by 44 parity tests.

1. **Reseller agent (24/7).** It asks only for what is missing, sizes the system and returns a recommendation and a reference number, with no price.
2. **Website agent for end customers.** It suggests a configuration in one sentence, collects company, contact, phone and email, and sends a lead only after an explicit "yes", checked inside the tool.
3. **Internal agent for the sales team.** Paste a reseller's email and get the customer, a configuration and an alternative, items, quotes from the email, assumptions, what is missing and a draft reply. On "yes" it prices from a MOCK price list with an 8% margin.

Every request lands on a salesperson desk page with the exact e-config lines and a "verify in e-config" checklist. Nothing goes to IBM or to the reseller without a person.

Language is the AI's job; correctness is the engine's. The model never invents a feature code.

## Built with IBM Bob

We built the whole project in IBM Bob, in twelve focused tasks, for about 60 Bobcoins (screenshots in `bob_sessions/`). It includes:

- a local demo with a reseller chat and a salesperson desk;
- the Python engine port with parity tests;
- three Orchestrate agents, with every check and calculation inside their tools;
- a live API and a hidden desk page on our real website, `bluesd.co.il`.

## Business impact

- **First answer in minutes instead of hours**, at any time.
- **Fewer rounds of questions.**
- **Fewer errors**: feature codes come only from the verified engine.
- **Expert time moves to complex deals.**
- **Earlier deal registration**, which keeps resellers with Blues.

## Path to production

The engine and the demo API already run on our live hosting. Next come real ePricer pricing behind the salesperson's approval, CRM and login integration, and more IBM lines (Power, SAN, tape). See `docs/PATH_TO_PRODUCTION.md`.

Model selection is documented in [`docs/MODEL_EVALUATION.md`](docs/MODEL_EVALUATION.md).
