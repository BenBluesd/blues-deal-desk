# Demo video script (target: 2:45, max 3:00)

Record the screen with voice-over in English. Ben speaks. Use invented companies only.

| Time | On screen | Voice-over (suggested) |
|---|---|---|
| 0:00–0:20 | Title card: "Blues Deal Desk". Then a WhatsApp-style loose request: "need ~40TB, FC, 5y support". | "I'm Ben from Blues Distribution, Israel's largest IBM distributor. A configuration takes our expert five minutes, but resellers wait hours: most requests arrive incomplete, they queue up, and evening requests wait for tomorrow." |
| 0:20–0:35 | Simple diagram: reseller → Orchestrate agent → sizing engine → salesperson desk. | "Blues Deal Desk is an AI agent on watsonx Orchestrate. The AI handles the conversation. Our proven sizing engine handles the configuration, so it never invents a feature code." |
| 0:35–1:20 | Orchestrate chat. Type the English request (Demo Reseller Ltd, 40TB effective, FC 32Gb, has SAN switches, Expert Care Advanced 5Y). Show the summary and the opportunity-ID question. Answer "No ID, please submit." Show reference BD-2026-… | "The reseller writes in plain English or Hebrew. The agent asks only for what's missing, sizes a FlashSystem 5600, and returns a reference. No price is shown. Pricing stays with Blues." |
| 1:20–1:40 | Open Show Reasoning: the `size_flashsystem` and `submit_request` tool calls with their input and output. | "Under the hood: two tools. One sizes, one submits to our real website. The reference number comes from the server, not from the model." |
| 1:40–2:05 | The hidden desk page on bluesd.co.il. The new request appears. Open it: spec, e-config lines, verify checklist, MOCK price, Approve. | "Seconds later the request lands on our salesperson desk, on our live website. It has exact e-config lines and a checklist. One click to approve. A human always signs off." |
| 2:05–2:20 | Quick Hebrew message in the chat; the reply comes back in Hebrew. | "It works in Hebrew too, enforced in the tool itself." |
| 2:20–2:40 | IBM Bob: the Tasks list with 7 tasks and their Bobcoin costs; a glimpse of tests passing. | "We built all of it in IBM Bob, in seven focused tasks and about 37 Bobcoins, including a 1:1 Python port of our engine checked by 44 parity tests." |
| 2:40–2:55 | Closing card with the impact bullets and "Next: Power, SAN, tape, renewals". | "Minutes instead of hours, 24/7, with fewer errors. Next, we add IBM Power, SAN and tape. Thank you." |

## Before recording
- [ ] Reload the Orchestrate chat page for a clean conversation.
- [ ] Open the desk page in a second tab. New requests appear there after about a minute, so record the desk part a little later or cut between the takes.
- [ ] Hide bookmarks and notifications, and close other tabs.
- [ ] Use only invented companies and emails.
