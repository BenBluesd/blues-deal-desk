# Task 06: two fixes from the live test (small)

Read `docs/orchestrate-test-runs.md`, "Run 3". Same rules. Keep it small: Bobcoins are limited. No plan step needed; just build.

In the live test, the user wrote only in English. Two things went wrong:
1. The agent replied in Hebrew, and `submit_request` was called with `lang: "he"`.
2. The end customer ("Acme Test Labs") was in the first message but was not passed to `submit_request`.

The YAML instructions already say the right things. The model ignored them, so the fix must be **in the tools, not only in the prompt**.

## A. Language, enforced by the tool

- `size_flashsystem` gets a new required argument `lang: str` ("he" | "en"). The docstring should say: "the language of the user's LATEST message: 'he' if it contains Hebrew letters, else 'en'".
- The tool returns `public` in **that one language only**: `headline` and `lines` as plain strings, plus `disclaimer`, `assumptions`, and the `questions` text, also in that language. The other language must not appear in the tool output, so the model has nothing in Hebrew to copy into an English reply.
- Do this in a thin wrapper. **Do not touch the ported engine logic**, and the parity tests must stay 44/44.
- In the YAML, put the language rule first, and add: "Pass the same `lang` to both tools."
- Make the welcome message bilingual (one Hebrew line, one English line) so it does not push toward Hebrew.

## B. End customer

- In the `submit_request` docstring and the YAML, Step 4: "If the user named an end customer anywhere in the conversation, you MUST pass it as `end_customer`."
- Also add `end_customer` to the short summary card.

## C. Test

- Unit test for the wrapper: `lang="en"` returns no Hebrew letters; `lang="he"` returns Hebrew.
- Run the parity tests plus `npm test`.
- Re-import with `bash orchestrate/scripts/import-all.sh`.
- Do **not** run `orchestrate chat ask`; it hangs on SaaS. The team will run the live chat test in the UI.

Report the Bobcoins used, then stop.
