'use strict';

/**
 * scripts/smoke.js
 *
 * In-process smoke test for the Blues Deal Desk server.
 * Starts the app on a free port, runs a short chat conversation,
 * then checks /api/requests. Prints a report and exits.
 *
 * Run: node scripts/smoke.js
 */

const http = require('http');
const crypto = require('crypto');

// ── Start server in-process ───────────────────────────────────────────────────
const app = require('../server.js');

let server;
let PORT;

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      PORT = server.address().port;
      resolve();
    });
    server.once('error', reject);
  });
}

function stopServer() {
  return new Promise((resolve) => server.close(resolve));
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Smoke conversation ────────────────────────────────────────────────────────
async function runSmoke() {
  const sid = 'smoke-' + crypto.randomBytes(4).toString('hex');
  const results = [];
  let pass = 0;
  let fail = 0;

  function check(label, condition, detail) {
    const ok = !!condition;
    results.push({ label, ok, detail });
    if (ok) pass++; else fail++;
  }

  console.log('\nBlues Deal Desk – Smoke Test');
  console.log('='.repeat(50));
  console.log(`Server port: ${PORT}`);
  console.log(`Session:     ${sid}\n`);

  // ── 1. POST /api/chat — first message (company name + email) ──────────────
  let r = await request('POST', '/api/chat', {
    sessionId: sid,
    message: 'Hi, I am from Smoke Test Corp. Email: smoke@test.co.il',
    lang: 'en',
  });
  check('POST /api/chat [1] returns 200', r.status === 200, `status=${r.status}`);
  check('POST /api/chat [1] returns reply', typeof r.body.reply === 'string' && r.body.reply.length > 0, r.body.reply);
  console.log(`[1] reply: ${r.body.reply}`);

  // ── 2. Capacity ───────────────────────────────────────────────────────────
  r = await request('POST', '/api/chat', {
    sessionId: sid,
    message: '40TB effective storage',
    lang: 'en',
  });
  check('POST /api/chat [2] returns 200', r.status === 200, `status=${r.status}`);
  console.log(`[2] state=${r.body.state} reply: ${r.body.reply}`);

  // ── 3. Connectivity ───────────────────────────────────────────────────────
  r = await request('POST', '/api/chat', {
    sessionId: sid,
    message: 'iSCSI 25Gb',
    lang: 'en',
  });
  check('POST /api/chat [3] returns 200', r.status === 200);
  console.log(`[3] state=${r.body.state} reply: ${r.body.reply}`);

  // ── 4. Expert Care ────────────────────────────────────────────────────────
  r = await request('POST', '/api/chat', {
    sessionId: sid,
    message: '5-year Advanced Expert Care',
    lang: 'en',
  });
  check('POST /api/chat [4] returns 200', r.status === 200);
  console.log(`[4] state=${r.body.state} reply: ${r.body.reply}`);

  // ── 5. Navigate to submitted ───────────────────────────────────────────────
  let requestId = null;
  for (let i = 0; i < 8; i++) {
    // Handle new opp state: send 'no' to skip opportunity ID
    const msg = r.body.state === 'opp' ? 'no' : 'yes';
    r = await request('POST', '/api/chat', {
      sessionId: sid,
      message: msg,
      lang: 'en',
    });
    console.log(`[5.${i + 1}] state=${r.body.state} reply: ${r.body.reply}`);
    if (r.body.requestId) {
      requestId = r.body.requestId;
    }
    if (r.body.state === 'submitted') break;
  }

  check('Conversation reaches submitted state', r.body.state === 'submitted', `final state=${r.body.state}`);

  // ── 6. GET /api/requests ─────────────────────────────────────────────────
  const rList = await request('GET', '/api/requests');
  check('GET /api/requests returns 200', rList.status === 200, `status=${rList.status}`);
  check('GET /api/requests returns array', Array.isArray(rList.body), typeof rList.body);
  console.log(`\nGET /api/requests → ${rList.body.length} record(s)`);

  // ── 7. GET /api/requests/:id (if we have one) ─────────────────────────────
  if (!requestId && rList.body.length > 0) {
    requestId = rList.body[0].id;
  }
  if (requestId) {
    const rOne = await request('GET', `/api/requests/${requestId}`);
    check('GET /api/requests/:id returns 200', rOne.status === 200, `status=${rOne.status}`);
    check('GET /api/requests/:id has engineResult', !!rOne.body.engineResult, 'engineResult missing');
    check('GET /api/requests/:id has mockPrice', !!rOne.body.mockPrice, 'mockPrice missing');
    console.log(`GET /api/requests/${requestId} → route=${rOne.body.engineResult && rOne.body.engineResult.route}`);
  }

  // ── 8. GET /api/demo-requests ─────────────────────────────────────────────
  const rDemo = await request('GET', '/api/demo-requests');
  check('GET /api/demo-requests returns 200', rDemo.status === 200);
  check('GET /api/demo-requests returns array with items', Array.isArray(rDemo.body) && rDemo.body.length > 0, `length=${Array.isArray(rDemo.body) ? rDemo.body.length : 'not array'}`);
  console.log(`GET /api/demo-requests → ${rDemo.body.length} demo scenarios`);

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log('Results:');
  for (const { label, ok, detail } of results) {
    const icon = ok ? '✔' : '✘';
    console.log(`  ${icon} ${label}${detail && !ok ? '  [' + detail + ']' : ''}`);
  }
  console.log('='.repeat(50));
  console.log(`PASSED: ${pass}   FAILED: ${fail}`);
  console.log('='.repeat(50));

  return fail;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  await startServer();
  let failures = 0;
  try {
    failures = await runSmoke();
  } finally {
    await stopServer();
  }
  process.exit(failures > 0 ? 1 : 0);
})();
