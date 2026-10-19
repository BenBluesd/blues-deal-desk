'use strict';

/**
 * agent/tests/loop.test.js
 *
 * Full conversation tests for the agent loop — no API key required.
 * Two end-to-end conversations: one in Hebrew, one in English.
 *
 * Run: node --test agent/tests/loop.test.js
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// Load the loop (fallback extractor is used — no key needed)
const { handleTurn, getSession } = require('../loop.js');

function newId() {
  return 'test-' + crypto.randomBytes(4).toString('hex');
}

// ── Hebrew conversation ────────────────────────────────────────────────────────

describe('Hebrew conversation: end-to-end submit', () => {
  const sid = newId();
  const turns = [];

  async function turn(msg) {
    const r = await handleTurn(sid, msg, 'he');
    turns.push(r);
    return r;
  }

  it('turn 1: greeting with company name + email → identify or advance', async () => {
    const r = await turn('שלום, אני מחברת נגב דאטה. האימייל שלי הוא demo@negev.co.il');
    assert.ok(r.reply, 'Expected a reply');
    assert.ok(['identify', 'gather'].includes(r.state), `Unexpected state: ${r.state}`);
  });

  it('turn 2: capacity in Hebrew "40 טרה אפקטיבי"', async () => {
    const r = await turn('אנחנו צריכים 40 טרה אפקטיבי');
    assert.ok(r.reply);
    // state should still be gather (more info needed)
    assert.ok(['gather', 'confirm'].includes(r.state));
    const spec = getSession(sid).spec;
    assert.equal(spec.cap, 40);
    assert.equal(spec.capType, 'effective');
  });

  it('turn 3: iSCSI connectivity', async () => {
    const r = await turn('חיבור iSCSI 25Gb');
    assert.ok(r.reply);
    const spec = getSession(sid).spec;
    assert.equal(spec.conn, 'iscsi25');
  });

  it('turn 4: Expert Care 5 years Advanced', async () => {
    const r = await turn('5 שנות Expert Care Advanced');
    assert.ok(r.reply);
    const spec = getSession(sid).spec;
    assert.equal(spec.ec, 5);
    assert.equal(spec.ecLevel, 'Advanced');
  });

  it('turn 5: skip opportunity ID', async () => {
    // At this point we might be in confirm state; handle either
    const session = getSession(sid);
    let r;
    if (session.state === 'gather') {
      // Engine may still have questions — keep answering until confirm
      r = await turn('אין מספר הזדמנות');
    } else {
      r = await turn('כן, שלח');
    }
    assert.ok(r.reply);
  });

  it('eventually reaches submitted state', async () => {
    // Navigate through confirm → opp → submitted
    let attempts = 0;
    let r;
    while (getSession(sid).state !== 'submitted' && attempts < 10) {
      const st = getSession(sid).state;
      if (st === 'opp') {
        r = await turn('לא'); // skip opportunity ID
      } else {
        r = await turn('כן');
      }
      attempts++;
    }
    assert.equal(getSession(sid).state, 'submitted', 'Expected submitted state');
    // The last reply should contain a request ID
    const lastReply = getSession(sid).conversation.at(-1)?.text || '';
    assert.ok(/REQ-/i.test(lastReply) || r?.requestId, 'Expected request ID in reply or response');
  });

  it('saved request has correct spec fields', () => {
    const saved = getSession(sid).savedRequest;
    assert.ok(saved, 'Expected a saved request');
    assert.equal(saved.spec.cap, 40);
    assert.equal(saved.spec.capType, 'effective');
    assert.equal(saved.spec.conn, 'iscsi25');
    assert.equal(saved.spec.ec, 5);
    assert.equal(saved.spec.ecLevel, 'Advanced');
  });

  it('saved request has engineResult and mockPrice', () => {
    const saved = getSession(sid).savedRequest;
    assert.ok(saved.engineResult, 'Expected engineResult');
    assert.ok(saved.mockPrice, 'Expected mockPrice');
    assert.ok(saved.mockPrice.totalList > 0, 'Expected positive mock price total');
  });

  it('conversation log is non-empty', () => {
    const saved = getSession(sid).savedRequest;
    assert.ok(saved.conversation && saved.conversation.length >= 2, 'Expected conversation entries');
  });
});

// ── English conversation ───────────────────────────────────────────────────────

describe('English conversation: end-to-end submit', () => {
  const sid = newId();

  async function turn(msg) {
    return handleTurn(sid, msg, 'en');
  }

  it('turn 1: company name and email', async () => {
    const r = await turn('Hi, I am from Galilee Networks. Email: info@galileenet.co.il');
    assert.ok(r.reply);
    assert.ok(['identify', 'gather'].includes(r.state));
  });

  it('turn 2: 50TB raw FC 32Gb', async () => {
    const r = await turn('We need 50TB raw storage with FC 32Gb');
    assert.ok(r.reply);
    const spec = getSession(sid).spec;
    assert.equal(spec.cap, 50);
    assert.equal(spec.capType, 'raw');
    assert.equal(spec.conn, 'fc32');
  });

  it('turn 3: SAN switch answer', async () => {
    const r = await turn('They have existing SAN switches');
    assert.ok(r.reply);
    const spec = getSession(sid).spec;
    assert.equal(spec.sanSw, 'has');
  });

  it('turn 4: Expert Care 5 years Basic', async () => {
    const r = await turn('5-year Basic Expert Care');
    assert.ok(r.reply);
    const spec = getSession(sid).spec;
    assert.equal(spec.ec, 5);
    assert.equal(spec.ecLevel, 'Basic');
  });

  it('eventually reaches submitted state', async () => {
    let attempts = 0;
    while (getSession(sid).state !== 'submitted' && attempts < 10) {
      const st = getSession(sid).state;
      if (st === 'opp') {
        await turn('no'); // skip opportunity ID
      } else {
        await turn('yes');
      }
      attempts++;
    }
    assert.equal(getSession(sid).state, 'submitted');
  });

  it('saved request is in English', () => {
    const saved = getSession(sid).savedRequest;
    assert.ok(saved);
    assert.equal(saved.lang, 'en');
  });

  it('saved request has reseller from context', () => {
    const saved = getSession(sid).savedRequest;
    assert.ok(saved.reseller, 'Expected reseller name');
  });
});
