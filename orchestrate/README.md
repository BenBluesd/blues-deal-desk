# Blues Deal Desk – watsonx Orchestrate

This directory contains the IBM watsonx Orchestrate agent and tool for
Blues Deal Desk.

| File | Purpose |
|---|---|
| `tools/sizer.py` | Python 1:1 port of `reference/sizer.js` + ADK `@tool` wrapper |
| `agents/blues_deal_desk.yaml` | Native agent definition |
| `tests/golden.json` | 44 golden cases produced by the JS engine |
| `tests/test_parity.py` | Pytest parity test (Python vs JS engine) |
| `scripts/import-all.sh` | Import tool + agent into the active environment |
| `scripts/delete-all.sh` | Remove tool + agent (reverse order) |

---

## Prerequisites

```bash
# Python ≥ 3.11, venv already set up at repo root
source venv/bin/activate
orchestrate --version   # should print ADK 2.x
orchestrate env list    # confirm hackathon is (active)
```

---

## Parity tests (run before every import)

```bash
source venv/bin/activate
# regenerate golden cases from the JS engine
node scripts/make-golden.js

# run parity tests
PYTHONPATH=orchestrate python -m pytest orchestrate/tests/test_parity.py -v
```

All 44 tests must pass before importing. If any fail, check `orchestrate/tools/sizer.py`
against the JS engine output and fix the discrepancy. **Never patch the JS engine.**

---

## Import into hackathon environment

```bash
source venv/bin/activate
orchestrate env activate hackathon          # if not already active
bash orchestrate/scripts/import-all.sh
```

Expected output:

```
==> Active environment:
 hackathon  …  (active)
==> Importing tool: size_flashsystem ...
[INFO] Tool 'size_flashsystem' imported successfully
==> Importing agent: blues_deal_desk ...
[INFO] Agent 'blues_deal_desk' imported successfully
```

> **Note:** A `[WARNING] Unable to properly parse parameter descriptions` line
> may appear for the `dict` return type. This is a known ADK false positive;
> the tool imports and runs correctly.

Verify:

```bash
orchestrate tools  list | grep size_flashsystem
orchestrate agents list | grep blues_deal_desk
```

---

## Test the deployed agent

### Via Bob (recommended)
Ask Bob: _"Chat with `blues_deal_desk`: I need a FlashSystem with 40TB effective, iSCSI, 5-year Advanced Expert Care."_

### Via the watsonx Orchestrate UI
Open the Orchestrate console → **Agents** → **blues_deal_desk** → use the starter prompts or type directly.

### Via CLI (⚠ may hang on SaaS — use Bob or MCP tool instead)
```bash
orchestrate chat ask -n blues_deal_desk "I need a FlashSystem, 40TB effective, FC 32Gb, 5-year Advanced." -r
```

### Sample prompts for manual testing

| Prompt | Expected outcome |
|---|---|
| `שלום, אני מנגב דאטה. צריך FlashSystem עם 40TB אפקטיבי, FC 32Gb, 5 שנות Advanced.` | Asks company name, then email, then sizes FS5600 6×6.6TB 8×32Gb FC |
| `Hi, 30TB effective, iSCSI 25Gb, Basic Expert Care 5 years.` | Asks company name/email, then sizes FS5600 2×13.2TB 8×25GbE |
| `We need 600TB effective, FC 32Gb.` | Sizes, returns route=review, says Blues team will review |
| `What's the price of the FlashSystem?` | Declines — says price comes from Blues salesperson |
| `Can you help me configure a Cisco switch?` | Declines — says only IBM FlashSystem |

---

## Update workflow

1. Edit `orchestrate/tools/sizer.py` or `orchestrate/agents/blues_deal_desk.yaml`.
2. Regenerate golden cases: `node scripts/make-golden.js`
3. Run parity tests: `PYTHONPATH=orchestrate python -m pytest orchestrate/tests/test_parity.py -v`
4. All 44 must pass; then re-import: `bash orchestrate/scripts/import-all.sh`
5. Smoke-test with one Hebrew + one English prompt.

---

## Remove from environment

```bash
source venv/bin/activate
bash orchestrate/scripts/delete-all.sh
```

---

## Test results

See [`docs/orchestrate-test-runs.md`](../docs/orchestrate-test-runs.md) for the two live
test conversations (Hebrew FC + English iSCSI).
