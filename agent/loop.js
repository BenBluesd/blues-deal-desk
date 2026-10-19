'use strict';

/**
 * agent/loop.js
 *
 * State-machine agent loop. No LLM key required — uses extract-granite.js
 * which automatically falls back to the rule-based extract-fallback.js.
 *
 * States:
 *   identify  – collect reseller company name + contact email
 *   gather    – extract spec, call engine, ask one missing field at a time
 *   confirm   – show public summary, ask "submit?"
 *   opp       – ask for IBM opportunity ID (optional, after first confirm "yes")
 *   submitted – save request, return request ID
 *
 * handleTurn(sessionId, message, lang) → { reply, state, public?, requestId?, quickReplies? }
 * getSession(sessionId) → session (for server.js to read savedRequest)
 */

const crypto = require('crypto');
const { extract: extractMsg } = require('./extract-granite.js');
const { computePrice } = require('./price.js');
const { size } = require('../engine/index.js');

// ── In-memory session store ──────────────────────────────────────────────────
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      state: 'identify',
      lang: 'en',
      spec: {},
      ctx: { hasOpportunity: false },
      conversation: [],
      askedOpportunity: false,
      askedEngineQuestions: new Set(), // track which engine questions have been asked
      savedRequest: null,
    });
  }
  return sessions.get(sessionId);
}

// ── Language detection ────────────────────────────────────────────────────────
function isHebrew(text) {
  return /[\u05D0-\u05EA]/.test(text);
}

// ── Bilingual reply helpers ────────────────────────────────────────────────────
const T = {
  askCompany: {
    he: 'שלום! אני עוזר להגדרת IBM FlashSystem. מה שם החברה שלך?',
    en: 'Hello! I help configure IBM FlashSystem systems. What is your company name?',
  },
  askEmail: {
    he: 'תודה. מה כתובת הדואר האלקטרוני שלך?',
    en: 'Thank you. What is your contact email address?',
  },
  askCap: {
    he: 'כמה אחסון נדרש? (לדוגמה: 40TB)',
    en: 'How much storage capacity is required? (e.g. 40TB)',
  },
  askCapType: {
    he: 'האחסון הוא קיבולת אפקטיבית, שמישה (usable) או גולמית (raw)?',
    en: 'Is that effective (after dedup/compression), usable, or raw capacity?',
  },
  askConn: {
    he: 'איזה סוג קישוריות נדרש – FC (Fibre Channel) או iSCSI?',
    en: 'What connectivity is needed – FC (Fibre Channel) or iSCSI?',
  },
  askFcSpeed: {
    he: 'האם נדרש FC 32Gb או FC 64Gb?',
    en: 'Do you need FC 32Gb or FC 64Gb?',
  },
  askSanSw: {
    he: 'האם ללקוח יש מתגי SAN קיימים, הם צריכים מתגים חדשים, או שהם מחברים ישירות?',
    en: 'Does the customer have existing SAN switches, need new ones, or connect directly?',
  },
  askEc: {
    he: 'כמה שנות Expert Care נדרשות – 3 או 5?',
    en: 'How many years of Expert Care are needed – 3 or 5?',
  },
  askEcLevel: {
    he: 'מה רמת Expert Care הנדרשת – Basic או Advanced?',
    en: 'What Expert Care level is needed – Basic or Advanced?',
  },
  askOpportunity: {
    he: 'האם כבר רשמתם את העסקה עם IBM ויש לכם מספר הזדמנות (מתחיל ב-006)?',
    en: 'Do you already have an IBM opportunity ID (starts with 006)?',
  },
  askOpportunityNumber: {
    he: 'מצוין! אנא הקלד את המספר (מתחיל ב-006).',
    en: 'Great, please type the number (starts with 006).',
  },
  askSubmit: {
    he: 'לשלוח לצוות Blues?',
    en: 'Submit to Blues?',
  },
  submitted: {
    he: (id) => `הבקשה נשלחה! מספר הבקשה: **${id}**\nנציג Blues יחזור אליכם עם הצעת מחיר בהקדם. תודה!`,
    en: (id) => `Request submitted! Your request ID is **${id}**\nA Blues salesperson will get back to you with a price shortly. Thank you!`,
  },
  confirmNo: {
    he: 'אין בעיה. תוכל לשנות פרטים כלשהם לפני השליחה.',
    en: 'No problem. You can change any details before submitting.',
  },
  reviewRoute: {
    he: 'הבקשה תועבר לבדיקה ידנית על ידי צוות Blues (הגדרה מיוחדת).',
    en: 'This request will be routed for manual review by the Blues team (custom configuration).',
  },
};

function t(key, lang, arg) {
  const entry = T[key];
  if (!entry) return key;
  const fn = entry[lang] || entry['en'];
  return typeof fn === 'function' ? fn(arg) : fn;
}

// ── Quick-reply chips per question key ────────────────────────────────────────
const QUICK_REPLIES = {
  askCapType: { he: ['אפקטיבי', 'שמיש (usable)', 'גולמי (raw)'], en: ['Effective', 'Usable', 'Raw'] },
  askConn:    { he: ['FC', 'iSCSI'], en: ['FC', 'iSCSI'] },
  askFcSpeed: { he: ['FC 32Gb', 'FC 64Gb'], en: ['FC 32Gb', 'FC 64Gb'] },
  askSanSw:   { he: ['יש מתגים', 'צריך מתגים', 'חיבור ישיר'], en: ['Have switches', 'Need switches', 'Direct connect'] },
  askEc:      { he: ['3 שנים', '5 שנים'], en: ['3 years', '5 years'] },
  askEcLevel: { he: ['Basic', 'Advanced'], en: ['Basic', 'Advanced'] },
  askSubmit:  { he: ['שלח', 'לשנות משהו'], en: ['Submit', 'Change something'] },
  askOpportunity: { he: ['כן', 'לא (דלג)'], en: ['Yes', 'No (skip)'] },
};

// ── Spec completeness check ────────────────────────────────────────────────────
/**
 * Returns the next question key the agent should ask, or null if spec is ready.
 * Priority: cap → capType → conn → (fcPorts for FC) → (sanSw for FC) → ec → ecLevel
 */
function nextQuestion(spec) {
  if (!spec.cap) return 'askCap';
  if (!spec.capType || spec.capType === 'unsure') return 'askCapType';
  if (!spec.conn || (Array.isArray(spec.conn) && spec.conn.length === 0)) return 'askConn';
  const isFC = spec.conn === 'fc32' || spec.conn === 'fc64' ||
    (Array.isArray(spec.conn) && spec.conn.some(c => c.startsWith('fc')));
  if (isFC && (!spec.sanSw || spec.sanSw === 'unsure')) return 'askSanSw';
  if (!spec.ec) return 'askEc';
  if (!spec.ecLevel) return 'askEcLevel';
  return null;
}

// ── Filter engine questions: only items ending with "?" are real questions ────
function isRealQuestion(item, lang) {
  const text = (item && (item[lang] || item.en || '')) .trim();
  return text.endsWith('?');
}

// ── Format public summary for the reseller (card data + assumptions) ──────────
function formatPublic(engineResult, lang) {
  const pub = engineResult.public;
  if (!pub) return lang === 'he' ? 'תצוגה מקדימה אינה זמינה.' : 'Preview not available.';

  const headline = pub.headline ? (pub.headline[lang] || pub.headline.en) : '';
  const lines = (pub.lines || []).map(l => `• ${l[lang] || l.en}`).join('\n');
  const disclaimer = pub.disclaimer ? (pub.disclaimer[lang] || pub.disclaimer.en) : '';
  const routeNote = engineResult.route !== 'auto' ? `\n${t('reviewRoute', lang)}` : '';

  return [headline, lines, disclaimer, routeNote].filter(Boolean).join('\n\n');
}

// ── Collect "assumption" notes from engine questions (non-"?" items) ──────────
function collectAssumptions(engineResult, lang) {
  const qs = (engineResult && engineResult.questions) || [];
  return qs.filter(q => !isRealQuestion(q, lang)).map(q => q[lang] || q.en);
}

// ── Opportunity ID handling ───────────────────────────────────────────────────
function isNoOpportunity(msg) {
  return /^(no|אין|לא|skip|דלג|no\s+\(skip\)|לא\s+\(דלג\))/i.test(msg.trim());
}

function isYesOpportunity(msg) {
  return /^(yes|כן)/i.test(msg.trim()) && !/006/i.test(msg);
}

// ── Main turn handler ──────────────────────────────────────────────────────────
async function handleTurn(sessionId, message, lang) {
  const session = getSession(sessionId);

  // Auto-detect language from message if not overridden
  if (isHebrew(message)) {
    session.lang = 'he';
  } else if (lang) {
    session.lang = lang;
  }
  const L = session.lang;

  // Record conversation
  session.conversation.push({ role: 'user', ts: new Date().toISOString(), text: message });

  let reply = '';
  let pub = null;
  let requestId = null;
  let quickReplies = null;

  // ── State: identify ──────────────────────────────────────────────────────
  if (session.state === 'identify') {
    const extracted = await extractMsg(message, session.spec);

    // Merge any spec fields found in the identification message
    mergeSpec(session.spec, extracted);

    if (extracted._companyName && !session.ctx.reseller) {
      session.ctx.reseller = extracted._companyName;
    }
    if (extracted._email && !session.ctx.email) {
      session.ctx.email = extracted._email;
    }

    if (!session.ctx.reseller) {
      reply = t('askCompany', L);
    } else if (!session.ctx.email) {
      reply = t('askEmail', L);
    } else {
      session.state = 'gather';
      reply = L === 'he'
        ? `תודה, ${session.ctx.reseller}! ${t('askCap', L)}`
        : `Thank you, ${session.ctx.reseller}! ${t('askCap', L)}`;
    }

  // ── State: gather ────────────────────────────────────────────────────────
  } else if (session.state === 'gather') {
    const extracted = await extractMsg(message, session.spec);
    mergeSpec(session.spec, extracted);
    if (extracted._companyName && !session.ctx.reseller) session.ctx.reseller = extracted._companyName;
    if (extracted._email && !session.ctx.email) session.ctx.email = extracted._email;

    // Call the engine with current spec
    let engineResult = null;
    try {
      engineResult = size(session.spec, session.ctx);
      session.lastEngineResult = engineResult;
    } catch (e) {
      // ignore sizing errors during gather
    }

    // Spec-driven question has priority
    const specQ = nextQuestion(session.spec);

    if (specQ) {
      reply = t(specQ, L);
      const qr = QUICK_REPLIES[specQ];
      if (qr) quickReplies = qr[L] || qr.en;
    } else {
      // Only surface engine items that are real questions (end with "?")
      const engineQs = engineResult && engineResult.questions ? engineResult.questions : [];
      const unasked = engineQs.filter(q =>
        isRealQuestion(q, L) && !session.askedEngineQuestions.has(q.en)
      );

      if (unasked.length > 0) {
        const q = unasked[0];
        session.askedEngineQuestions.add(q.en);
        reply = q[L] || q.en;
      } else {
        // All information collected — move to confirm
        session.state = 'confirm';
        pub = engineResult && engineResult.public ? engineResult.public : null;

        // Attach assumption notes to pub so the card can show them
        if (engineResult) {
          const assumptions = collectAssumptions(engineResult, L);
          if (assumptions.length && pub) {
            pub = { ...pub, assumptions };
          } else if (assumptions.length) {
            pub = { assumptions };
          }
        }

        reply = t('askSubmit', L);
        quickReplies = (QUICK_REPLIES.askSubmit)[L] || QUICK_REPLIES.askSubmit.en;
      }
    }

  // ── State: confirm ───────────────────────────────────────────────────────
  } else if (session.state === 'confirm') {
    const lower = message.toLowerCase().trim();
    const isSubmitYes = /^(yes|sure|ok|okay|כן|אישור|submit|שלח|נשלח|approve|אפשר|בסדר)/.test(lower);
    const isChangeSomething = /^(no|not yet|wait|לא|רגע|עצור|cancel|ביטול|change|לשנות)/.test(lower);

    if (isSubmitYes) {
      // Move to opp state to ask for opportunity ID (once)
      if (!session.askedOpportunity) {
        session.askedOpportunity = true;
        session.state = 'opp';
        reply = t('askOpportunity', L);
        quickReplies = (QUICK_REPLIES.askOpportunity)[L] || QUICK_REPLIES.askOpportunity.en;
      } else {
        // Should not normally reach here, but handle it: submit
        const result = await submitRequest(session);
        requestId = result.id;
        session.state = 'submitted';
        reply = t('submitted', L, result.id);
      }
    } else if (isChangeSomething) {
      session.state = 'gather';
      reply = t('confirmNo', L);
    } else {
      // Unrecognised — re-show the prompt
      reply = t('askSubmit', L);
      quickReplies = (QUICK_REPLIES.askSubmit)[L] || QUICK_REPLIES.askSubmit.en;
    }

  // ── State: opp ───────────────────────────────────────────────────────────
  } else if (session.state === 'opp') {
    const lower = message.trim();
    const extracted = await extractMsg(lower, session.spec);

    if (extracted._opportunityId) {
      // Got an ID like 006…
      session.ctx.opportunityId = extracted._opportunityId;
      session.ctx.hasOpportunity = true;
      const result = await submitRequest(session);
      requestId = result.id;
      session.state = 'submitted';
      reply = t('submitted', L, result.id);

    } else if (isNoOpportunity(lower)) {
      // Explicit "no" / "skip"
      const result = await submitRequest(session);
      requestId = result.id;
      session.state = 'submitted';
      reply = t('submitted', L, result.id);

    } else if (isYesOpportunity(lower)) {
      // "yes" / "כן" without an ID — ask again for the number
      reply = t('askOpportunityNumber', L);

    } else {
      // Neither a number nor no/yes — re-prompt once more
      reply = t('askOpportunity', L);
      quickReplies = (QUICK_REPLIES.askOpportunity)[L] || QUICK_REPLIES.askOpportunity.en;
    }

  // ── State: submitted ─────────────────────────────────────────────────────
  } else if (session.state === 'submitted') {
    reply = L === 'he'
      ? `הבקשה כבר נשלחה. מספר הבקשה: **${session.savedRequest && session.savedRequest.id}**`
      : `This request has already been submitted. Request ID: **${session.savedRequest && session.savedRequest.id}**`;
  }

  session.conversation.push({ role: 'agent', ts: new Date().toISOString(), text: reply });

  const response = { reply, state: session.state };
  if (pub) response.public = pub;
  if (requestId) response.requestId = requestId;
  if (quickReplies) response.quickReplies = quickReplies;
  return response;
}

// ── Merge extracted fields into spec (skip internal _ keys) ──────────────────
function mergeSpec(spec, extracted) {
  for (const [k, v] of Object.entries(extracted)) {
    if (k.startsWith('_')) continue;
    if (v !== undefined && v !== null && v !== '') {
      spec[k] = v;
    }
  }
}

// ── Build and store the submitted request ─────────────────────────────────────
async function submitRequest(session) {
  const engineResult = session.lastEngineResult || size(session.spec, session.ctx);
  const mockPrice = computePrice(engineResult);
  const id = 'REQ-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();

  const record = {
    id,
    submittedAt: new Date().toISOString(),
    status: 'pending',
    lang: session.lang,
    reseller: session.ctx.reseller || 'Unknown',
    email: session.ctx.email || '',
    opportunityId: session.ctx.opportunityId || null,
    spec: { ...session.spec },
    ctx: { ...session.ctx },
    engineResult,
    mockPrice,
    conversation: [...session.conversation],
    history: [],
  };

  session.savedRequest = record;
  return record;
}

module.exports = { handleTurn, getSession };
