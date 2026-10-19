# Blues Deal Desk – Netlify Deploy

This directory contains the Netlify Function and hidden desk page for the live demo.

## File map

| File | Purpose |
|---|---|
| `netlify/functions/bob-demo.mjs` | Netlify Functions v2 handler for the demo API |
| `netlify/shared/sizer.cjs` | Copy of `reference/sizer.js` (CommonJS); the function re-runs the engine server-side |
| `site/e/zw181wz9/index.html` | Hidden salesperson desk page (no links from anywhere; `noindex,nofollow`) |
| `tests/bob-demo.test.mjs` | Unit tests for the function (in-memory store mock, no network) |

## Where each file lives on bluesd.co.il

| Repo path | Netlify path |
|---|---|
| `deploy/netlify/functions/bob-demo.mjs` | Function, auto-mounted at `/api/bob-demo/requests` and `/api/bob-demo/requests/*` |
| `deploy/netlify/shared/sizer.cjs` | Bundled with the function (shared helper, not a standalone function) |
| `deploy/site/e/zw181wz9/index.html` | Deployed to `https://bluesd.co.il/e/zw181wz9/` |

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/bob-demo/requests` | Submit a new FlashSystem request (Orchestrate agent calls this) |
| `GET`  | `/api/bob-demo/requests` | List all requests, newest first (desk page) |
| `GET`  | `/api/bob-demo/requests/:id` | Full record + mock price (desk page detail) |
| `PATCH`| `/api/bob-demo/requests/:id` | Update status (`approved` or `asked`) |

### POST body

```json
{
  "reseller": "Acme IT",
  "email": "sales@acme.com",
  "endCustomer": "Hospital XYZ",
  "spec": { "cap": 40, "capType": "effective", "conn": "iscsi25", "ec": 5, "ecLevel": "Advanced" },
  "opportunityId": "0061234567",
  "lang": "en",
  "summary": "40TB effective iSCSI, 5Y Advanced"
}
```

Fields `endCustomer`, `opportunityId`, and `summary` are optional.  
`spec` must contain only [known fields](../docs/PLAN.md) from the tool contract.  
The engine is **re-run server-side** — the caller's sizing result is never trusted.

### POST response

```json
{ "ok": true, "id": "lzq4abcde", "ref": "BD-2026-4821", "route": "auto", "headline": "IBM FlashSystem 5600 with 6 × 6.6TB FCM5" }
```

Never includes prices.

## Netlify configuration (add to `netlify.toml` in the Blues site repo)

```toml
[build]
  publish = "."
  functions = "netlify/functions"

[[redirects]]
  from = "/e/zw181wz9"
  to = "/e/zw181wz9/index.html"
  status = 200
```

The Blob store `bob-demo-requests` is created automatically on first write (Netlify Blobs v1).

## Rate limits & capacity

- Max 20 POSTs per IP per hour (counters stored in the Blob store under `rl:` keys).
- At most 200 records kept; oldest are pruned automatically.

## Running tests locally

```bash
npm test   # runs engine/tests, agent/tests, and deploy/tests
```

Tests use an in-memory store mock and never hit the network.

## Deploying

Push the Blues site repo with this function included, or copy the files manually:

1. Copy `deploy/netlify/functions/` → `<blues-site-repo>/netlify/functions/`
2. Copy `deploy/netlify/shared/` → `<blues-site-repo>/netlify/shared/`
3. Copy `deploy/site/e/zw181wz9/index.html` → `<blues-site-repo>/e/zw181wz9/index.html`
4. `git push` — Netlify builds and deploys automatically.
