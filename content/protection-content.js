// Page content analysis. Runs on the page once it has loaded and scores what it
// finds (login forms, brand impersonation, explicit text, age gates...). Nothing
// is sent anywhere: only a verdict goes to the background script.
(function (root) {
  const P = root.WBProtection;

  const URGENCY = /(within\s+\d+\s+(hours?|days?)|account\s+(has\s+been\s+)?(suspended|locked|limited)|verify\s+your\s+(identity|account)|unusual\s+activity|confirm\s+your\s+(identity|account|payment)|votre\s+compte\s+(a\s+été|sera|est)\s+(suspendu|bloqué|limité)|vérifi(er|ez)\s+votre\s+(identité|compte)|activité\s+inhabituelle|colis\s+en\s+attente|frais\s+de\s+livraison|remboursement\s+en\s+attente)/i;

  const EXPLICIT = /(?<![\p{L}])(porn(o|ography|star|stars)?|pornographie|xxx|hardcore\s+sex|blowjobs?|handjobs?|milfs?|cumshots?|creampies?|gangbangs?|camgirls?|vid[ée]os?\s+x|films?\s+x|fellation|sodomie|branlette|sex\s+cams?|live\s+sex|free\s+sex|sex\s+videos?|sex\s+tube|nsfw)(?![\p{L}])/giu;

  const AGE_GATE = /(you\s+must\s+be\s+(at\s+least\s+)?(18|21)|i\s+am\s+(at\s+least\s+)?(18|over\s+18|18\s+or\s+older|over\s+21)|are\s+you\s+(over|at\s+least)\s+(18|21)|adults?\s+only|contains\s+(adult|explicit)|j['’]ai\s+(plus\s+de\s+|au\s+moins\s+)?18\s+ans|vous\s+devez\s+avoir\s+(plus\s+de\s+|au\s+moins\s+)?18\s+ans|réservé\s+aux\s+adultes|contenu\s+(pour\s+adultes|réservé\s+aux\s+adultes|explicite)|site\s+(pour\s+adultes|réservé\s+aux\s+majeurs))/i;

  // Title/heading wording of a page that talks ABOUT the subject (advice, news, law, filters).
  const ADULT_ABOUT = /(block|filter|parental|addict|quit|stop|health|study|studies|research|law|danger|harm|effects?|impact|protect|child|kids|teenagers?|enfants?|ados?|bloquer|filtr|contr[oô]le\s+parental|d[ée]pendance|sant[ée]|[ée]tude|loi|pr[ée]vention|[ée]ducation|why|how\s+to|pourquoi|comment)/i;
  const PHISH_ABOUT = /(phishing|hame[cç]onnage|scams?|arnaques?|fraud|fraude|fake|faux|how\s+to|comment\s|reviews?|avis|\bvs\.?\b|alternatives?|tutorial|tutoriel|guide|forum|news|actualit)/i;
  // "Sign in with Google" style buttons/titles name a brand without claiming to be it.
  const SSO_PHRASE = /((sign|log)\s*in|continue|connect|sign\s*up|register)\s+(with|using|via)\s+\S+|((se\s+)?connecter|connexion|continuer|s['’]inscrire)\s+(avec|via)\s+\S+/gi;

  // Reference, health, news and search sites often discuss these topics without being adult sites.
  const ADULT_SKIP = ['wikipedia.org', 'wikimedia.org', 'wiktionary.org', 'britannica.com', 'who.int', 'nih.gov',
    'doctissimo.fr', 'ameli.fr', 'santepubliquefrance.fr', 'service-public.fr', 'lemonde.fr', 'lefigaro.fr',
    'liberation.fr', 'francetvinfo.fr', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'theguardian.com',
    'bing.com', 'duckduckgo.com', 'qwant.com', 'ecosia.org', 'yahoo.com', 'search.brave.com',
    'nhs.uk', 'mayoclinic.org', 'webmd.com', 'healthline.com', 'medicalnewstoday.com', 'psychologytoday.com',
    'plannedparenthood.org', 'e-enfance.org', 'internetmatters.org', 'commonsensemedia.org', 'unicef.org'];
  function adultSkipped(host) {
    return /\.(gov|edu|mil|int)$|\.(gov|gouv|edu|ac|gob|nhs)\.[a-z]{2}$|\.gouv\.[a-z]{2}\.[a-z]{2}$/.test(host) ||
      /^(www\.)?google\./.test(host) || /(^|[.-])(health|sante|medical|clinic|hospital)([.-]|$)/.test(host) ||
      ADULT_SKIP.some(d => host === d || host.endsWith('.' + d));
  }

  // A page can shadow DOM methods with named form controls (<input name="querySelector">)
  // or named elements on document. Always call the prototype versions.
  function domTools(doc) {
    const w = doc.defaultView || root;
    const EP = w.Element.prototype, DP = w.Document.prototype;
    const desc = (proto, name) => { const d = Object.getOwnPropertyDescriptor(proto, name); return d && d.get; };
    const textGet = desc(w.Node.prototype, 'textContent');
    const innerGet = w.HTMLElement && desc(w.HTMLElement.prototype, 'innerText');
    return {
      all: (sel) => Array.from(DP.querySelectorAll.call(doc, sel)),
      one: (sel) => DP.querySelector.call(doc, sel),
      within: (el, sel) => EP.querySelector.call(el, sel),
      attr: (el, name) => EP.getAttribute.call(el, name) || '',
      text: (el) => (el && textGet.call(el)) || '',
      inner: (el) => { try { return (el && innerGet && innerGet.call(el)) || ''; } catch (e) { return ''; } },
      rects: (el) => EP.getClientRects.call(el).length
    };
  }

  // opts.assumeVisible is for tests (no layout engine there).
  function analyze(doc, loc, opts) {
    opts = opts || {};
    const D = domTools(doc);
    const host = String(loc.hostname).toLowerCase().replace(/\.+$/, '');
    const visible = (el) => opts.assumeVisible || D.rects(el) > 0;
    const body = D.one('body');
    const text = (D.inner(body) || D.text(body)).slice(0, 30000);
    const title = D.text(D.one('title')).slice(0, 300);
    const h1 = D.all('h1').slice(0, 3).map(h => D.text(h).slice(0, 200)).join(' ');
    const myReg = P.registrable(host);

    // 1) Adult content. Mentions are not enough: the page has to present itself as
    // explicit (title, headings, meta, links) AND show an age gate or many adult links.
    if (!adultSkipped(host)) {
      for (const m of D.all('meta[name="rating" i], meta[http-equiv="pics-label" i]')) {
        const v = D.attr(m, 'content').toLowerCase();
        if (v.includes('rta-5042-1996-1400-1577-rta') || /^adult\b/.test(v.trim())) {
          return { type: 'adult', reason: 'The page labels itself as adult content (RTA / rating label).' };
        }
      }
      const count = (s) => (s.match(EXPLICIT) || []).length;
      const metaText = D.all('meta[name="description" i], meta[name="keywords" i], meta[property="og:title"], meta[property="og:description"]')
        .map(m => D.attr(m, 'content').slice(0, 500)).join(' ');
      const headText = D.all('h1, h2, h3').slice(0, 30).map(h => D.text(h).slice(0, 200)).join(' | ');
      const structHits = count(title) + count(metaText) + count(headText);
      if (structHits >= 2 && !ADULT_ABOUT.test(title + ' ' + h1)) {
        let explicitLinks = 0, adultOut = 0;
        const one = new RegExp(EXPLICIT.source, 'iu');
        for (const a of D.all('a[href]').slice(0, 500)) {
          const href = D.attr(a, 'href');
          if (one.test(href.slice(0, 300) + ' ' + D.text(a).slice(0, 80))) explicitLinks++;
          try {
            const u = new URL(href, loc.href);
            if (/^https?:$/.test(u.protocol) && P.registrable(u.hostname) !== myReg) {
              const v = P.evaluate(u.href);
              if (v && v.type === 'adult') adultOut++;
            }
          } catch (e) { }
        }
        const gate = AGE_GATE.test(text);
        if (structHits + explicitLinks >= 5 && (gate || adultOut >= 5 || explicitLinks >= 12)) {
          return { type: 'adult', reason: 'The page presents explicit content (titles, links' + (gate ? ', age warning' : '') + ').' };
        }
      }
    }

    // 2) Phishing / impersonation (skipped on official brand domains).
    // A brand word next to a normal login form is NOT enough (forums, news, shops,
    // "Sign in with Google"). The page must present itself AS the brand, ask for a
    // password, and show a further sign: password sent to another site, pressure
    // wording, payment fields, a hidden foreign frame.
    if (!P.isAnyOfficial(host)) {
      const pwFields = D.all('input[type="password" i]').filter(visible);
      const hasPw = pwFields.length > 0;

      const og = D.one('meta[property="og:site_name"]');
      const logos = D.all('img[alt][class*="logo" i], img[alt][id*="logo" i], img[alt][src*="logo" i], header img[alt]')
        .slice(0, 3).map(i => D.attr(i, 'alt').slice(0, 80)).join(' ');
      const heads = [title, og ? D.attr(og, 'content') : '', h1, logos].join(' ').replace(SSO_PHRASE, ' ');
      const ownTokens = myReg.split('.')[0].split(/[-_]+/);
      let impersonated = null;
      if (!PHISH_ABOUT.test(title + ' ' + h1)) {
        impersonated = P.brandsIn(heads).find(b => !P.isOfficialHost(b, host) &&
          // "The Orange Tree" on the-orange-tree.co.uk is the site's own name
          !(b.common && ownTokens.includes(b.t))) || null;
      }

      let crossHost = null;
      if (hasPw) {
        for (const f of D.all('form')) {
          if (!D.within(f, 'input[type="password" i]')) continue;
          let action;
          try { action = new URL(D.attr(f, 'action'), loc.href); } catch (e) { continue; }
          const ah = action.hostname.toLowerCase();
          // posting to the real brand (or another known official site) is an integration, not theft
          if (/^https?:$/.test(action.protocol) && P.registrable(ah) !== myReg && !P.isAnyOfficial(ah)) {
            crossHost = action.hostname;
            break;
          }
        }
      }
      const urgent = URGENCY.test(text);
      const card = !!D.one('input[autocomplete="cc-number" i], input[name*="card" i][type="text" i], input[name*="cvv" i], input[name*="cvc" i], input[name*="iban" i]');
      let hiddenFrame = false;
      for (const fr of D.all('iframe').slice(0, 50)) {
        const w = parseInt(D.attr(fr, 'width'), 10), h = parseInt(D.attr(fr, 'height'), 10);
        const hidden = (w <= 2 && h <= 2) || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(D.attr(fr, 'style'));
        let cross = false;
        try { const src = D.attr(fr, 'src'); cross = !!src && P.registrable(new URL(src, loc.href).hostname.toLowerCase()) !== myReg; } catch (e) { }
        if (hidden && cross) { hiddenFrame = true; break; }
      }

      const extra = (crossHost ? 1 : 0) + (urgent ? 1 : 0) + (card ? 1 : 0) + (hiddenFrame ? 1 : 0);
      if (impersonated && hasPw && extra >= (impersonated.common ? 2 : 1)) {
        return { type: 'danger', reason: 'This page asks for a password while presenting itself as "' + impersonated.t + '", but the site is not ' + impersonated.t + '.' };
      }
      if (impersonated && !impersonated.common && card && urgent) {
        return { type: 'danger', reason: 'The page asks for payment details while presenting itself as "' + impersonated.t + '" and pressuring you.' };
      }
      if (hasPw && crossHost && urgent) {
        return { type: 'danger', reason: 'The page pressures you to log in and would send your password to another site (' + crossHost + ').' };
      }
    }
    return null;
  }

  root.WBAnalyze = { analyze };

  // ---- Runtime (content-script context only) ----
  if (typeof document === 'undefined' || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
  if (root !== root.top || !/^https?:$/.test(location.protocol) || !P || P.isPrivateHost(location.hostname.toLowerCase())) return;

  let sent = false;
  function run() {
    if (sent) return;
    try {
      const v = analyze(document, location);
      if (v) { sent = true; chrome.runtime.sendMessage({ type: 'PROTECTION_CONTENT', verdict: v }).catch(() => { }); }
    } catch (e) { }
  }

  // Login forms inserted later (single-page apps, delayed scripts): re-run when a
  // password field appears. Bounded: at most 3 extra runs, and it stops after 15 s.
  function watchLateForms() {
    const EP = Element.prototype;
    const isPw = (el) => el && el.nodeType === 1 && (EP.matches.call(el, 'input[type="password" i]') || !!EP.querySelector.call(el, 'input[type="password" i]'));
    let runs = 0, timer = null;
    const obs = new MutationObserver((list) => {
      if (sent) { stop(); return; }
      let hit = false;
      for (const m of list) {
        if (m.type === 'attributes') { if (isPw(m.target)) hit = true; }
        else for (const n of m.addedNodes) { if (isPw(n)) { hit = true; break; } }
        if (hit) break;
      }
      if (!hit || timer) return;
      timer = setTimeout(() => {
        timer = null;
        runs++;
        run();
        if (sent || runs >= 3) stop();
      }, 300);
    });
    function stop() { try { obs.disconnect(); } catch (e) { } }
    try {
      obs.observe(Document.prototype.querySelector.call(document, 'html'), { childList: true, subtree: true, attributes: true, attributeFilter: ['type'] });
      setTimeout(stop, 15000);
    } catch (e) { }
  }

  chrome.storage.local.get('protectionSettings', (d) => {
    const s = Object.assign({ enabled: true, content: true }, (d && d.protectionSettings) || {});
    if (!s.enabled || !s.content) return;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      run();
      setTimeout(run, 3000); // second pass catches late-rendered pages
      watchLateForms();
    };
    // readyState is read through the prototype: the page could shadow document.readyState.
    let ready = false;
    try { ready = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState').get.call(document) === 'complete'; } catch (e) { }
    if (ready) start();
    else { window.addEventListener('load', start, { once: true }); setTimeout(start, 8000); }
  });
})(typeof self !== 'undefined' ? self : this);
