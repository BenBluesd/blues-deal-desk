# Task 08: clean Hebrew display (bidi) and clearer wording (small)

Read `orchestrate/tools/sizer.py` (from `_public_for_lang` to the end), `orchestrate/tools/submit_request.py` and `orchestrate/agents/blues_deal_desk.yaml`. Same rules: the ported engine logic stays untouched (parity must stay 44/44), invented data only, and no new packages. Only about 10 Bobcoins are left, so keep this task small and build directly.

## Why
In the live Hebrew chat, mixed Hebrew and English text renders badly. The model writes "39.6 TB" with a space, and the right-to-left layout then shows "TB 39.6". "8 × 32 Gb FC" comes out scrambled the same way. The model also paraphrases the engine's text, so the disclaimer became "ההצעה היא להמשך תהליך מכירה", and the closing questions read badly. Fix this **in the tools**: they return ready-to-show text, and the agent shows it verbatim.

## A. `size_flashsystem` returns `display` (in `sizer.py`, wrapper only)
Add a string field `display` to the result. It is Markdown in the requested `lang`, built only from `public`:

```
**<headline>**
- <line 1>
- <line 2>
...
<disclaimer>

<closing question>
```

- In the line items, the assumption about effective capacity may appear once, as a plain line, if it exists in `public`.
- **Bidi isolation, Hebrew only:** wrap every run that contains Latin letters or digits in FSI U+2068 … PDI U+2069, for example `⁨FlashSystem 5600⁩`. A run is a maximal sequence of `[A-Za-z0-9.,:/×x+\-()~ ]` that contains at least one Latin letter or digit, trimmed of the spaces at its ends. Hebrew and punctuation stay outside. Do not change any characters other than adding these marks. English output gets no marks.
- **Closing question:**
  - If `route` is `"auto"`:
    - he: `יש לכם מספר הזדמנות ב-IBM (מתחיל ב-006)? אם כן, כתבו אותו. אם לא, כתבו "שלח" ואעביר את הבקשה לצוות של בלוז.`
    - en: `Do you have an IBM opportunity ID (starts with 006)? If so, type it. If not, type "send" and I will pass the request to the Blues team.`
  - If `route` is `"review"` or `"custom"`, add this before the question:
    - he: `הבקשה תעבור לבדיקה של צוות בלוז לפני הצעת מחיר.`
    - en: `The Blues team will review this request before quoting.`
- Put the bidi helper in a small function, `_isolate_ltr(text)`, so it can be tested.

## B. `submit_request` returns `display`
- On success:
  - he: `הבקשה נשלחה לצוות של בלוז. מספר הבקשה: <ref>. איש מכירות יחזור אליכם עם הצעת מחיר.`
  - en: `Your request was sent to the Blues team. Reference: <ref>. A Blues salesperson will reply with a quote.`
  - Use the same bidi isolation (via `_isolate_ltr`) for Hebrew. Import it from `sizer.py`, or copy the function if the import fails inside Orchestrate.

## C. Agent YAML
- Step 3: "Show `display` from `size_flashsystem` **exactly as returned**: no rewording, no added lines, no translation. Do not show `public` yourself."
- Remove the separate "Submit to Blues?" question and the separate opportunity question; `display` already asks one combined question.
- On an opportunity ID (006…), or on "שלח" / "send" / "כן" / "yes": call `submit_request`. Then show its `display` exactly as returned.
- In Step 2 questions, use the word "תצורה" and never "קונפיגורציה".
- When writing numbers with units yourself, never put a space between them ("40TB", "32Gb").

## D. Tests
- Python: `_isolate_ltr`
  - wraps "39.6TB" and "FlashSystem 5600" in Hebrew text;
  - leaves pure Hebrew unchanged;
  - leaves English output untouched.
- `display` for `he` contains the combined question; `display` for `en` contains no Hebrew letters.
- `submit_request` display uses the ref, tested with mocked HTTP.
- Run the parity tests (44/44), the new tests and `npm test`.
- Re-import with `bash orchestrate/scripts/import-all.sh`.
- Do **not** deploy a new Live version; the team tests in Draft Preview first.

Report the Bobcoins used, then stop.
