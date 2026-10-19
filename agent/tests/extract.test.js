'use strict';

/**
 * agent/tests/extract.test.js
 *
 * Tests for the rule-based fallback extractor.
 * For each demo request, the extractor on `message` must produce
 * the key spec fields (cap, capType, conn, ec, ecLevel where present).
 *
 * Run: node --test agent/tests/extract.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { extract } = require('../extract-fallback.js');
const demoRequests = require(path.join(__dirname, '..', '..', 'data', 'demo-requests.json'));

// ── Helper ────────────────────────────────────────────────────────────────────
/**
 * Assert that extracted[field] equals expected, with a useful message.
 */
function assertField(extracted, field, expected, scenario) {
  assert.deepEqual(
    extracted[field],
    expected,
    `[${scenario}] field "${field}": expected ${JSON.stringify(expected)}, got ${JSON.stringify(extracted[field])}`
  );
}

// ── Per-demo-request tests ─────────────────────────────────────────────────────

// capType keyword lookup: only assert capType if a recognisable keyword appears in the message
const CAP_TYPE_KEYWORDS = {
  effective: /effective|אפקטיבי|לוגי/i,
  usable:    /usable|netto|neto|שמיש|נטו/i,
  raw:       /raw|ברוטו|פיזי|גולמי/i,
  unsure:    /not sure|unsure|לא בטוח|לא יודע/i,
};

for (const demo of demoRequests) {
  describe(`Demo ${demo.id} – ${demo.scenario}`, () => {
    const extracted = extract(demo.message, {});

    if (demo.spec.cap !== undefined) {
      it(`extracts cap = ${demo.spec.cap}`, () => {
        assertField(extracted, 'cap', demo.spec.cap, demo.scenario);
      });
    }

    if (demo.spec.capType && demo.spec.capType !== 'unsure') {
      // Only assert capType if the keyword is actually present in the message
      const pat = CAP_TYPE_KEYWORDS[demo.spec.capType];
      if (pat && pat.test(demo.message)) {
        it(`extracts capType = "${demo.spec.capType}"`, () => {
          assertField(extracted, 'capType', demo.spec.capType, demo.scenario);
        });
      }
    }

    if (demo.spec.conn !== undefined) {
      it(`extracts conn = ${JSON.stringify(demo.spec.conn)}`, () => {
        assertField(extracted, 'conn', demo.spec.conn, demo.scenario);
      });
    }

    if (demo.spec.ec !== undefined) {
      it(`extracts ec = ${demo.spec.ec}`, () => {
        assertField(extracted, 'ec', demo.spec.ec, demo.scenario);
      });
    }

    if (demo.spec.ecLevel !== undefined) {
      it(`extracts ecLevel = "${demo.spec.ecLevel}"`, () => {
        assertField(extracted, 'ecLevel', demo.spec.ecLevel, demo.scenario);
      });
    }
  });
}

// ── Additional targeted tests ──────────────────────────────────────────────────

describe('Hebrew capacity phrases', () => {
  it('"40 טרה" → cap 40', () => {
    const r = extract('אנחנו צריכים 40 טרה', {});
    assert.equal(r.cap, 40);
  });
  it('"30TB" → cap 30', () => {
    const r = extract('Need 30TB of storage', {});
    assert.equal(r.cap, 30);
  });
  it('"600 TB" → cap 600', () => {
    const r = extract('We need 600 TB effective', {});
    assert.equal(r.cap, 600);
  });
});

describe('Capacity type keywords', () => {
  it('"אפקטיבי" → capType effective', () => {
    const r = extract('40TB אפקטיבי', {});
    assert.equal(r.capType, 'effective');
  });
  it('"usable" → capType usable', () => {
    const r = extract('30TB usable capacity', {});
    assert.equal(r.capType, 'usable');
  });
  it('"נטו" → capType usable', () => {
    const r = extract('30TB נטו', {});
    assert.equal(r.capType, 'usable');
  });
  it('"raw" → capType raw', () => {
    const r = extract('50TB raw', {});
    assert.equal(r.capType, 'raw');
  });
  it('"ברוטו" → capType raw', () => {
    const r = extract('50TB ברוטו', {});
    assert.equal(r.capType, 'raw');
  });
});

describe('Connectivity keywords', () => {
  it('"FC 32Gb" → conn fc32', () => {
    const r = extract('We need FC 32Gb connectivity', {});
    assert.equal(r.conn, 'fc32');
  });
  it('"FC 64Gb" → conn fc64', () => {
    const r = extract('FC 64Gb 8 ports', {});
    assert.equal(r.conn, 'fc64');
  });
  it('"iSCSI 25Gb" → conn iscsi25', () => {
    const r = extract('iSCSI 25Gb network storage', {});
    assert.equal(r.conn, 'iscsi25');
  });
  it('"iSCSI" alone → conn iscsi25', () => {
    const r = extract('We use iSCSI', {});
    assert.equal(r.conn, 'iscsi25');
  });
});

describe('SAN switch keywords', () => {
  it('"existing SAN switches" → sanSw has', () => {
    const r = extract('They have existing SAN switches', {});
    assert.equal(r.sanSw, 'has');
  });
  it('"יש מתגים" → sanSw has', () => {
    const r = extract('יש להם מתגי SAN קיימים', {});
    assert.equal(r.sanSw, 'has');
  });
  it('"need SAN switches" → sanSw need', () => {
    const r = extract('They need SAN switches', {});
    assert.equal(r.sanSw, 'need');
  });
  it('"direct connect" → sanSw direct', () => {
    const r = extract('They connect direct, no SAN switch', {});
    assert.equal(r.sanSw, 'direct');
  });
});

describe('Expert Care keywords', () => {
  it('"5 years" → ec 5', () => {
    const r = extract('5 years Expert Care', {});
    assert.equal(r.ec, 5);
  });
  it('"3 שנים" → ec 3', () => {
    const r = extract('3 שנים של Expert Care', {});
    assert.equal(r.ec, 3);
  });
  it('"Advanced" → ecLevel Advanced', () => {
    const r = extract('Advanced Expert Care', {});
    assert.equal(r.ecLevel, 'Advanced');
  });
  it('"Basic" → ecLevel Basic', () => {
    const r = extract('Basic Expert Care please', {});
    assert.equal(r.ecLevel, 'Basic');
  });
});

describe('Email extraction', () => {
  it('extracts email address', () => {
    const r = extract('My email is sales@carmelit.co.il', {});
    assert.equal(r._email, 'sales@carmelit.co.il');
  });
});

describe('Opportunity ID extraction', () => {
  it('extracts IBM opportunity ID', () => {
    const r = extract('Our opportunity ID is 006A1B2C3D4', {});
    assert.equal(r._opportunityId, '006A1B2C3D4');
  });
});
