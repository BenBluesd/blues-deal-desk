/**
 * deploy/netlify/functions/bob-demo.mjs
 *
 * Netlify Functions v2 – Blues Demo API
 * Routes:
 *   POST   /api/bob-demo/requests
 *   GET    /api/bob-demo/requests
 *   GET    /api/bob-demo/requests/:id
 *   PATCH  /api/bob-demo/requests/:id
 */

import { getStore } from '@netlify/blobs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const BluesSizer = require('../shared/sizer.cjs');

// ── MOCK pricelist (MOCK – demo only) ───────────────────────────────────────
const MOCK_PRICELIST = {
  _label: 'MOCK – demo only. All prices are invented round numbers for demonstration purposes.',
  _currency: 'USD',
  base: {
    '5127-A20': { _name: 'FlashSystem 5600 base unit', list: 28000 },
    '5075-A30': { _name: 'FlashSystem 7600 base unit', list: 72000 },
  },
  bundles: {
    ADK7: { _desc: 'Value Bundle: 2 × 13.2TB FCM5 (FS5600)', list: 9000 },
    ADK9: { _desc: 'Value Bundle: 6 × 6.6TB FCM5 (FS5600)', list: 14000 },
    ADK8: { _desc: 'Value Bundle: 2 × 26.4TB FCM5 (FS5600)', list: 16000 },
  },
  drives: {
    ADSJ: { _desc: 'FCM5 6.6TB (FS5600, no bundle)', list: 2800 },
    ADSK: { _desc: 'FCM5 13.2TB (FS5600, no bundle)', list: 5200 },
    ADSL: { _desc: 'FCM5 26.4TB (FS5600, no bundle)', list: 9500 },
    ADSM: { _desc: 'FCM5 52.8TB (FS5600, no bundle)', list: 18000 },
  },
  connectivity: {
    ALB9: { _desc: 'FC 32Gb adapter pair (8 ports, FS5600)', list: 4200 },
    ALB8: { _desc: 'FC 64Gb adapter pair (FS5600)', list: 6500 },
    ALB6: { _desc: '25/10GbE iSCSI adapter pair (4 ports, FS5600)', list: 3500 },
    ACSR: { _desc: 'OM3 FC cable 5m (per cable)', list: 120 },
  },
  transceivers: {
    ACJ5: { _desc: '25GbE SW SFP28 transceiver', list: 380 },
    ACJ6: { _desc: '10GbE SW SFP+ transceiver', list: 260 },
    ACJC: { _desc: '10GbE SFP+ RJ45 transceiver', list: 220 },
  },
  expertCare: {
    ALK3: { _desc: 'Expert Care Advanced 3Y (FS5600)', list: 5500 },
    ALK5: { _desc: 'Expert Care Advanced 5Y (FS5600)', list: 8500 },
    ALJ5: { _desc: 'Expert Care Basic 5Y (FS5600)', list: 4500 },
  },
  shipping: {
    AKNC: { _desc: 'Premium Shipping', list: 600 },
  },
};

// ── Allowed spec fields (tool contract) ────────────────────────────────────
const ALLOWED_SPEC_FIELDS = new Set([
  'cap', 'capType', 'conn', 'speed', 'fcPorts', 'sanSw',
  'ec', 'ecLevel', 'cables', 'tier', 'model', 'txType', 'tx', 'sa',
]);

// ── Helpers ────────────────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function makeRef() {
  const year = new Date().getFullYear();
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `BD-${year}-${hex}`;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

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

// MOCK price computation (mirrors agent/price.js logic)
function computeMockPrice(engineResult) {
  const result = { label: MOCK_PRICELIST._label, currency: MOCK_PRICELIST._currency, lines: [], baseList: null, totalList: 0, missingFeatures: [] };
  if (!engineResult || !engineResult.econfig) return result;

  const mtm = engineResult.recommendation && engineResult.recommendation.mtm;
  if (mtm) {
    const base = MOCK_PRICELIST.base[mtm];
    if (base) {
      result.baseList = base.list;
      result.totalList += base.list;
      result.lines.push({ feature: mtm, qty: 1, desc: `Base unit (${engineResult.recommendation.model})`, unitList: base.list, extList: base.list, inMockList: true });
    } else {
      result.missingFeatures.push(mtm);
    }
  }

  const sections = ['bundles', 'drives', 'connectivity', 'transceivers', 'expertCare', 'shipping'];
  function lookupFeature(feature) {
    for (const s of sections) {
      const e = MOCK_PRICELIST[s] && MOCK_PRICELIST[s][feature];
      if (e) return { desc: e._desc, list: e.list };
    }
    return null;
  }

  for (const line of (engineResult.econfig.lines || [])) {
    const { feature, qty } = line;
    const found = lookupFeature(feature);
    const q = qty || 1;
    if (found) {
      const ext = found.list * q;
      result.lines.push({ feature, qty: q, desc: found.desc, unitList: found.list, extList: ext, inMockList: true });
      result.totalList += ext;
    } else {
      result.lines.push({ feature, qty: q, desc: line.he || line.en || '—', unitList: null, extList: null, inMockList: false });
      if (feature) result.missingFeatures.push(feature);
    }
  }
  return result;
}

// ── Rate limiter ────────────────────────────────────────────────────────────
async function checkRateLimit(store, ip) {
  const key = `rl:${ip}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  let data = { count: 0, windowStart: now };
  try {
    const raw = await store.get(key, { type: 'json' });
    if (raw && now - raw.windowStart < windowMs) {
      data = raw;
    }
  } catch { /* first request from this IP */ }
  if (data.count >= 20) return false;
  data.count += 1;
  await store.setJSON(key, data, { ttl: 3600 });
  return true;
}

// ── Capacity management ─────────────────────────────────────────────────────
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

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, '');
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const store = getStore('bob-demo-requests');

  // POST /api/bob-demo/requests
  if (method === 'POST' && path === '/api/bob-demo/requests') {
    // Rate limit
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const allowed = await checkRateLimit(store, ip);
    if (!allowed) return json({ ok: false, error: 'Rate limit exceeded. Try again later.' }, 429);

    let body;
    try {
      const text = await req.text();
      if (text.length > 20 * 1024) return json({ ok: false, error: 'Request body too large.' }, 413);
      if (!req.headers.get('content-type')?.includes('application/json')) return json({ ok: false, error: 'JSON only.' }, 415);
      body = JSON.parse(text);
    } catch {
      return json({ ok: false, error: 'Invalid JSON.' }, 400);
    }

    const reseller = trimStr(body.reseller, 200);
    const email = trimStr(body.email, 200);
    const endCustomer = trimStr(body.endCustomer, 200) || undefined;
    const opportunityId = trimStr(body.opportunityId, 50) || undefined;
    const lang = ['he', 'en'].includes(body.lang) ? body.lang : 'en';
    const summary = trimStr(body.summary, 1000) || undefined;
    const spec = body.spec;

    if (!reseller) return json({ ok: false, error: 'reseller is required.' }, 400);
    if (!validateEmail(email)) return json({ ok: false, error: 'Valid email is required.' }, 400);
    if (!spec) return json({ ok: false, error: 'spec is required.' }, 400);
    if (!validateSpec(spec)) return json({ ok: false, error: 'spec contains unknown fields.' }, 400);

    // Re-run engine on server — never trust caller's result
    const ctx = { reseller, endCustomer, hasOpportunity: !!opportunityId, opportunityId };
    const sizing = BluesSizer.size(spec, ctx);

    const id = makeId();
    const ref = makeRef();
    const record = {
      id, ref,
      created: new Date().toISOString(),
      status: 'new',
      reseller, email,
      ...(endCustomer ? { endCustomer } : {}),
      ...(opportunityId ? { opportunityId } : {}),
      lang,
      ...(summary ? { summary } : {}),
      spec,
      sizing,
      source: 'orchestrate',
      demo: true,
    };

    await store.setJSON(`req:${id}`, record);
    await pruneOldest(store, 200);

    return json({
      ok: true,
      id,
      ref,
      route: sizing.route,
      headline: sizing.public?.headline?.[lang] || sizing.public?.headline?.en || '',
    }, 201);
  }

  // GET /api/bob-demo/requests
  if (method === 'GET' && path === '/api/bob-demo/requests') {
    const all = await getAll(store);
    const list = all.map(r => ({
      id: r.id,
      ref: r.ref,
      created: r.created,
      status: r.status,
      reseller: r.reseller,
      endCustomer: r.endCustomer,
      route: r.sizing?.route || '—',
      headline: r.sizing?.public?.headline?.en || '',
    }));
    return json(list);
  }

  // GET /api/bob-demo/requests/:id
  const idMatch = path.match(/^\/api\/bob-demo\/requests\/([^/]+)$/);
  if (method === 'GET' && idMatch) {
    const rec = await store.get(`req:${idMatch[1]}`, { type: 'json' });
    if (!rec) return json({ error: 'Not found.' }, 404);
    const mockPrice = computeMockPrice(rec.sizing);
    // Public demo endpoint: never expose the full contact email
    const maskedEmail = typeof rec.email === 'string'
      ? rec.email.replace(/^(.)[^@]*(@.*)$/, '$1***$2')
      : rec.email;
    return json({ ...rec, email: maskedEmail, mockPrice });
  }

  // PATCH /api/bob-demo/requests/:id
  if (method === 'PATCH' && idMatch) {
    const rec = await store.get(`req:${idMatch[1]}`, { type: 'json' });
    if (!rec) return json({ error: 'Not found.' }, 404);

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON.' }, 400);
    }

    const validStatuses = ['approved', 'asked'];
    if (!validStatuses.includes(body.status)) return json({ error: 'status must be "approved" or "asked".' }, 400);

    const updated = {
      ...rec,
      status: body.status,
      ...(body.note ? { note: trimStr(body.note, 2000) } : {}),
      updatedAt: new Date().toISOString(),
    };
    await store.setJSON(`req:${idMatch[1]}`, updated);
    return json({ ok: true, id: rec.id, ref: rec.ref, status: updated.status });
  }

  return json({ error: 'Not found.' }, 404);
}

export const config = {
  path: ['/api/bob-demo/requests', '/api/bob-demo/requests/*'],
};
