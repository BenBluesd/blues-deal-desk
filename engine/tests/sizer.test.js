'use strict';

/**
 * engine/tests/sizer.test.js
 *
 * Unit tests for the engine wrapper using Node.js built-in test runner.
 * Run: node --test engine/tests/sizer.test.js
 *
 * All company names are invented. No real client data.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { size, normalize } = require('../index.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Assert a result has a recommendation and econfig (i.e. the engine sized it). */
function assertSized(result) {
  assert.ok(result.recommendation, 'Expected a recommendation');
  assert.ok(result.econfig, 'Expected an econfig');
  assert.ok(Array.isArray(result.econfig.lines) && result.econfig.lines.length > 0, 'Expected econfig lines');
}

/** Assert the econfig lines contain a feature code. */
function assertFeature(result, feature) {
  const found = result.econfig.lines.some(l => l.feature === feature);
  assert.ok(found, `Expected feature ${feature} in econfig lines: ${JSON.stringify(result.econfig.lines.map(l => l.feature))}`);
}

// ── Scenario 1: Routine iSCSI 25GbE — FS5600 ────────────────────────────────

describe('Scenario 1 – Routine iSCSI 25GbE', () => {
  const ctx = { reseller: 'Negev Data Systems', endCustomer: 'Arava Cloud Services', hasOpportunity: false };
  const spec = { cap: 40, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' };

  it('routes to auto', () => {
    const res = size(spec, ctx);
    assert.equal(res.route, 'auto');
  });

  it('recommends FS5600', () => {
    const res = size(spec, ctx);
    assertSized(res);
    assert.equal(res.recommendation.model, 'FlashSystem 5600');
  });

  it('includes iSCSI adapter feature ALB6', () => {
    const res = size(spec, ctx);
    assertFeature(res, 'ALB6');
  });

  it('includes shipping feature AKNC', () => {
    const res = size(spec, ctx);
    assertFeature(res, 'AKNC');
  });

  it('reseller name appears in econfig name', () => {
    const res = size(spec, ctx);
    assert.ok(res.econfig.name.includes('Negev Data Systems'), 'Expected reseller in econfig name');
  });
});

// ── Scenario 2: Routine FC 32Gb — FS5600 ────────────────────────────────────

describe('Scenario 2 – Routine FC 32Gb', () => {
  const ctx = { reseller: 'Carmel IT Integrators', endCustomer: 'HaSharon Municipality', hasOpportunity: false };
  const spec = { cap: 40, capType: 'effective', conn: 'fc32', fcPorts: 8, ec: 5, ecLevel: 'Advanced' };

  it('routes to auto', () => {
    const res = size(spec, ctx);
    assert.equal(res.route, 'auto');
  });

  it('recommends FS5600', () => {
    const res = size(spec, ctx);
    assertSized(res);
    assert.equal(res.recommendation.model, 'FlashSystem 5600');
  });

  it('includes FC adapter feature ALB9', () => {
    const res = size(spec, ctx);
    assertFeature(res, 'ALB9');
  });

  it('includes OM3 cable feature ACSR', () => {
    const res = size(spec, ctx);
    assertFeature(res, 'ACSR');
  });

  it('includes Expert Care Advanced 5Y feature ALK5', () => {
    const res = size(spec, ctx);
    assertFeature(res, 'ALK5');
  });
});

// ── Scenario 3: Missing capacity → custom route ──────────────────────────────

describe('Scenario 3 – Missing capacity', () => {
  const ctx = { reseller: 'Galilee Networks', hasOpportunity: false };
  const spec = { capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' };  // cap omitted

  it('routes to custom', () => {
    const res = size(spec, ctx);
    assert.equal(res.route, 'custom');
  });

  it('has no recommendation', () => {
    const res = size(spec, ctx);
    assert.equal(res.recommendation, null);
  });

  it('has a reason in Hebrew', () => {
    const res = size(spec, ctx);
    assert.ok(res.reasons.length > 0, 'Expected at least one reason');
    assert.ok(res.reasons[0].he, 'Expected a Hebrew reason string');
  });
});

// ── Scenario 4: Request too large (>500TB effective) → review route ──────────

describe('Scenario 4 – Large request >500TB effective', () => {
  const ctx = { reseller: 'TelAviv DataCentre Ltd', endCustomer: 'Ben-Gurion Airport IT', hasOpportunity: false };
  const spec = { cap: 600, capType: 'effective', conn: 'fc32', fcPorts: 8, ec: 5, ecLevel: 'Advanced' };

  it('routes to review', () => {
    const res = size(spec, ctx);
    assert.equal(res.route, 'review');
  });

  it('still produces a recommendation', () => {
    const res = size(spec, ctx);
    assertSized(res);
  });

  it('effective capacity of recommendation covers the 600TB request', () => {
    const res = size(spec, ctx);
    // IBM catalog: FS5600 8×52.8TB = 655TB effective — fits 600TB.
    assert.ok(
      res.recommendation.capacityTB.effectiveEstimate >= 600,
      `Expected effective >= 600TB, got ${res.recommendation.capacityTB.effectiveEstimate}`
    );
  });
});

// ── Scenario 5: Explicit FS7600 request → review route (unverified) ─────────

describe('Scenario 5 – Explicit FS7600 request', () => {
  const ctx = { reseller: 'Eilat Hosting Solutions', hasOpportunity: false };
  const spec = { cap: 150, capType: 'effective', model: 'FS7600', conn: 'fc32', fcPorts: 8, ec: 5, ecLevel: 'Advanced' };

  it('routes to review (FS7600 not yet verified)', () => {
    const res = size(spec, ctx);
    assert.equal(res.route, 'review');
  });

  it('recommends FS7600', () => {
    const res = size(spec, ctx);
    assertSized(res);
    assert.equal(res.recommendation.model, 'FlashSystem 7600');
  });

  it('verify list is non-empty (unverified model)', () => {
    const res = size(spec, ctx);
    assert.ok(res.verify.length > 0, 'Expected verify items for FS7600');
  });
});

// ── Scenario 6: Expert Care Basic 5Y ────────────────────────────────────────

describe('Scenario 6 – Expert Care Basic 5Y', () => {
  const ctx = { reseller: 'Jezreel Valley Tech', endCustomer: 'Kishon Pumping Station', hasOpportunity: false };
  const spec = { cap: 30, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Basic' };

  it('routes to auto', () => {
    const res = size(spec, ctx);
    assert.equal(res.route, 'auto');
  });

  it('recommends FS5600', () => {
    const res = size(spec, ctx);
    assertSized(res);
    assert.equal(res.recommendation.model, 'FlashSystem 5600');
  });

  it('Expert Care level is Basic', () => {
    const res = size(spec, ctx);
    assert.equal(res.recommendation.expertCare.level, 'Basic');
  });

  it('includes Expert Care Basic feature ALJ5', () => {
    const res = size(spec, ctx);
    assertFeature(res, 'ALJ5');
  });
});

// ── Scenario 7: Expert Care Basic 3Y — note emitted, no feature code ────────

describe('Scenario 7 – Expert Care Basic 3Y (no stored feature code)', () => {
  const ctx = { reseller: 'Beersheba Cloud', hasOpportunity: false };
  const spec = { cap: 25, capType: 'usable', conn: 'iscsi25', ec: 3, ecLevel: 'Basic' };

  it('produces a recommendation', () => {
    const res = size(spec, ctx);
    assertSized(res);
  });

  it('emits a note about picking EC Basic in e-config', () => {
    const res = size(spec, ctx);
    const noteTexts = res.notes.map(n => n.en).join(' ');
    assert.ok(noteTexts.includes('Expert Care Basic'), 'Expected a note mentioning Expert Care Basic');
  });

  it('ec years normalises to 3', () => {
    const n = normalize(spec);
    assert.equal(n.ecYears, 3);
  });
});

// ── Scenario 8: Hebrew company names preserved in econfig.name ───────────────

describe('Scenario 8 – Hebrew company names in e-config', () => {
  const ctx = { reseller: 'ספקי מחשוב הדרום', endCustomer: 'עיריית אשדוד', hasOpportunity: false };
  const spec = { cap: 50, capType: 'effective', conn: 'fc32', fcPorts: 8, ec: 5, ecLevel: 'Advanced' };

  it('econfig.name includes Hebrew reseller name', () => {
    const res = size(spec, ctx);
    assert.ok(res.econfig.name.includes('ספקי מחשוב הדרום'), 'Expected Hebrew reseller name in econfig.name');
  });

  it('econfig.nameAscii falls back to base name (no Hebrew)', () => {
    const res = size(spec, ctx);
    // nameAscii strips non-ASCII; must not be empty
    assert.ok(res.econfig.nameAscii && res.econfig.nameAscii.length > 0, 'Expected non-empty nameAscii');
    // Must not contain Hebrew characters
    assert.ok(!/[\u0590-\u05FF]/.test(res.econfig.nameAscii), 'nameAscii must not contain Hebrew');
  });

  it('public.headline has both Hebrew and English', () => {
    const res = size(spec, ctx);
    assert.ok(res.public.headline.he, 'Expected Hebrew headline');
    assert.ok(res.public.headline.en, 'Expected English headline');
  });
});
