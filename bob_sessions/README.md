# bob_sessions

Screenshots of the IBM Bob task-session summaries for team **Blues Distribution**, required for judging.

| File | Bob task | Bobcoins |
|---|---|---|
| `BluesDistribution_task01_plan_summary.png` | Read the brief and the engine, write `docs/PLAN.md` | 0.199 |
| `BluesDistribution_task02_setup-data_summary.png` | Steps 0–3: project setup, mock price list, demo requests | 1.79 |
| `BluesDistribution_task03_demo-app_summary.png` | TASK-02: server, agent loop, reseller chat, salesperson desk, tests | 5.65 |
| `BluesDistribution_task04_chat-polish_summary.png` | TASK-03: conversation polish from the team's test run | 9.25 |
| `BluesDistribution_task05_orchestrate-agent_summary.png` | TASK-04: Python engine port, parity tests, watsonx Orchestrate agent | 10.25 |
| `BluesDistribution_task06_live-site-demo_summary.png` | TASK-05: live API and hidden desk page on bluesd.co.il, `submit_request` tool | 6.06 |
| `BluesDistribution_task07_language-endcustomer-fix_summary.png` | TASK-06: language enforced in the tool, end customer passed | 3.45 |
| `BluesDistribution_task08_watsonx-model-eval_summary.png` | TASK-07: watsonx.ai chat API (Mistral Small) for the local agent, model evaluation doc | 3.45 |
| `BluesDistribution_task09_hebrew-display_summary.png` | TASK-08: tools return ready-to-show Hebrew text, agent shows it verbatim | 2.98 |
| `BluesDistribution_task10_site-advisor-agent_summary.png` | TASK-09: website agent for end customers, lead tool with confirmation checked in the tool | 5.02 |
| `BluesDistribution_task11_internal-quote-agent_summary.png` | TASK-10: internal agent for the sales team, email analysis and MOCK pricing | 4.20 |
| `BluesDistribution_task12_agent-fixes_summary.png` | Fixes from live tests: tool packaging in Orchestrate, lead API fields, Hebrew labels | 7.16 |

Total: about 59.5 Bobcoins.

**Note on edits outside Bob.** After TASK-08, to save Bobcoins, the team made a few small display fixes directly in the files, with no new logic: bidi trimming in `_isolate_ltr`, blank lines in `display`, filtering an internal engine note out of the reseller view, and two short instruction changes in `blues_deal_desk.yaml`. They are covered by the same tests.
