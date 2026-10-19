'use strict';

/**
 * agent/tests/extract-watsonx.test.js
 *
 * Unit tests for agent/extract-granite.js (chat API path).
 * All network calls are mocked via global.fetch — no real keys needed.
 *
 * Run: node --test agent/tests/extract-watsonx.test.js
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a minimal fetch mock that returns the given responses in order.
 * Each entry: { status, body } where body is an object (will be JSON-serialised).
 */
function makeFetch(responses) {
  let call = 0;
  return async function mockFetch(_url, _opts) {
    const { status, body } = responses[call++] || { status: 500, body: {} };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
}

/** Successful IAM token response */
function iamOk() {
  return { status: 200, body: { access_token: 'tok-test', expires_in: 3600 } };
}

/** Successful chat API response wrapping the given JSON string */
function chatOk(jsonContent) {
  return {
    status: 200,
    body: {
      choices: [{ message: { content: jsonContent } }],
    },
  };
}

// ── env helpers ────────────────────────────────────────────────────────────────

let savedEnv = {};

function setEnv(vars) {
  for (const [k, v] of Object.entries(vars)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
}

function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  savedEnv = {};
}

// ── Module cache refresh ───────────────────────────────────────────────────────
// Re-require the module fresh in each test so env changes take effect and
// the IAM token cache is reset.
function freshExtract() {
  // Clear the module from require cache
  const key = require.resolve('../extract-granite.js');
  delete require.cache[key];
  return require('../extract-granite.js');
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('extract-granite (chat API)', () => {

  afterEach(() => {
    restoreEnv();
    // Restore any fetch mock
    if (global.__origFetch !== undefined) {
      global.fetch = global.__origFetch;
      delete global.__origFetch;
    }
  });

  it('1. Falls back to rule-based extractor when keys are not set', async () => {
    // Ensure the required vars are absent
    setEnv({ WATSONX_APIKEY: '', WATSONX_PROJECT_ID: '' });

    const { extract } = freshExtract();
    const result = await extract('We need 40TB effective FC 32Gb 5 years Advanced', {});

    // Fallback extractor should have picked up cap and ecLevel at minimum
    assert.equal(result.cap, 40, 'fallback should extract cap');
    assert.equal(result.ecLevel, 'Advanced', 'fallback should extract ecLevel');
  });

  it('2. Valid chat reply is parsed; unknown fields and bad enum values are dropped', async () => {
    setEnv({ WATSONX_APIKEY: 'test-key', WATSONX_PROJECT_ID: 'proj-1' });

    global.__origFetch = global.fetch;
    global.fetch = makeFetch([
      iamOk(),
      chatOk(JSON.stringify({
        cap: 80,
        capType: 'effective',
        conn: 'fc32',
        sanSw: 'has',
        ec: 5,
        ecLevel: 'Advanced',
        // unknown field — must be dropped
        unknownField: 'drop-me',
        // bad enum value — must be dropped
        capType_bad: 'effective',   // not a known key, also dropped
        speed: 'bad-speed-value',   // bad enum
        _email: 'test@example.com',
      })),
    ]);

    const { extract } = freshExtract();
    const result = await extract('We need 80TB', {});

    assert.equal(result.cap, 80);
    assert.equal(result.capType, 'effective');
    assert.equal(result.conn, 'fc32');
    assert.equal(result.sanSw, 'has');
    assert.equal(result.ec, 5);
    assert.equal(result.ecLevel, 'Advanced');
    assert.equal(result._email, 'test@example.com');

    // Must not contain unknown field
    assert.equal(result.unknownField, undefined, 'unknown field must be dropped');
    // speed had a bad value — must be absent
    assert.equal(result.speed, undefined, 'bad enum value must be dropped');
  });

  it('3. HTTP 400 triggers exactly one retry without response_format', async () => {
    setEnv({ WATSONX_APIKEY: 'test-key', WATSONX_PROJECT_ID: 'proj-1' });

    const chatCalls = [];
    global.__origFetch = global.fetch;
    global.fetch = async function trackingFetch(url, opts) {
      // IAM call
      if (url.includes('iam.cloud.ibm.com')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      }
      // Chat calls — record them
      const body = opts && opts.body ? JSON.parse(opts.body) : {};
      chatCalls.push({ hasResponseFormat: 'response_format' in body });

      if (chatCalls.length === 1) {
        // First chat call → 400
        return { ok: false, status: 400, json: async () => ({}) };
      }
      // Second chat call (retry) → 200
      return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: '{"cap":50,"capType":"usable"}' } }] }),
      };
    };

    const { extract } = freshExtract();
    const result = await extract('50TB usable', {});

    assert.equal(chatCalls.length, 2, 'should have made exactly 2 chat calls (original + retry)');
    assert.equal(chatCalls[0].hasResponseFormat, true, 'first call must include response_format');
    assert.equal(chatCalls[1].hasResponseFormat, false, 'retry must NOT include response_format');
    assert.equal(result.cap, 50, 'result from retry should be used');
    assert.equal(result.capType, 'usable');
  });

  it('4. Network error falls back to rule-based extractor', async () => {
    setEnv({ WATSONX_APIKEY: 'test-key', WATSONX_PROJECT_ID: 'proj-1' });

    global.__origFetch = global.fetch;
    global.fetch = async function failingFetch(url) {
      if (url.includes('iam.cloud.ibm.com')) {
        throw new Error('Network unreachable');
      }
      throw new Error('Network unreachable');
    };

    const { extract } = freshExtract();
    // Fallback should still parse what it can from the text
    const result = await extract('Need 30TB raw iSCSI 3 years Basic', {});

    assert.equal(result.cap, 30, 'fallback should extract cap on network error');
    assert.equal(result.capType, 'raw', 'fallback should extract capType on network error');
    assert.equal(result.ec, 3, 'fallback should extract ec on network error');
  });

});
