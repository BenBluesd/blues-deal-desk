/* Blues Sizer: IBM FlashSystem sizing engine (Blues Distribution). Reference copy for the hackathon. Comments removed; logic unchanged. */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BluesSizer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.5.6';

  const RULES = {

    effectivePerUsable: 2.4,

    reviewAboveEffTB: 500,
    defaultFcPorts: 8,

    shipping: { feature: 'AKNC', he: 'משלוח Premium' },
  };

  const MODELS = [
    { key: 'FS5600', name: 'FlashSystem 5600', mtm: '5127-A20', slots: 12, sizes: [6.6, 13.2, 26.4, 52.8], fcPortsMax: 16, verified: true },
    { key: 'FS7600', name: 'FlashSystem 7600', mtm: '5075-A30', slots: 24, sizes: [6.6, 13.2, 26.4, 52.8], fcPortsMax: 32, verified: false },

  ];
  const FCM_FEATURE_5600 = { 6.6: 'ADSJ', 13.2: 'ADSK', 26.4: 'ADSL', 52.8: 'ADSM' };

  const BUNDLES_5600 = [
    { feature: 'ADK7', count: 2, size: 13.2 },
    { feature: 'ADK9', count: 6, size: 6.6 },
    { feature: 'ADK8', count: 2, size: 26.4 },
  ];

  const IBM_PUBLISHED_EFF = {
    'FS5600:2x13.2': 30, 'FS5600:6x6.6': 45, 'FS5600:2x26.4': 65, 'FS5600:8x6.6': 80, 'FS5600:12x6.6': 145,
    'FS5600:12x13.2': 295, 'FS5600:10x26.4': 460, 'FS5600:8x52.8': 655,
    'FS7600:14x6.6': 175, 'FS7600:24x6.6': 315, 'FS7600:18x13.2': 465, 'FS7600:24x13.2': 635, 'FS7600:18x26.4': 935,
  };

  const EC_LEVELS = ['Basic', 'Advanced'];

  const TX = {

    sfp28: { feature: 'ACJ5', name: '25GbE SW SFP28 transceivers', he: '25GbE SW SFP28 transceivers', tag: 'SFP28', verified: true },
    sfp10: { feature: 'ACJ6', name: '10GbE SW SFP+ transceivers', he: '10GbE SW SFP+ transceivers', tag: 'SFP+', verified: true },
    rj45: { feature: 'ACJC', name: '10GbE SFP+ RJ45 transceivers', he: '10GbE SFP+ RJ45 transceivers', tag: 'RJ45', verified: true },
  };
  const TX_TYPES = ['none', ...Object.keys(TX)];
  const EC_FEATURE_5600 = { Advanced: { 3: 'ALK3', 5: 'ALK5' }, Basic: { 5: 'ALJ5' } };

  const EC_NOBUNDLE_5600 = { Advanced: { 5: [{ feature: 'ALH0', qty: 1, he: 'Expert Care Indicator' }, { feature: 'ALK5', qty: 1, he: '5 year IBM Storage Expert Care Advanced (N/C)' }, { feature: '5132-A05', qty: 1, he: 'Expert Care Advanced ל-5 שנים (שירות 5132-A05)' }] },
    Basic: { 5: [{ feature: 'ALH0', qty: 1, he: 'Expert Care Indicator' }, { feature: 'ALJ5', qty: 1, he: '5 year IBM Storage Expert Care Basic (שירות ה-Basic נוסף לבד ב-e-config)' }] } };

  const H = (he, en) => ({ he, en });
  const r1 = n => Math.round(n * 10) / 10;
  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

  const allowedCounts = slots => [2, ...Array.from({ length: Math.max(0, slots - 5) }, (_, i) => i + 6)];

  const usableOf = (n, s) => (n === 2 ? s : (n - 3) * s);

  const CAP_TYPE = { 0: 'effective', 1: 'usable', 2: 'raw', 3: 'unsure' };
  const SPEED = { 0: 'fc32', 1: 'fc64', 2: 'iscsi25', 3: 'unsure', 4: 'onboard' };
  const SAN_SW = { 0: 'has', 1: 'need', 2: 'direct', 3: 'unsure' };
  const pick = (map, v, dflt) => (v === '' || v === undefined || v === null ? dflt : (map[v] !== undefined ? map[v] : (Object.values(map).includes(v) ? v : dflt)));

  function normalize(spec) {
    spec = spec || {};
    const conn = Array.isArray(spec.conn) ? spec.conn.map(String) : (spec.conn ? [String(spec.conn)] : []);
    return {
      cap: num(spec.cap),
      capType: pick(CAP_TYPE, spec.capType, 'unsure'),
      wantFC: conn.length === 0 || conn.some(c => /fc/i.test(c) || c === '0'),
      wantISCSI: conn.some(c => /iscsi/i.test(c) || c === '1'),
      speed: pick(SPEED, spec.speed, 'unsure'),
      fcPorts: num(spec.fcPorts),
      sanSw: pick(SAN_SW, spec.sanSw, 'unsure'),
      ecYears: spec.ec === 1 || spec.ec === '1' || spec.ec === 5 || spec.ec === '5' ? 5 : 3,
      ecLevel: /basic/i.test(spec.ecLevel || '') ? 'Basic' : 'Advanced',
      storageAssurance: spec.sa === 1 || spec.sa === 2 || spec.sa === '1' || spec.sa === '2',

      tier: ['entry', 'mid', 'high'].includes(spec.tier) ? spec.tier : 'auto',
      model: ['FS5600', 'FS7600'].includes(spec.model) ? spec.model : null,
      cables: spec.cables === false ? false : true,

      txType: TX_TYPES.includes(spec.txType) ? spec.txType : (spec.tx === true || spec.tx === 1 || spec.tx === '1') ? 'sfp28' : null,
    };
  }

  function sizeDrives(model, need) {
    const cands = [];
    for (const s of model.sizes) for (const n of allowedCounts(model.slots)) {
      const raw = n * s, usable = usableOf(n, s);
      const published = IBM_PUBLISHED_EFF[`${model.key}:${n}x${s}`];
      const eff = published || usable * RULES.effectivePerUsable;
      const E = 1e-6;
      const ok = need.type === 'raw' ? raw + E >= need.tb : need.type === 'usable' ? usable + E >= need.tb : eff + E >= need.tb;
      if (ok) { cands.push({ count: n, size: s, raw: r1(raw), usable: r1(usable), effective: Math.round(eff), effSource: published ? 'ibm-catalog' : 'formula' }); break; }
    }

    cands.sort((a, b) => a.raw - b.raw || a.count - b.count);
    return cands[0] || null;
  }

  function modelsToTry(n) {
    if (n.model) return MODELS.slice(MODELS.findIndex(m => m.key === n.model));
    const minIdx = n.tier === 'high' || n.tier === 'mid' ? 1 : 0;
    return MODELS.slice(minIdx);
  }

  function asciiName(name, base) {
    const a = String(name || '').replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').replace(/^[\s-]+/, '').trim();
    return (a.length >= base.length ? a : base).slice(0, 120);
  }

  function addTx(lines, out, tt, ports, where) {
    const t = TX[tt];
    if (!t) { out.notes.push(H('בלי משדרים: הלקוח מחבר את הפורטים במשדרים או בכבלי DAC משלו.', 'No transceivers: customer supplies transceivers or DAC cables.')); return; }
    lines.push({ feature: t.feature, qty: ports / 2, he: `${t.he}: ${ports} משדרים ${where}` });
    if (!t.verified) out.verify.push(H(`${t.feature} (${t.name}): לאמת ב-e-config את הקוד ושכל יחידה היא זוג משדרים (${ports / 2} יחידות ל-${ports} פורטים).`, `${t.feature}: verify code and pack size in e-config.`));
  }

  function connectivity(model, n, out) {
    const lines = [];
    let fcPorts = 0, speedLabel;
    if (n.speed === 'onboard') {

      const tt = n.txType || 'none';
      if (model.key === 'FS5600') {

        addTx(lines, out, tt, 4, 'לפורטים המובנים');
      } else {
        lines.push({ feature: null, qty: 1, he: 'פורטים מובנים (לבדוק ב-e-config מה יש ב-' + model.name + ')' });
        out.verify.push(H(`${model.name}: לבדוק ב-e-config אילו פורטים מובנים יש.`, `${model.name}: check onboard ports in e-config.`));
      }
      return { lines, fcPorts: 0, label: '4x' + (tt === 'sfp10' || tt === 'rj45' ? '10' : '25') + 'GbE onboard' + (TX[tt] ? ' + ' + TX[tt].tag : ''), iscsi: true };
    }
    const iscsiOnly = !n.wantFC && n.wantISCSI || n.speed === 'iscsi25' && !n.fcPorts;
    if (iscsiOnly) {
      speedLabel = '8x25GbE';
      if (model.key === 'FS5600') {
        lines.push({ feature: 'ALB6', qty: 1, he: '25/10 GbE Adapter pair (4 port): ‏4 פורטים בכרטיסים, יחד עם 4 המובנים 8 פורטים' });
        const tt = n.txType || 'sfp28';
        addTx(lines, out, tt, 8, 'לכל 8 הפורטים (4 בכרטיסים + 4 מובנים)');
        if (tt !== 'none') out.notes.push(H('אם המשווק ביקש פחות משדרים (למשל ארבעה בלבד, כמו בשדה בוקר), להוריד לחצי מהיחידות.', 'If fewer transceivers were requested, halve the quantity.'));
        if (tt === 'sfp10' || tt === 'rj45') speedLabel = '8x10GbE';
        if (TX[tt]) speedLabel += ' + ' + TX[tt].tag;
      } else lines.push({ feature: null, qty: 1, he: 'כרטיסי 25GbE ל-iSCSI, 8 פורטים (לבחור קוד ב-e-config)' });
      return { lines, fcPorts: 0, label: speedLabel, iscsi: true };
    }
    const fc64 = n.speed === 'fc64';
    fcPorts = Math.max(RULES.defaultFcPorts, Math.ceil((n.fcPorts || RULES.defaultFcPorts) / 8) * 8);
    if (fcPorts > model.fcPortsMax) return null;
    const pairs = fcPorts / 8;
    speedLabel = `${fcPorts}x${fc64 ? 64 : 32}Gb FC`;
    if (model.key === 'FS5600') {
      lines.push({ feature: fc64 ? 'ALB8' : 'ALB9', qty: pairs, he: `${pairs} זוגות כרטיסי FC ‏${fc64 ? 64 : 32}Gb (${fcPorts} פורטים)` });
      if (fc64) out.verify.push(H('ALB8 (64Gb FC): לאמת ב-e-config כמה פורטים יש בכל זוג.', 'ALB8 (64Gb FC): verify ports per pair in e-config.'));
      if (n.cables) lines.push({ feature: 'ACSR', qty: fcPorts, he: `${fcPorts} כבלי OM3 באורך 5 מ'` });
    } else {
      lines.push({ feature: null, qty: fcPorts, he: `${fcPorts} פורטי FC ‏${fc64 ? 64 : 32}Gb (לבחור קודים ב-e-config)` });
    }
    if (n.wantISCSI) out.notes.push(H('iSCSI בנוסף ל-FC: יש פורטי 25/10Gb מובנים. אם צריך יותר, להוסיף כרטיס.', 'iSCSI in addition to FC: onboard 25/10Gb ports exist; add a card if more are needed.'));
    return { lines, fcPorts, label: speedLabel, iscsi: n.wantISCSI };
  }

  function size(spec, ctx) {
    ctx = ctx || {};
    const n = normalize(spec);
    const out = {
      engine: 'blues-sizer', version: VERSION, family: 'FlashSystem',
      route: 'auto', reasons: [], questions: [], notes: [], verify: [],
      input: n, recommendation: null, econfig: null, public: null,
    };
    const Q = (he, en) => out.questions.push(H(he, en));

    if (!n.cap) { out.route = 'custom'; out.reasons.push(H('לא צוינה קיבולת', 'No capacity given')); return finish(out, ctx); }
    const need = { tb: n.cap, type: n.capType === 'unsure' ? 'effective' : n.capType };

    let chosen = null;
    for (const m of modelsToTry(n)) {
      const conn = connectivity(m, n, { verify: [], notes: [] });
      if (!conn) continue;
      const d = sizeDrives(m, need);
      if (!d) continue;
      chosen = { model: m, drives: d };
      break;
    }
    if (!chosen) {
      out.route = 'custom';
      out.reasons.push(H('הצורך גדול ממה שנכנס בכוננים הפנימיים או בפורטים של הדגמים. כנראה צריך מדפי הרחבה (למשל 4662-92G) או שתי מערכות. הצוות שלנו בונה אותה ידנית.',
        'Requirement exceeds internal drives or ports. Likely needs expansion drawers (e.g. 4662-92G) or two systems. Our team builds it manually.'));
      return finish(out, ctx);
    }

    const { model, drives } = chosen;
    if (n.model && model.key !== n.model) out.notes.push(H(`הנפח או הפורטים לא נכנסים ב-${n.model.replace('FS', 'FlashSystem ')}, לכן הומלץ ${model.name}.`, `Did not fit ${n.model}; recommended ${model.name}.`));
    const conn = connectivity(model, n, out);
    if (!model.verified) out.verify.push(H(`${model.name}: מספר המפרצים, הגדלים ומקסימום הפורטים לא נבדקו עדיין ב-e-config. לאמת.`, `${model.name}: slots, sizes and max ports not yet verified in e-config.`));

    let driveLines;
    const bundle = model.key === 'FS5600' && BUNDLES_5600.find(b => b.count === drives.count && b.size === drives.size);
    if (bundle) driveLines = [{ feature: bundle.feature, qty: 1, he: `Value Bundle: ${drives.count} כונני FCM5 של ${drives.size}TB` }];
    else driveLines = [{ feature: model.key === 'FS5600' ? FCM_FEATURE_5600[drives.size] : null, qty: drives.count, he: `${drives.count} כונני FCM5 של ${drives.size}TB` }];

    const ecNoBundle = model.key === 'FS5600' && !bundle ? ((EC_NOBUNDLE_5600[n.ecLevel] || {})[n.ecYears] || null) : null;
    const ecFeature = model.key === 'FS5600' && bundle ? (EC_FEATURE_5600[n.ecLevel] || {})[n.ecYears] || null : null;
    if (model.key === 'FS5600' && !bundle && !ecNoBundle && n.ecLevel === 'Advanced') out.notes.push(H(`Expert Care Advanced ל-${n.ecYears} שנים בלי Value Bundle: לבחור ב-e-config (ל-5 שנים זה ALH0 + 5132-A05).`, 'Expert Care without bundle: pick in e-config.'));
    if (n.ecLevel === 'Basic' && n.ecYears !== 5) out.notes.push(H(`Expert Care Basic: ב-e-config לבחור "${n.ecYears} year IBM Storage Expert Care Basic" (הקוד עוד לא נשמר במנוע).`, `Expert Care Basic: pick "${n.ecYears} year IBM Storage Expert Care Basic" in e-config.`));
    if (/premium/i.test((spec && spec.ecLevel) || '')) out.notes.push(H('המשווק ביקש Premium, שלא מוצע כרגע. חושב לפי Advanced.', 'Premium requested but not offered now; sized as Advanced.'));

    let san = null;
    if (n.sanSw === 'need') {
      const perSwitch = Math.min(24, Math.max(8, Math.ceil(conn.fcPorts / 2) + 8));
      san = { model: 'SAN24B-7', mtm: '8969-P24', qty: 2, activePortsPerSwitch: perSwitch,
        he: `2 מתגי SAN24B-7 (שני Fabric), כ-${perSwitch} פורטים פעילים בכל מתג` };
      Q('הוספנו שני מתגים לשרידות. כמה שרתים יתחברו, ובכמה פורטים כל אחד?', 'We added two switches for redundancy. How many servers connect, and with how many ports each?');
    } else if (n.sanSw === 'unsure' && conn.fcPorts) {
      Q('יש ללקוח מתגי SAN, או שצריך מתגים חדשים?', 'Does the customer have SAN switches, or are new ones needed?');
    }

    if (n.capType === 'unsure') Q('לא צוין אם הקיבולת היא Effective או Usable. חישבנו לפי Effective, כלומר אחרי דחיסה.', 'Capacity type not given. We assumed effective (after data reduction).');
    if (need.type === 'effective') Q(`הקיבולת האפקטיבית מניחה דחיסה של כ-${RULES.effectivePerUsable}:1 ותלויה בסוג המידע. כדאי לבדוק מה סוג המידע אצל הלקוח (מסדי נתונים, VM, קבצים, מידע מוצפן).`, `Effective capacity assumes ~${RULES.effectivePerUsable}:1 data reduction and depends on the data type.`);
    if (n.speed === 'unsure' && conn.fcPorts) Q('לוודא שמהירות 32Gb FC מתאימה ללקוח.', 'Confirm 32Gb FC suits the customer.');
    if (!n.fcPorts && conn.fcPorts) Q(`לא צוין מספר פורטי FC. הנחנו ${conn.fcPorts}.`, `No FC port count given. We assumed ${conn.fcPorts}.`);
    if (ctx.hasOpportunity === false) Q('מה מספר ההזדמנות (Opportunity, מתחיל ב-006) ברישום העסקה מול IBM? בלעדיו ePricer לא נותן מחיר Value Seller.', 'What is the IBM opportunity ID (starts with 006)? ePricer cannot price without it.');
    if (drives.count === 2) out.notes.push(H('2 כוננים בתצורת שיקוף (DRAID1). מתאים לנפח קטן. להרחבה עתידית עדיף 6 כוננים ומעלה.', '2 drives mirrored (DRAID1); 6+ drives preferred for future growth.'));
    if (drives.count < model.slots) out.notes.push(H(`נשארים ${model.slots - drives.count} מפרצים פנויים להרחבה עתידית.`, `${model.slots - drives.count} free slots for growth.`));

    if (drives.effective > RULES.reviewAboveEffTB || (need.type === 'effective' && n.cap > RULES.reviewAboveEffTB)) {
      out.route = 'review'; out.reasons.push(H('בקשה גדולה: הצוות שלנו בודק את התצורה לפני שהיא יוצאת.', 'Large request: our team reviews it before it goes out.'));
    }
    if (out.verify.length && out.route === 'auto') { out.route = 'review'; out.reasons.push(H('יש נתונים בתצורה שצריך לאמת ב-e-config.', 'Some configuration details need e-config verification.')); }

    const ecLabel = `Expert Care ${n.ecLevel === 'Basic' ? 'Basic' : 'Adv'} ${n.ecYears}Y`;
    const driveLabel = `${drives.count}x${drives.size}TB FCM`;
    const baseName = `${model.key} - ${driveLabel} - ${conn.label} - ${ecLabel}`;
    const who = [ctx.reseller, ctx.endCustomer].filter(Boolean).join(' ').trim();

    out.recommendation = {
      model: model.name, mtm: model.mtm,
      drives: { count: drives.count, sizeTB: drives.size, bundle: bundle ? bundle.feature : null },
      capacityTB: { raw: drives.raw, usable: drives.usable, effectiveEstimate: drives.effective, effectiveSource: drives.effSource, basis: need.type, requested: n.cap },
      connectivity: conn.label, fcPorts: conn.fcPorts,
      expertCare: { years: n.ecYears, level: n.ecLevel },
      san, storageAssurance: n.storageAssurance,
    };

    out.econfig = {

      name: (who ? who + ' - ' : '') + baseName,
      brand: 'Storage Subsystem Products', ceid: 'Blues Distribution Ltd - IL', geography: 'EMEA', country: 'Israel',
      product: { mtm: model.mtm, name: model.name, qty: 1 },
      mode: 'custom',
      lines: [...driveLines, ...conn.lines,
        ...(ecNoBundle || [{ feature: ecFeature, qty: 1, he: `Expert Care ${n.ecLevel} ל-${n.ecYears} שנים` }]),
        { feature: RULES.shipping.feature, qty: 1, he: RULES.shipping.he }],
      settings: {
        mediaRetention: false,
        includeFcCables: !!(conn.fcPorts && n.cables),
        keepSan24b7: !!san,
        remove5608PC2: true,
        keepSupportLine: true,
      },
      verify: out.verify.map(v => v.he),

      nameAscii: null,
    };
    out.econfig.nameAscii = asciiName(out.econfig.name, baseName);
    return finish(out, ctx);
  }

  function finish(out, ctx) {
    const r = out.recommendation;
    out.public = {
      route: out.route,
      headline: r
        ? H(`IBM ${r.model} עם ${r.drives.count} כונני FCM5 של ${r.drives.sizeTB}TB`, `IBM ${r.model} with ${r.drives.count} × ${r.drives.sizeTB}TB FCM5`)
        : H('הבקשה עוברת לבניית תצורה אישית', 'This request goes to a custom configuration'),
      lines: r ? [
        H(`נפח: ${r.capacityTB.raw}TB פיזי, כ-${r.capacityTB.usable}TB שמיש (${r.drives.count === 2 ? 'DRAID1' : 'DRAID6'}), כ-${r.capacityTB.effectiveEstimate}TB אפקטיבי אחרי דחיסה (הערכה)`,
          `Capacity: ${r.capacityTB.raw}TB physical, ~${r.capacityTB.usable}TB usable (${r.drives.count === 2 ? 'DRAID1' : 'DRAID6'}), ~${r.capacityTB.effectiveEstimate}TB effective (estimate)`),
        H(`קישוריות: ${r.connectivity}`, `Connectivity: ${r.connectivity}`),
        H(`Expert Care ${r.expertCare.level} ל-${r.expertCare.years} שנים`, `Expert Care ${r.expertCare.level}, ${r.expertCare.years} years`),
        ...(r.san ? [H(r.san.he, `2 × SAN24B-7 switches (dual fabric), ~${r.san.activePortsPerSwitch} active ports each`)] : []),
      ] : [],
      questions: out.questions,
      reasons: out.reasons,
      disclaimer: H('הערכה ראשונית בלבד. התצורה הסופית והמחיר יגיעו מבלוז.', 'Preliminary estimate only. Final configuration and price come from Blues.'),
    };
    return out;
  }

  const QK_RE = /^(AD[KST]\w|AL[38]\w|ALB\w|ACJ\w|ACH\w|ALJ\w|ALK\w|ALL\w|ALG\w)$/;
  function quickKey(res) {
    const ec = (res && res.econfig) || res || {};
    const mtm = ec.mtm || (ec.product && ec.product.mtm) || '';
    const parts = (ec.lines || []).filter(l => l && l.feature && QK_RE.test(l.feature) && (l.qty || 0) > 0)
      .map(l => l.feature + 'x' + l.qty).sort();
    return [mtm, ...parts].join('|');
  }

  return { VERSION, RULES, MODELS, EC_LEVELS, TX, size, normalize, usableOf, quickKey };
});
