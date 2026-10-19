'use strict';

/**
 * agent/price.js
 *
 * Computes a mock price from the engine result using data/mock-pricelist.json.
 * Returns an object with line items plus a total.
 * Every price carries the MOCK label — never show to resellers.
 */

const path = require('path');
const pricelist = require(path.join(__dirname, '..', 'data', 'mock-pricelist.json'));

/**
 * Look up a feature code across all pricelist sections.
 * @param {string} feature
 * @returns {{ desc: string, list: number } | null}
 */
function lookupFeature(feature) {
  const sections = ['bundles', 'drives', 'connectivity', 'transceivers', 'expertCare', 'shipping'];
  for (const section of sections) {
    const entry = pricelist[section] && pricelist[section][feature];
    if (entry) {
      return { desc: entry._desc, list: entry.list };
    }
  }
  return null;
}

/**
 * Look up the base unit price by MTM.
 * @param {string} mtm
 * @returns {number|null}
 */
function lookupBase(mtm) {
  const entry = pricelist.base && pricelist.base[mtm];
  return entry ? entry.list : null;
}

/**
 * Compute mock price from an engine result.
 *
 * @param {object} engineResult  The full BluesSizer.size() return value.
 * @returns {object} priceObject
 *   {
 *     label: "MOCK – demo only",
 *     currency: "USD",
 *     lines: [{ feature, qty, desc, unitList, extList, inMockList }],
 *     baseList: number|null,
 *     totalList: number,
 *     missingFeatures: string[],
 *   }
 */
function computePrice(engineResult) {
  const result = {
    label: pricelist._label,
    currency: pricelist._currency,
    lines: [],
    baseList: null,
    totalList: 0,
    missingFeatures: [],
  };

  if (!engineResult || !engineResult.econfig) return result;

  const mtm = engineResult.recommendation && engineResult.recommendation.mtm;
  if (mtm) {
    const basePrice = lookupBase(mtm);
    result.baseList = basePrice;
    if (basePrice !== null) {
      result.totalList += basePrice;
      result.lines.unshift({
        feature: mtm,
        qty: 1,
        desc: `Base unit (${engineResult.recommendation.model})`,
        unitList: basePrice,
        extList: basePrice,
        inMockList: true,
      });
    } else {
      result.missingFeatures.push(mtm);
    }
  }

  for (const line of (engineResult.econfig.lines || [])) {
    const { feature, qty } = line;
    const found = lookupFeature(feature);
    const qty_ = qty || 1;
    if (found) {
      const extList = found.list * qty_;
      result.lines.push({
        feature,
        qty: qty_,
        desc: found.desc,
        unitList: found.list,
        extList,
        inMockList: true,
      });
      result.totalList += extList;
    } else {
      result.lines.push({
        feature,
        qty: qty_,
        desc: line.he || line.en || '—',
        unitList: null,
        extList: null,
        inMockList: false,
      });
      result.missingFeatures.push(feature);
    }
  }

  return result;
}

module.exports = { computePrice, lookupFeature, lookupBase };
