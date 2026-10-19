# Path to production

This document explains how Blues Deal Desk moves from a hackathon demo to a tool Blues uses every day. Much of it is already live.

## What already runs in production today

| Part | Status |
|---|---|
| Sizing engine (`reference/sizer.js`) | **Live** on bluesd.co.il, in the reseller area and the website bot. The Orchestrate tool is a 1:1 Python port of it, guarded by 44 parity tests. |
| Request API (`/api/bob-demo/requests`) | **Live** on the Blues Netlify site. It re-runs the engine server-side, validates input, rate-limits, and stores up to 200 demo records. |
| Salesperson desk | **Live** on a hidden, no-index page of the Blues site. It refreshes every 10 seconds. |
| Orchestrate agent | Running in the team's watsonx Orchestrate instance. It calls `size_flashsystem` and `submit_request`. |

## Steps to production

### Phase 1: Internal pilot (2–4 weeks)
1. Deploy the agent in Orchestrate for Blues staff only. Salespeople paste real reseller requests into it and compare the result with what they would have built by hand.
2. Track three numbers per request:
   - time to first answer;
   - rounds of questions;
   - how many feature lines the salesperson had to change.
3. Keep the demo safeguards: no prices to resellers, invented data in any public material.

### Phase 2: Real pricing, still human-approved
1. The approved configuration exports to an e-config CFR. Blues already has internal tooling for e-config and ePricer, and this step reuses it.
2. The salesperson prices the CFR in ePricer and sends the official quote from the ERP.
   - The agent never submits to IBM and never shows a price.
   - The **Approve** button is the only path out.
3. Replace the mock price list with an internal estimate that only the salesperson can see.

### Phase 3: Open to resellers
1. Put the chat behind the existing reseller login on bluesd.co.il, and tie requests to the reseller's account.
2. Move storage from the demo blob store to Blues' CRM or ERP intake. Add notifications to the salesperson by email or Teams.
3. Add the IBM opportunity-ID check (`006…`), so deal registration starts at the first message.

### Phase 4: More IBM lines
The engine pattern (deterministic rules plus an AI intake) fits:

- **IBM Power** servers;
- **SAN** switches;
- **tape** libraries;
- software **renewals**.

Each new product line is a new tool for the same agent.

## Controls that stay in every phase
- **Human in the loop.** The agent prepares; a Blues salesperson approves.
- **No invented codes.** Feature codes come only from the engine tables. A "verify in e-config" checklist covers anything the engine is unsure of.
- **No confidential pricing to resellers.** IBM buy prices and discounts never leave Blues.
- **Secrets.** API keys live only in environment variables, never in the repository.
- **Language.** The agent answers in the language of the reseller's latest message. This is enforced in the tool, not only in the prompt.

## Effort and cost
- **Phase 1** needs only configuration work: deploy the agent and give staff access.
- **Phases 2–3** reuse existing Blues assets: the website, the reseller login and the e-config/ePricer tooling.
- The largest new piece is the integration with the CRM or ERP.
