# Blues Deal Desk: problem and solution statement

**Team:** Blues Distribution · **Hackathon:** From &lt;bob&gt; to Business Impact (IBM Israel, 2026)

## The problem

Blues Distribution is Israel's largest official IBM distributor. Resellers come to us when their customers need IBM storage. Speed matters: in IBM's deal-registration model, the first partner to register gets the best price.

A reseller usually sends something short, like "about 40TB, iSCSI, five years of support". One of our experts turns that into an exact IBM FlashSystem configuration and prices it.

The configuration takes about five minutes. The reseller still waits hours. Most requests are missing details, so they start with a round of questions. They wait in line for the few people on the team who can configure storage. Anything that comes in after hours waits for the next morning. Resellers drift to whoever answers first.

## The solution

Blues Deal Desk is three AI agents on IBM watsonx Orchestrate, in Hebrew and English. All three use the sizing engine already running on our website, ported to Python and checked with 44 parity tests.

The reseller agent works 24/7. It asks only for what is missing, sizes the system and returns a recommendation with a reference number. It never shows a price.

The website agent is for end customers. It suggests a system in one sentence, collects company, contact, phone and email, and sends the lead only after the visitor explicitly says yes. The tool checks that, not the prompt.

The internal agent is for our sales team. A salesperson pastes a reseller's email and gets back the customer, a configuration and an alternative, the items, quotes from the email, assumptions, what is missing and a draft reply. If they confirm, it prices the request from a MOCK price list with an 8% margin.

Every request ends up on a salesperson desk page with the exact e-config lines and a checklist to verify in e-config. A person approves before anything goes to IBM or to the reseller.

The split is deliberate. The model handles the conversation. The engine decides the configuration, so the model never invents a feature code.

## Built with IBM Bob

We built the project in IBM Bob in twelve tasks, for about 60 Bobcoins. Task summaries are in `bob_sessions/`. It covers a local demo with a reseller chat and a salesperson desk, the Python engine port with its parity tests, the three Orchestrate agents with all checks and calculations in their tools, and a live API with a hidden desk page on our website, `bluesd.co.il`.

## Business impact

Resellers get a first answer in minutes instead of hours, at any time, with fewer questions. Feature codes come only from the verified engine, so there are fewer errors. Experts focus on complex deals, and resellers register earlier and stay with us.

## Path to production

The engine and the demo API already run on our live hosting. Next steps are real ePricer pricing behind the salesperson's approval, CRM and login integration, and more IBM lines (Power, SAN, tape). See `docs/PATH_TO_PRODUCTION.md`.

Model selection is documented in [`docs/MODEL_EVALUATION.md`](docs/MODEL_EVALUATION.md).
