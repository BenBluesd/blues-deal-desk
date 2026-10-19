#!/usr/bin/env node
/**
 * scripts/make-golden.js
 *
 * Runs BluesSizer.size() on 40+ varied specs and writes the results to
 * orchestrate/tests/golden.json. The Python parity test reads that file
 * and asserts the Python port produces the same route, recommendation,
 * econfig.lines, and public.headline for every case.
 *
 * Usage:
 *   node scripts/make-golden.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { size } = require('../reference/sizer.js');

const OUT = path.join(__dirname, '..', 'orchestrate', 'tests', 'golden.json');

// ── 8 demo-requests as the seed ───────────────────────────────────────────────
const DEMO = require('../data/demo-requests.json');

// ── Additional generated combinations ─────────────────────────────────────────
const GENERATED = [
  // ── capacities / types ──
  { spec: { cap: 10, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 20, capType: 'usable',    conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 30, capType: 'raw',       conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 80, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 150, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 300, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 500, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 600, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },

  // ── FC speeds ──
  { spec: { cap: 40, capType: 'effective', conn: 'fc32', fcPorts: 8,  sanSw: 'has',   ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'fc64', fcPorts: 8,  sanSw: 'has',   ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'fc32', fcPorts: 16, sanSw: 'has',   ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'fc32', fcPorts: 8,  sanSw: 'need',  ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'fc32', fcPorts: 8,  sanSw: 'direct',ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'fc32', fcPorts: 8,  sanSw: 'unsure',ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },

  // ── EC years + level ──
  { spec: { cap: 40, capType: 'effective', conn: 'iscsi25', ec: 3, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Basic'    }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'iscsi25', ec: 3, ecLevel: 'Basic'    }, ctx: { hasOpportunity: false } },

  // ── model explicit ──
  { spec: { cap: 40,  capType: 'effective', conn: 'fc32', fcPorts: 8, sanSw: 'has', ec: 5, ecLevel: 'Advanced', model: 'FS5600' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 150, capType: 'effective', conn: 'fc32', fcPorts: 8, sanSw: 'has', ec: 5, ecLevel: 'Advanced', model: 'FS7600' }, ctx: { hasOpportunity: false } },

  // ── transceivers ──
  { spec: { cap: 40, capType: 'effective', conn: 'iscsi25', txType: 'sfp28', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'iscsi25', txType: 'sfp10', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'iscsi25', txType: 'rj45',  ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'iscsi25', txType: 'none',  ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },

  // ── cables on/off ──
  { spec: { cap: 40, capType: 'effective', conn: 'fc32', fcPorts: 8, sanSw: 'has', ec: 5, ecLevel: 'Advanced', cables: true  }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'fc32', fcPorts: 8, sanSw: 'has', ec: 5, ecLevel: 'Advanced', cables: false }, ctx: { hasOpportunity: false } },

  // ── with reseller / endCustomer in ctx ──
  { spec: { cap: 40, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' },
    ctx:  { reseller: 'נגב דאטה', endCustomer: 'שרותי ענן', hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' },
    ctx:  { reseller: 'Negev Data', endCustomer: 'Cloud Services', hasOpportunity: true } },

  // ── missing cap → custom route ──
  { spec: { capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },

  // ── onboard connectivity ──
  { spec: { cap: 40, capType: 'effective', speed: 'onboard', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 40, capType: 'effective', speed: 'onboard', txType: 'sfp10', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },

  // ── unsure speed ──
  { spec: { cap: 40, capType: 'effective', conn: 'fc32', speed: 'unsure', fcPorts: 8, sanSw: 'has', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },

  // ── mixed FC + iSCSI ──
  { spec: { cap: 40, capType: 'effective', conn: ['fc32', 'iscsi25'], fcPorts: 8, sanSw: 'has', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },

  // ── large FS7600 ──
  { spec: { cap: 300, capType: 'effective', conn: 'fc32', fcPorts: 8, sanSw: 'has', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },

  // ── tier mid → FS7600 ──
  { spec: { cap: 40, capType: 'effective', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced', tier: 'mid' }, ctx: { hasOpportunity: false } },

  // ── usable edge cases ──
  { spec: { cap: 19, capType: 'usable', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
  { spec: { cap: 6,  capType: 'usable', conn: 'iscsi25', ec: 5, ecLevel: 'Advanced' }, ctx: { hasOpportunity: false } },
];

// ── Run the engine on every spec ─────────────────────────────────────────────
const cases = [];

// From demo-requests.json
for (const req of DEMO) {
  const result = size(req.spec, req.ctx || {});
  cases.push({
    id: req.id,
    scenario: req.scenario,
    spec: req.spec,
    ctx: req.ctx || {},
    route: result.route,
    recommendation: result.recommendation,
    econfigLines: result.econfig ? result.econfig.lines : null,
    publicHeadline: result.public ? result.public.headline : null,
  });
}

// From generated combinations
for (let i = 0; i < GENERATED.length; i++) {
  const { spec, ctx } = GENERATED[i];
  const result = size(spec, ctx);
  cases.push({
    id: `GEN-${String(i + 1).padStart(3, '0')}`,
    scenario: 'generated',
    spec,
    ctx,
    route: result.route,
    recommendation: result.recommendation,
    econfigLines: result.econfig ? result.econfig.lines : null,
    publicHeadline: result.public ? result.public.headline : null,
  });
}

// ── Write output ──────────────────────────────────────────────────────────────
const dir = path.dirname(OUT);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

fs.writeFileSync(OUT, JSON.stringify(cases, null, 2) + '\n', 'utf8');
console.log(`Wrote ${cases.length} golden cases to ${OUT}`);
