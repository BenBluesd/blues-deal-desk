'use strict';

/**
 * agent/extract-fallback.js
 *
 * Rule-based spec extractor — works without any API key.
 * Handles Hebrew and English.
 *
 * extract(message, currentSpec) → partialSpec
 *
 * Only returns fields that were confidently found; the caller merges
 * the result into the accumulated session spec.
 */

/**
 * @param {string} message     Raw message text from the reseller.
 * @param {object} currentSpec Already-collected spec (used to avoid re-asking).
 * @returns {object} partialSpec — subset of the tool-contract spec fields.
 */
function extract(message, currentSpec) {
  const txt = message;
  const partial = {};

  // ── Capacity (number before TB / TB / tera / טרה / טרה-בייט) ─────────────
  // e.g. "40TB", "40 TB", "40 טרה", "40 טרה-בייט", "40 תרה", "600 TB"
  const capMatch = txt.match(/(\d+(?:\.\d+)?)\s*(?:TB|tb|tera|tib|טרה(?:-?בייט)?|תרה(?:-?בייט)?)/i);
  if (capMatch) {
    partial.cap = parseFloat(capMatch[1]);
  }

  // ── Capacity type ─────────────────────────────────────────────────────────
  if (/effective|אפקטיבי|לוגי/i.test(txt)) {
    partial.capType = 'effective';
  } else if (/usable|netto|neto|שמיש|נטו/i.test(txt)) {
    partial.capType = 'usable';
  } else if (/raw|ברוטו|פיזי|גולמי/i.test(txt)) {
    partial.capType = 'raw';
  } else if (/not sure|unsure|לא בטוח|לא יודע/i.test(txt)) {
    partial.capType = 'unsure';
  }

  // ── Connectivity / protocol ───────────────────────────────────────────────
  const hasFC   = /\bfc\b|fibre\s+channel|fiber\s+channel|פייבר\s*צ'אנל|FC/i.test(txt);
  const hasiSCSI = /iscsi|איסקסי|iSCSI/i.test(txt);

  if (hasFC && hasiSCSI) {
    partial.conn = ['fc32', 'iscsi25'];
  } else if (hasFC) {
    partial.conn = 'fc32';
    // FC speed
    if (/64\s*[Gg]b?/i.test(txt)) partial.conn = 'fc64';
    else if (/32\s*[Gg]b?/i.test(txt)) partial.conn = 'fc32';
  } else if (hasiSCSI) {
    partial.conn = 'iscsi25';
    // iSCSI speed — default 25Gb
    if (/10\s*[Gg]b?/i.test(txt)) partial.speed = 'iscsi10';
    else partial.speed = 'iscsi25';
  }

  // ── FC port count ─────────────────────────────────────────────────────────
  // "8 ports", "8 פורטים", "8 פורט"
  const portMatch = txt.match(/(\d+)\s*(?:ports?|פורטים|פורט)/i);
  if (portMatch && hasFC) {
    partial.fcPorts = parseInt(portMatch[1], 10);
  }

  // ── SAN switches ──────────────────────────────────────────────────────────
  if (/(?:have|has|existing|יש\s+(?:לנו|להם)?|יש\s+מתגים)\s*(?:san\s+)?(?:switch(?:es)?|מתגים?)/i.test(txt) ||
      /מתגי\s+(?:san|FC|פייבר)|יש\s+מתג|יש מתגים/i.test(txt)) {
    partial.sanSw = 'has';
  } else if (/need|want|require|צריך\s+מתגים?|צריכים\s+מתגים?/i.test(txt) && /(?:san\s+)?(?:switch(?:es)?|מתגים?)/i.test(txt)) {
    partial.sanSw = 'need';
  } else if (/direct(?:\s*connect)?|ישיר|ללא מתגים|ללא מתג|without\s+(?:san\s+)?switch|no\s+(?:san\s+)?switch/i.test(txt)) {
    partial.sanSw = 'direct';
  }

  // ── Expert Care duration ──────────────────────────────────────────────────
  // "5 years", "5-year", "5 שנים", "5 שנות"
  const ecYearsMatch = txt.match(/(\d)\s*[-\s]?(?:year|שנ(?:ה|ים|ות))/i);
  if (ecYearsMatch) {
    const y = parseInt(ecYearsMatch[1], 10);
    if (y === 3 || y === 5) partial.ec = y;
  }

  // ── Expert Care level ─────────────────────────────────────────────────────
  if (/\badvanced\b|מתקדם/i.test(txt)) {
    partial.ecLevel = 'Advanced';
  } else if (/\bbasic\b|בסיסי/i.test(txt)) {
    partial.ecLevel = 'Basic';
  }

  // ── Model preference ──────────────────────────────────────────────────────
  if (/FS7600|7600|FlashSystem\s+7600/i.test(txt)) {
    partial.model = 'FS7600';
  } else if (/FS5600|5600|FlashSystem\s+5600/i.test(txt)) {
    partial.model = 'FS5600';
  }

  // ── Company name ──────────────────────────────────────────────────────────
  // Extract ONLY the company name, not the full sentence.
  // Priority order: most-specific patterns first.
  //
  // English patterns:
  //   "I am from Smoke Test Corp. Email: ..."  → "Smoke Test Corp"
  //   "we are from / we're from / this is / I'm from / calling from"
  //   "company: Acme Ltd" / "company is Acme"
  //
  // Hebrew patterns:
  //   "אנחנו מ-X" / "מחברת X" / "החברה שלנו X" / "שמי ... מחברת X"
  //   "מדבר מ-X" / "מ-X"
  //
  // We return a special _companyName key for the loop to use in ctx.

  // 1. "from <Company>. Email:" — stop at sentence boundary or email keyword
  const fromEmailPattern = /(?:i'?m\s+from|we\s+are\s+from|we'?re\s+(?:from|at)|this\s+is|calling\s+from|i\s+am\s+from)\s+([A-Za-z][A-Za-z0-9 &\-'.]{1,50?}?)(?:\s*[.,]?\s*(?:email|e-mail|my email|our email|contact)?:|$)/i;
  const fromEmailMatch = txt.match(fromEmailPattern);
  if (fromEmailMatch) {
    partial._companyName = fromEmailMatch[1].trim().replace(/[,.]$/, '');
  }

  if (!partial._companyName) {
    // 2. Hebrew: "מחברת X" / "מ-X" / "החברה שלנו X" / "שמי ... מחברת X" / "אנחנו מ-?"
    const hePatterns = [
      /(?:מחברת|ב-חברת)\s+([א-תA-Za-z][א-תA-Za-z0-9\s\-&'.]{1,50}?)(?:\s*[.,!?]|$)/,
      /(?:החברה\s+שלנו\s+(?:היא\s+)?|החברה\s+שלי\s+(?:היא\s+)?)([א-תA-Za-z][א-תA-Za-z0-9\s\-&'.]{1,50}?)(?:\s*[.,!?]|$)/,
      /(?:שמי\s+\S+\s+מחברת|מדבר(?:ת)?\s+מ-?|מדברת\s+מ-?)([א-תA-Za-z][א-תA-Za-z0-9\s\-&'.]{1,50}?)(?:\s*[.,!?]|$)/,
      /(?:אנחנו\s+מ-?|אנחנו\s+ב-?|אני\s+מ-?)([א-תA-Za-z][א-תA-Za-z0-9\s\-&'.]{1,50}?)(?:\s*[.,!?]|$)/,
    ];
    for (const pat of hePatterns) {
      const m = txt.match(pat);
      if (m) {
        partial._companyName = m[1].trim().replace(/[,.]$/, '');
        break;
      }
    }
  }

  if (!partial._companyName) {
    // 3. English: "company: X" / "company is X" / "company name is X"
    const companyLabelMatch = txt.match(/company(?:\s+name)?\s*(?:is|:)\s*([A-Za-z][A-Za-z0-9 &\-'.]{1,50}?)(?:\s*[.,]|$)/i);
    if (companyLabelMatch) {
      partial._companyName = companyLabelMatch[1].trim().replace(/[,.]$/, '');
    }
  }

  if (!partial._companyName) {
    // 4. Generic: "Hi, I am from X" / "Hi from X" where X is just the company
    const genericFrom = /(?:(?:hi|hello),?\s+)?(?:(?:i'?m|i\s+am|we\s+are|we'?re)\s+from|(?:hi|hello)\s+from)\s+([A-Za-z][A-Za-z0-9 &\-'.]{1,50}?)(?:\s*[.,!?]|$)/i;
    const gm = txt.match(genericFrom);
    if (gm) {
      partial._companyName = gm[1].trim().replace(/[,.]$/, '');
    }
  }

  // Trim trailing email-like fragment from company name if it slipped through
  if (partial._companyName) {
    // Remove anything after "Email:" or similar that may have been captured
    partial._companyName = partial._companyName
      .replace(/\s*(?:email|e-mail|contact|אימייל|mail).*$/i, '')
      .replace(/\s+[a-zA-Z0-9._%+\-]+@.*$/, '') // remove trailing email
      .trim()
      .replace(/[.,!?]+$/, '');
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  const emailMatch = txt.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    partial._email = emailMatch[0];
  }

  // ── Opportunity ID (006…) ─────────────────────────────────────────────────
  const oppMatch = txt.match(/\b(006[0-9A-Z]{6,15})\b/i);
  if (oppMatch) {
    partial._opportunityId = oppMatch[1];
  }

  return partial;
}

module.exports = { extract };
