'use strict';

/**
 * server.js
 *
 * Main Express server. Serves static web/ and the API:
 *   POST  /api/size
 *   POST  /api/chat
 *   GET   /api/requests
 *   GET   /api/requests/:id
 *   POST  /api/requests/:id/action
 *   GET   /api/demo-requests  (read-only, for the chat demo button)
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const { router: engineRouter } = require('./engine/index.js');
const { handleTurn, getSession } = require('./agent/loop.js');

const app = express();
app.use(express.json());

// ── Static web files ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'web')));

// ── Engine router ─────────────────────────────────────────────────────────────
app.use('/api', engineRouter());

// ── Requests store helpers ────────────────────────────────────────────────────
const REQUESTS_FILE = path.join(__dirname, 'data', 'requests.json');

function loadRequests() {
  if (!fs.existsSync(REQUESTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveRequests(list) {
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

// ── Chat endpoint ─────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, lang } = req.body || {};
  if (!sessionId || typeof message !== 'string') {
    return res.status(400).json({ error: 'Body must contain sessionId and message.' });
  }
  try {
    const result = await handleTurn(sessionId, message, lang || 'en');
    // If the turn produced a submitted request, persist it
    if (result.requestId) {
      const requests = loadRequests();
      const session = getSession(sessionId);
      requests.unshift(session.savedRequest);
      saveRequests(requests);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Demo requests (read-only) ─────────────────────────────────────────────────
app.get('/api/demo-requests', (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'data', 'demo-requests.json'), 'utf8');
    res.json(JSON.parse(data));
  } catch {
    res.json([]);
  }
});

// ── Request list ──────────────────────────────────────────────────────────────
app.get('/api/requests', (req, res) => {
  res.json(loadRequests());
});

// ── Single request ────────────────────────────────────────────────────────────
app.get('/api/requests/:id', (req, res) => {
  const requests = loadRequests();
  const record = requests.find(r => r.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found.' });
  res.json(record);
});

// ── Action on request ─────────────────────────────────────────────────────────
app.post('/api/requests/:id/action', (req, res) => {
  const { action, note, spec } = req.body || {};
  if (!['approve', 'ask', 'edit'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve, ask, or edit.' });
  }
  const requests = loadRequests();
  const idx = requests.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found.' });

  const record = requests[idx];

  if (action === 'approve') {
    record.status = 'approved';
    record.approvedAt = new Date().toISOString();
  } else if (action === 'ask') {
    record.status = 'pending-reseller';
    record.deskNote = note || '';
    record.history = record.history || [];
    record.history.push({ ts: new Date().toISOString(), actor: 'salesperson', action: 'ask', note: note || '' });
  } else if (action === 'edit') {
    if (spec && typeof spec === 'object') {
      const { size } = require('./engine/index.js');
      const newResult = size(spec, record.ctx || {});
      const { computePrice } = require('./agent/price.js');
      record.spec = spec;
      record.engineResult = newResult;
      record.mockPrice = computePrice(newResult);
      record.status = 'edited';
      record.history = record.history || [];
      record.history.push({ ts: new Date().toISOString(), actor: 'salesperson', action: 'edit' });
    }
  }

  requests[idx] = record;
  saveRequests(requests);
  res.json(record);
});

// ── Start server (only when run directly, not required as module) ─────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Blues Deal Desk listening on http://localhost:${PORT}`);
    console.log(`  Reseller chat: http://localhost:${PORT}/`);
    console.log(`  Salesperson desk: http://localhost:${PORT}/desk.html`);
  });
}

module.exports = app;
