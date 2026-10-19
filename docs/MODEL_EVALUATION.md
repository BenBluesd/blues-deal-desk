# Model Evaluation: watsonx.ai Intake Extractor

> Results from a comparison run on **2026-10-19** on watsonx.ai (eu-de, free tier).
> All 20 test cases are invented. The comparison was run by the team with a separate
> script on a personal watsonx.ai free-tier project; it is not part of this repository.

## Method

Two tracks, 20 invented cases, rule-based grading, and checking each result with the real sizing engine.

- **Track A – Bot** (10 cases): Q&A questions graded on four rules: no prices disclosed, answer in the asker's language, no system-prompt leak, required facts present.
- **Track B – Intake** (10 cases): Free-text reseller requests extracted to a sizing spec, graded field by field (54 fields total) and by whether the sizing engine produces the same recommendation as the expected spec.

## Results

### Track A – Bot (up to 10 questions per model)

| Model | Pass / n | Median latency |
|---|---|---|
| `site-haiku` | 15 / 15 | 3,297 ms |
| `ibm/granite-4-h-small` | 9 / 10 | 7,295 ms |
| `meta-llama/llama-3-3-70b-instruct` | 4 / 5 | 5,265 ms |
| `mistralai/mistral-small-3-1-24b-instruct-2503` | 5 / 5 | 2,133 ms |
| `openai/gpt-oss-120b` | — | — |

### Track B – Intake (10 requests, 54 fields)

| Model | Fields correct | Valid runs | Sizer match | Median latency | Cost (USD) |
|---|---|---|---|---|---|
| `ibm/granite-4-h-small` | 50 / 54 | 10 / 10 | 9 / 10 | 1,396 ms | $0.00057 |
| `meta-llama/llama-3-3-70b-instruct` | 53 / 54 | 10 / 10 | 9 / 10 | 1,859 ms | $0.00412 |
| `mistralai/mistral-small-3-1-24b-instruct-2503` | 53 / 54 | 10 / 10 | 9 / 10 | 1,083 ms | $0.00072 |
| `openai/gpt-oss-120b` | — | — | — | — | — |

`site-haiku` was not run on the intake track (n = 0).

## Choice

**Default: `mistralai/mistral-small-3-1-24b-instruct-2503` (Mistral Small 3.1)**

Mistral Small matched 53 of 54 fields, produced the same sizing recommendation as the expected spec in 9 of 10 cases, had the lowest median latency (1,083 ms), and cost $0.00072 for 10 requests — only slightly more than Granite.

**Close alternative: `ibm/granite-4-h-small` (Granite 4 H Small)**

Granite is a native IBM model available on the same free tier, costs less ($0.00057), and differs from Mistral Small by only 3 fields. It is available with one environment variable change:

```
WATSONX_MODEL_ID=ibm/granite-4-h-small
```

## Caveats

- `openai/gpt-oss-120b` returned a 401 `model_not_accessible` error on the free tier and was not evaluated.
- Track A has fewer runs for some models (5 instead of 10); those results are indicative only.
- The comparison was run by the team with a separate script on a personal watsonx.ai free-tier project. It is not part of this repository's code.
