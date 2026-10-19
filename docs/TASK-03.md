# Task 03: conversation polish (from the team's test run)

Read `docs/TASK-02.md` for context. Same rules: engine untouched, invented data only, no secrets, no new packages. Keep all existing tests green and add tests for each fix.

We ran the reseller chat end to end in a browser. It works. Fix these issues, in this order:

1. **Engine notes are not questions.** In Hebrew, the agent sent the effective-capacity note ("הקיבולת האפקטיבית מניחה דחיסה…") as if it were a question, and waited for an answer. Rule: only `result.questions[]` items that really ask something go to the reseller one at a time. Informational items (notes, assumptions such as the 2.4:1 data-reduction note) are shown **once, inside the summary card**, under a small "Assumptions" heading, never as a separate turn.
   - If you cannot tell a question from a note by structure, treat a text as a question only if it ends with "?".
2. **Opportunity ID answers.** When asked for the IBM opportunity ID, handle:
   - a number that starts with 006, which is saved,
   - "no", "אין", "לא", "skip", "דלג", which mean no ID and continue,
   - "yes", "כן" without a number, which leads to one more prompt: "Great, please type the number (starts with 006)".
   Never treat "כן" as the final "submit" confirmation while the opportunity question is open.
3. **One summary, not two.** The confirm turn currently shows the summary twice (plain text and card). Show only the card, followed by one line: "Submit to Blues?" with two quick-reply buttons: **Submit** / **Change something** (Hebrew: **שלח** / **לשנות משהו**). "Change something" goes back to gather.
4. **Reseller name extraction.** "Hi, I am from Smoke Test Corp. Email: smoke@test.co.il" saved the whole sentence as the company name. Extract just the company ("Smoke Test Corp"). Handle Hebrew patterns too: "אנחנו מ…", "מדבר/ת מ…", "החברה שלנו …", "שמי … מחברת …". If unsure, ask: "What is your company name?" as a short separate question.
5. **Quick replies.** For questions with obvious options, show tappable chips under the agent bubble (for example FC / iSCSI; 3 / 5 years; Basic / Advanced; have switches / need switches / direct). Clicking a chip sends that text.
6. **After submit**: show a success card with the request ID and "A Blues salesperson will contact you with a price". Disable the input box, and add a "New request" button.
7. **Desk polish**: list items show the **company name** (not the first message) and the end customer if known. Add a small count of pending requests in the header.

Then run `npm test` and `npm run smoke`, show results, make sure `data/requests.json` is left as `[]` (it is git-ignored, but keep the demo clean), report Bobcoins used, and stop.
