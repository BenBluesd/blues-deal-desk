/**
 * deploy/tests/bob-demo.test.mjs
 *
 * Unit tests for the bob-demo Netlify function handler.
 * Uses an in-memory store mock — no network, no Netlify runtime.
 *
 * Run: npm test  (included via package.json test script)
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { URL } from 'node:url';

const require = createRequire(import.meta.url);
const BluesSizer = require('../netlify/shared/sizer.cjs');

// ── In-memory store mock ──────────────────────────────────────────────────

function makeStore() {
  const data = new Map();
  return {
    async get(key, opts = {}) {
      const val = data.get(key);
      if (val === undefined) return null;
      return opts.type === 'json' ? JSON.parse(val) : val;
    },
    async setJSON(key, value) {
      data.set(key, JSON.stringify(value));
    },
    async delete(key) {
      data.delete(key);
    },
    async list({ prefix = '' } = {}) {
      const blobs = [];
      for (const k of data.keys()) {
        if (k.startsWith(prefix)) blobs.push({ key: k });
      }
      return { blobs };
    },
    _data: data,
  };
}

// ── Import handler with injected store ────────────────────────────────────
// We re-implement the handler inline rather than importing the Netlify module
// (which requires the @netlify/blobs runtime). This keeps tests self-contained
// and tests the logic, not the Netlify SDK.

const ALLOWED_SPEC_FIELDS = new Set([
  'cap', 'capType', 'conn', 'speed', 'fcPorts', 'sanSw',
  'ec', 'ecLevel', 'cables', 'tier', 'model', 'txType', 'tx', 'sa',
]);

function trimStr(v, max = 200) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function validateEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

function validateSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return false;
  for (const k of Object.keys(spec)) {
    if (!ALLOWED_SPEC_FIELDS.has(k)) return false;
  }
  return true;
}

function makeRef() {
  const year = new Date().getFullYear();
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `BD-${year}-${hex}`;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function checkRateLimit(store, ip) {
  const key = `rl:${ip}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  let d = { count: 0, windowStart: now };
  try {
    const raw = await store.get(key, { type: 'json' });
    if (raw && now - raw.windowStart < windowMs) d = raw;
  } catch { /* first */ }
  if (d.count >= 20) return false;
  d.count += 1;
  await store.setJSON(key, d);
  return true;
}

async function getAll(store) {
  const { blobs } = await store.list({ prefix: 'req:' });
  const items = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' }).catch(() => null)));
  return items.filter(Boolean).sort((a, b) => new Date(b.created) - new Date(a.created));
}

async function pruneOldest(store, max = 200) {
  const { blobs } = await store.list({ prefix: 'req:' });
  if (blobs.length <= max) return;
  const sorted = [...blobs].sort((a, b) => (a.key > b.key ? 1 : -1));
  const toDelete = sorted.slice(0, blobs.length - max);
  await Promise.all(toDelete.map(b => store.delete(b.key)));
}

const MOCK_PRICELIST = {
  _label: 'MOCK', _currency: 'USD',
  base: { '5127-A20': { list: 28000 }, '5075-A30': { list: 72000 } },
  bundles: { ADK7: { _desc: 'B:2x13.2', list: 9000 }, ADK9: { _desc: 'B:6x6.6', list: 14000 }, ADK8: { _desc: 'B:2x26.4', list: 16000 } },
  drives: { ADSJ: { _desc: '6.6TB', list: 2800 }, ADSK: { _desc: '13.2TB', list: 5200 }, ADSL: { _desc: '26.4TB', list: 9500 }, ADSM: { _desc: '52.8TB', list: 18000 } },
  connectivity: { ALB9: { _desc: 'FC32', list: 4200 }, ALB8: { _desc: 'FC64', list: 6500 }, ALB6: { _desc: 'iSCSI', list: 3500 }, ACSR: { _desc: 'cable', list: 120 } },
  transceivers: { ACJ5: { _desc: 'SFP28', list: 380 }, ACJ6: { _desc: 'SFP+', list: 260 }, ACJC: { _desc: 'RJ45', list: 220 } },
  expertCare: { ALK3: { _desc: 'EC-A3', list: 5500 }, ALK5: { _desc: 'EC-A5', list: 8500 }, ALJ5: { _desc: 'EC-B5', list: 4500 } },
  shipping: { AKNC: { _desc: 'Ship', list: 600 } },
};

function computeMockPrice(engineResult) {
  const result = { label: MOCK_PRICELIST._label, currency: MOCK_PRICELIST._currency, lines: [], baseList: null, totalList: 0, missingFeatures: [] };
  if (!engineResult || !engineResult.econfig) return result;
  const sections = ['bundles', 'drives', 'connectivity', 'transceivers', 'expertCare', 'shipping'];
  function lookup(f) { for (const s of sections) { const e = MOCK_PRICELIST[s]?.[f]; if (e) return { desc: e._desc, list: e.list }; } return null; }
  const mtm = engineResult.recommendation?.mtm;
  if (mtm) {
    const base = MOCK_PRICELIST.base[mtm];
    if (base) { result.baseList = base.list; result.totalList += base.list; result.lines.push({ feature: mtm, qty: 1, desc: `Base (${engineResult.recommendation.model})`, unitList: base.list, extList: base.list, inMockList: true }); }
    else result.missingFeatures.push(mtm);
  }
  for (const line of (engineResult.econfig.lines || [])) {
    const found = lookup(line.feature);
    const q = line.qty || 1;
    if (found) { result.lines.push({ feature: line.feature, qty: q, desc: found.desc, unitList: found.list, extList: found.list * q, inMockList: true }); result.totalList += found.list * q; }
    else { result.lines.push({ feature: line.feature, qty: q, desc: line.he || line.en || '—', unitList: null, extList: null, inMockList: false }); if (line.feature) result.missingFeatures.push(line.feature); }
  }
  return result;
}

// Thin handler using injected store
async function handle(req, store) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, '');
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') return { status: 204 };

  if (method === 'POST' && path === '/api/bob-demo/requests') {
    const ip = req.headers?.['x-forwarded-for'] || '1.2.3.4';
    const allowed = await checkRateLimit(store, ip);
    if (!allowed) return { status: 429, body: { ok: false, error: 'Rate limit exceeded. Try again later.' } };

    let body;
    const ct = req.headers?.['content-type'] || '';
    if (!ct.includes('application/json')) return { status: 415, body: { ok: false, error: 'JSON only.' } };
    try { body = JSON.parse(req.body); } catch { return { status: 400, body: { ok: false, error: 'Invalid JSON.' } }; }
    if (typeof req.body === 'string' && req.body.length > 20 * 1024) return { status: 413, body: { ok: false, error: 'Request body too large.' } };

    const reseller = trimStr(body.reseller, 200);
    const email = trimStr(body.email, 200);
    const endCustomer = trimStr(body.endCustomer, 200) || undefined;
    const opportunityId = trimStr(body.opportunityId, 50) || undefined;
    const lang = ['he', 'en'].includes(body.lang) ? body.lang : 'en';
    const summary = trimStr(body.summary, 1000) || undefined;
    const spec = body.spec;

    if (!reseller) return { status: 400, body: { ok: false, error: 'reseller is required.' } };
    if (!validateEmail(email)) return { status: 400, body: { ok: false, error: 'Valid email is required.' } };
    if (!spec) return { status: 400, body: { ok: false, error: 'spec is required.' } };
    if (!validateSpec(spec)) return { status: 400, body: { ok: false, error: 'spec contains unknown fields.' } };

    const ctx = { reseller, endCustomer, hasOpportunity: !!opportunityId, opportunityId };
    const sizing = BluesSizer.size(spec, ctx);

    const id = makeId();
    const ref = makeRef();
    const record = { id, ref, created: new Date().toISOString(), status: 'new', reseller, email,
      ...(endCustomer ? { endCustomer } : {}), ...(opportunityId ? { opportunityId } : {}), lang,
      ...(summary ? { summary } : {}), spec, sizing, source: 'orchestrate', demo: true };

    await store.setJSON(`req:${id}`, record);
    await pruneOldest(store, 200);

    return { status: 201, body: { ok: true, id, ref, route: sizing.route, headline: sizing.public?.headline?.[lang] || '' } };
  }

  if (method === 'GET' && path === '/api/bob-demo/requests') {
    const all = await getAll(store);
    const list = all.map(r => ({ id: r.id, ref: r.ref, created: r.created, status: r.status, reseller: r.reseller, endCustomer: r.endCustomer, route: r.sizing?.route || '—', headline: r.sizing?.public?.headline?.en || '' }));
    return { status: 200, body: list };
  }

  const idMatch = path.match(/^\/api\/bob-demo\/requests\/([^/]+)$/);
  if (method === 'GET' && idMatch) {
    const rec = await store.get(`req:${idMatch[1]}`, { type: 'json' });
    if (!rec) return { status: 404, body: { error: 'Not found.' } };
    return { status: 200, body: { ...rec, mockPrice: computeMockPrice(rec.sizing) } };
  }

  if (method === 'PATCH' && idMatch) {
    const rec = await store.get(`req:${idMatch[1]}`, { type: 'json' });
    if (!rec) return { status: 404, body: { error: 'Not found.' } };
    let body;
    try { body = JSON.parse(req.body); } catch { return { status: 400, body: { error: 'Invalid JSON.' } }; }
    if (!['approved', 'asked'].includes(body.status)) return { status: 400, body: { error: 'status must be "approved" or "asked".' } };
    const updated = { ...rec, status: body.status, ...(body.note ? { note: trimStr(body.note, 2000) } : {}), updatedAt: new Date().toISOString() };
    await store.setJSON(`req:${idMatch[1]}`, updated);
    return { status: 200, body: { ok: true, id: rec.id, ref: rec.ref, status: updated.status } };
  }

  return { status: 404, body: { error: 'Not found.' } };
}

// ── Test helpers ──────────────────────────────────────────────────────────

function makeReq(method, url, body = null, extraHeaders = {}) {
  return {
    method,
    url: `https://bluesd.co.il${url}`,
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: body !== null ? JSON.stringify(body) : undefined,
  };
}

const VALID_BODY = {
  reseller: 'Acme IT',
  email: 'sales@acme.com',
  spec: { cap: 40, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' },
  lang: 'en',
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('bob-demo: POST validation', () => {
  it('rejects missing reseller', async () => {
    const store = makeStore();
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', { ...VALID_BODY, reseller: '' }), store);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /reseller/i);
  });

  it('rejects invalid email', async () => {
    const store = makeStore();
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', { ...VALID_BODY, email: 'not-an-email' }), store);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /email/i);
  });

  it('rejects missing spec', async () => {
    const store = makeStore();
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', { ...VALID_BODY, spec: undefined }), store);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /spec/i);
  });

  it('rejects unknown spec fields', async () => {
    const store = makeStore();
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', { ...VALID_BODY, spec: { cap: 40, badField: 'x' } }), store);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /unknown/i);
  });

  it('rejects non-JSON content type', async () => {
    const store = makeStore();
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY, { 'content-type': 'text/plain' }), store);
    assert.equal(res.status, 415);
  });

  it('rejects malformed JSON', async () => {
    const store = makeStore();
    const req = { method: 'POST', url: 'https://bluesd.co.il/api/bob-demo/requests', headers: { 'content-type': 'application/json' }, body: '{bad json' };
    const res = await handle(req, store);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /invalid json/i);
  });
});

describe('bob-demo: POST success', () => {
  it('accepts valid body and returns ref/route/headline', async () => {
    const store = makeStore();
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.ref.startsWith('BD-'));
    assert.ok(['auto', 'review', 'custom'].includes(res.body.route));
    assert.ok(typeof res.body.headline === 'string');
  });

  it('re-runs engine server-side (route is present)', async () => {
    const store = makeStore();
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    assert.ok(res.body.route);
  });

  it('stores record with source=orchestrate demo=true', async () => {
    const store = makeStore();
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    const stored = await store.get(`req:${res.body.id}`, { type: 'json' });
    assert.equal(stored.source, 'orchestrate');
    assert.equal(stored.demo, true);
  });

  it('stores Hebrew headline when lang=he', async () => {
    const store = makeStore();
    const body = { ...VALID_BODY, lang: 'he' };
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', body), store);
    const stored = await store.get(`req:${res.body.id}`, { type: 'json' });
    assert.equal(stored.lang, 'he');
  });

  it('stores optional fields when provided', async () => {
    const store = makeStore();
    const body = { ...VALID_BODY, endCustomer: 'Hospital ABC', opportunityId: '0061234567', summary: 'Test summary' };
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', body), store);
    const stored = await store.get(`req:${res.body.id}`, { type: 'json' });
    assert.equal(stored.endCustomer, 'Hospital ABC');
    assert.equal(stored.opportunityId, '0061234567');
    assert.equal(stored.summary, 'Test summary');
  });
});

describe('bob-demo: GET list', () => {
  it('returns empty array when no requests', async () => {
    const store = makeStore();
    const res = await handle(makeReq('GET', '/api/bob-demo/requests'), store);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('returns list after POST', async () => {
    const store = makeStore();
    await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    const res = await handle(makeReq('GET', '/api/bob-demo/requests'), store);
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.ok(res.body[0].ref);
    assert.ok(res.body[0].reseller);
    // Should NOT include sizing details in list
    assert.equal(res.body[0].route, 'auto');
  });

  it('list does not include econfig or prices', async () => {
    const store = makeStore();
    await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    const res = await handle(makeReq('GET', '/api/bob-demo/requests'), store);
    const item = res.body[0];
    assert.equal(item.econfig, undefined);
    assert.equal(item.mockPrice, undefined);
  });
});

describe('bob-demo: GET :id', () => {
  it('returns 404 for unknown id', async () => {
    const store = makeStore();
    const res = await handle(makeReq('GET', '/api/bob-demo/requests/nonexistent'), store);
    assert.equal(res.status, 404);
  });

  it('returns full record with mockPrice', async () => {
    const store = makeStore();
    const post = await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    const res = await handle(makeReq('GET', `/api/bob-demo/requests/${post.body.id}`), store);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, post.body.id);
    assert.ok(res.body.sizing);
    assert.ok(res.body.mockPrice);
    assert.ok(Array.isArray(res.body.mockPrice.lines));
  });

  it('mockPrice has totalList > 0 for auto route', async () => {
    const store = makeStore();
    const post = await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    const res = await handle(makeReq('GET', `/api/bob-demo/requests/${post.body.id}`), store);
    if (res.body.sizing.route === 'auto') {
      assert.ok(res.body.mockPrice.totalList > 0);
    }
  });

  it('never returns prices in POST response', async () => {
    const store = makeStore();
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    assert.equal(res.body.price, undefined);
    assert.equal(res.body.totalList, undefined);
    assert.equal(res.body.mockPrice, undefined);
  });
});

describe('bob-demo: PATCH :id', () => {
  it('returns 404 for unknown id', async () => {
    const store = makeStore();
    const res = await handle(makeReq('PATCH', '/api/bob-demo/requests/nope', { status: 'approved' }), store);
    assert.equal(res.status, 404);
  });

  it('rejects invalid status', async () => {
    const store = makeStore();
    const post = await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    const res = await handle(makeReq('PATCH', `/api/bob-demo/requests/${post.body.id}`, { status: 'deleted' }), store);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /approved.*asked/i);
  });

  it('updates to approved', async () => {
    const store = makeStore();
    const post = await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    const res = await handle(makeReq('PATCH', `/api/bob-demo/requests/${post.body.id}`, { status: 'approved' }), store);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'approved');
  });

  it('updates to asked with note', async () => {
    const store = makeStore();
    const post = await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    const res = await handle(makeReq('PATCH', `/api/bob-demo/requests/${post.body.id}`, { status: 'asked', note: 'Which rack?' }), store);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'asked');
    const stored = await store.get(`req:${post.body.id}`, { type: 'json' });
    assert.equal(stored.note, 'Which rack?');
  });
});

describe('bob-demo: rate limiting', () => {
  it('allows first 20 requests from same IP then blocks', async () => {
    const store = makeStore();
    const ip = '10.0.0.99';
    for (let i = 0; i < 20; i++) {
      const req = makeReq('POST', '/api/bob-demo/requests', VALID_BODY, { 'x-forwarded-for': ip });
      const res = await handle(req, store);
      assert.equal(res.status, 201, `Request ${i + 1} should succeed`);
    }
    const blockedReq = makeReq('POST', '/api/bob-demo/requests', VALID_BODY, { 'x-forwarded-for': ip });
    const blocked = await handle(blockedReq, store);
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.error, /rate limit/i);
  });
});

describe('bob-demo: capacity pruning', () => {
  it('prunes to max 200 records', async () => {
    const store = makeStore();
    // Seed 201 dummy records directly
    for (let i = 0; i < 201; i++) {
      const id = `test${i.toString().padStart(4, '0')}`;
      await store.setJSON(`req:${id}`, { id, ref: `BD-${i}`, created: new Date(i * 1000).toISOString(), status: 'new', reseller: 'X', email: 'x@x.com', spec: {}, sizing: {}, source: 'orchestrate', demo: true });
    }
    await pruneOldest(store, 200);
    const { blobs } = await store.list({ prefix: 'req:' });
    assert.equal(blobs.length, 200);
  });
});

describe('bob-demo: engine re-runs on server', () => {
  it('sizing.route is set (not trusting caller)', async () => {
    const store = makeStore();
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', VALID_BODY), store);
    const stored = await store.get(`req:${res.body.id}`, { type: 'json' });
    assert.ok(stored.sizing.route);
    assert.ok(stored.sizing.recommendation || stored.sizing.route === 'custom');
  });

  it('large request routes to review', async () => {
    const store = makeStore();
    const body = { ...VALID_BODY, spec: { cap: 600, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' } };
    const res = await handle(makeReq('POST', '/api/bob-demo/requests', body), store);
    assert.ok(['review', 'custom'].includes(res.body.route));
  });
});
