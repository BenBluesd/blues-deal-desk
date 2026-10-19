'use strict';

/**
 * engine/index.js
 *
 * Thin wrapper around reference/sizer.js.
 * Exports the sizer API directly and mounts a POST /api/size Express router.
 * Does NOT change any sizing logic — all rules live in reference/sizer.js.
 */

const path = require('path');
const BluesSizer = require(path.join(__dirname, '..', 'reference', 'sizer.js'));

// ── Re-export the sizer API ──────────────────────────────────────────────────

const { VERSION, RULES, MODELS, EC_LEVELS, TX, size, normalize, usableOf, quickKey } = BluesSizer;

module.exports = { VERSION, RULES, MODELS, EC_LEVELS, TX, size, normalize, usableOf, quickKey };

// ── Express router ───────────────────────────────────────────────────────────

/**
 * Returns an Express Router with:
 *   POST /size   { spec, ctx? }  →  BluesSizer.size(spec, ctx)
 *
 * Mount it at /api:
 *   app.use('/api', require('./engine').router());
 */
module.exports.router = function router() {
  const express = require('express');
  const r = express.Router();

  r.post('/size', (req, res) => {
    const { spec, ctx } = req.body || {};
    if (!spec || typeof spec !== 'object') {
      return res.status(400).json({ error: 'Body must contain a "spec" object.' });
    }
    try {
      const result = size(spec, ctx || {});
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return r;
};
