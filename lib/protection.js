// Local URL screening: lookalike/phishing-style URLs and adult sites.
// Pure heuristics, no network call — nothing leaves the browser.
// Rule of thumb throughout: when in doubt, do not flag.
(function (root) {
  // ---------- Public suffixes ----------
  // Generic rule: "<x>.<SECOND>.<2-letter tld>" (co.uk, com.hk, gov.au, ac.jp...).
  const SECOND_LEVEL = new Set(['com', 'co', 'org', 'net', 'gov', 'edu', 'ac', 'gouv', 'gob', 'go', 'or', 'ne', 'mil', 'nom', 'sch']);
  const TWO_LEVEL = new Set(['gouv.fr', 'asso.fr', 'tm.fr', 'qc.ca', 'on.ca', 'bc.ca', 'ab.ca', 'gc.ca', 'me.uk', 'ltd.uk',
    'plc.uk', 'nhs.uk', 'police.uk', 'id.au', 'asn.au', 'eu.com', 'uk.com', 'us.com', 'de.com', 'gb.net', 'in.net',
    'nic.in', 'res.in', 'firm.in', 'gen.in', 'ind.in', 'k12.us', 'priv.no', 'kommune.no']);
  // Hosting platforms: the customer picks the label(s) in front, so that part is
  // the "registrable" name. deep: the customer label is the first one (AWS-style).
  const HOSTING = ['github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'web.app',
    'firebaseapp.com', 'herokuapp.com', 'azurewebsites.net', 'blogspot.com', 'wordpress.com', 'sharepoint.com',
    'appspot.com', 'glitch.me', 'replit.app', 'repl.co', 'onrender.com', 'fly.dev', 'surge.sh', 'weebly.com',
    'wixsite.com', 'webflow.io', 'myshopify.com', 'godaddysites.com', 'square.site', 'r2.dev', 'ngrok.io',
    'ngrok-free.app', 'trycloudflare.com', '000webhostapp.com', 'duckdns.org', 'framer.app', 'carrd.co',
    'notion.site', 'tumblr.com', 'translate.goog', 'azureedge.net', 'cloudfront.net', 'netlify.com', 'vercel.dev'];
  const HOSTING_DEEP = ['amazonaws.com', 'amazoncognito.com', 'windows.net', 'googleusercontent.com', 'oraclecloud.com',
    'digitaloceanspaces.com', 'backblazeb2.com'];

  const SUSPICIOUS_TLDS = new Set(['zip', 'mov', 'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'click', 'country',
    'kim', 'loan', 'work', 'rest', 'support', 'icu', 'monster', 'cyou', 'buzz', 'sbs', 'cfd', 'live', 'help']);
  // Free / throwaway extensions: a brand name there is never treated as official.
  const FREE_TLDS = new Set(['tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'icu', 'cyou', 'sbs', 'cfd', 'buzz', 'monster',
    'click', 'zip', 'mov', 'loan', 'rest']);

  // Whole hyphen/dot-separated tokens only ("colis" never matches inside "colissimo").
  const PHISH_WORDS = new Set(['login', 'signin', 'logon', 'verify', 'verification', 'secure', 'security', 'account',
    'accounts', 'update', 'confirm', 'wallet', 'bank', 'banking', 'support', 'helpdesk', 'connexion', 'compte',
    'verifier', 'securite', 'remboursement', 'refund', 'suspended', 'suspendu', 'unlock', 'debloquer', 'password',
    'motdepasse', 'billing', 'invoice', 'facture', 'livraison', 'colis', 'tracking']);
  // Extra words that only matter next to a brand name.
  const BRAND_WORDS = new Set(['id', 'find', 'suivi', 'fr', 'com', 'gouv', 'amende', 'amendes', 'pay', 'client',
    'clients', 'espace', 'help', 'alert', 'alerte', 'auth', 'sso', 'recovery', 'reset', 'paiement', 'payment']);
  const TLDISH = new Set(['com', 'net', 'org', 'fr', 'co', 'de', 'uk', 'es', 'be', 'ch', 'ca', 'gouv', 'gov']);

  // t: canonical name. n: other spellings to look for (hyphens removed). d: official domains.
  // common: the name is an ordinary word or very short, so more evidence is needed.
  const BRANDS = [
    { t: 'paypal', d: ['paypal.com', 'paypal.me', 'paypalobjects.com', 'paypal-community.com'] },
    { t: 'microsoft', n: ['microsoftonline'], d: ['microsoft.com', 'live.com', 'office.com', 'microsoftonline.com', 'outlook.com', 'windows.com', 'xbox.com', 'office365.com', 'microsoft365.com', 'sharepoint.com', 'azure.com', 'bing.com', 'skype.com', 'msn.com', 'hotmail.com', 'onedrive.com'] },
    { t: 'office365', n: ['microsoft365'], d: ['office365.com', 'microsoft365.com', 'office.com', 'microsoft.com'] },
    { t: 'outlook', common: true, d: ['outlook.com', 'live.com', 'office.com', 'microsoft.com'] },
    { t: 'netflix', d: ['netflix.com', 'netflixtechblog.com', 'nflxvideo.net'] },
    { t: 'facebook', d: ['facebook.com', 'fb.com', 'messenger.com', 'meta.com'] },
    { t: 'instagram', d: ['instagram.com'] },
    { t: 'whatsapp', d: ['whatsapp.com', 'whatsapp.net'] },
    { t: 'linkedin', d: ['linkedin.com'] },
    { t: 'amazon', common: true, d: ['amazonaws.com', 'amazon.jobs', 'amazon.dev', 'primevideo.com'] },
    { t: 'google', d: ['googleapis.com', 'googleusercontent.com', 'gstatic.com', 'googlevideo.com', 'googlesyndication.com', 'googletagmanager.com', 'google-analytics.com', 'withgoogle.com', 'youtube.com', 'gmail.com'] },
    { t: 'apple', common: true, n: ['appleid'], d: ['apple.com', 'icloud.com'] },
    { t: 'icloud', d: ['icloud.com', 'apple.com'] },
    { t: 'binance', d: ['binance.com'] },
    { t: 'coinbase', d: ['coinbase.com'] },
    { t: 'metamask', d: ['metamask.io'] },
    { t: 'ameli', d: ['ameli.fr'] },
    { t: 'impots', common: true, n: ['impotsgouv'], d: ['impots.gouv.fr'] },
    { t: 'antai', d: ['antai.gouv.fr', 'amendes.gouv.fr'] },
    { t: 'laposte', d: ['laposte.fr', 'laposte.net', 'lapostemobile.fr', 'groupelaposte.com'] },
    { t: 'colissimo', d: ['colissimo.fr', 'colissimo.com', 'laposte.fr'] },
    { t: 'chronopost', d: ['chronopost.fr', 'chronopost.com'] },
    { t: 'mondialrelay', d: ['mondialrelay.fr', 'mondialrelay.com'] },
    { t: 'orange', common: true, d: ['orange.fr', 'orange.com', 'orange-business.com', 'orangebank.fr', 'sosh.fr'] },
    { t: 'sfr', common: true, d: ['sfr.fr', 'sfr.net', 'red-by-sfr.fr'] },
    { t: 'creditagricole', d: ['credit-agricole.fr', 'credit-agricole.com'] },
    { t: 'bnpparibas', d: ['bnpparibas.com', 'bnpparibas.net', 'bnpparibas.fr', 'bnpparibasfortis.be'] },
    { t: 'societegenerale', d: ['societegenerale.fr', 'societegenerale.com'] },
    { t: 'labanquepostale', d: ['labanquepostale.fr'] },
    { t: 'caisseepargne', n: ['caissedepargne'], d: ['caisse-epargne.fr', 'caisse-epargne.com'] },
    { t: 'boursorama', d: ['boursorama.com', 'boursobank.com'] },
    { t: 'fedex', common: true, d: ['fedex.com'] },
    { t: 'dhl', common: true, d: ['dhl.com'] }
  ];
  // Extensions owned by a brand (.google, .bnpparibas...): everything under them is official.
  const BRAND_TLDS = new Set(['google', 'goog', 'youtube', 'gmail', 'android', 'chrome', 'microsoft', 'azure', 'office',
    'windows', 'xbox', 'skype', 'bing', 'apple', 'amazon', 'aws', 'bnpparibas', 'dhl', 'fedex', 'orange', 'sfr',
    'netflix', 'axa', 'leclerc', 'sncf', 'ovh', 'hsbc', 'barclays', 'visa', 'bbc', 'sky']);
  for (const b of BRANDS) {
    b.names = [b.t].concat(b.n || []);
    // Main labels that count as "the brand's own name" (credit-agricole, microsoftonline...).
    b.labels = new Set(b.names);
    for (const d of b.d) b.labels.add(d.split('.')[0]);
  }
  // Near-misses of a brand that are real words or sites of their own.
  const LOOKALIKE_SAFE = new Set(['goggle', 'goggles', 'googly', 'finance', 'finances', 'netflux', 'linkedit',
    'oranges', 'apples', 'amazone', 'amazons', 'amazonia', 'amelie', 'paypay', 'posteo']);

  // ---------- Adult ----------
  const ADULT_DOMAINS = new Set(['pornhub.com', 'xvideos.com', 'xvideos.red', 'xnxx.com', 'xhamster.com', 'redtube.com',
    'youporn.com', 'spankbang.com', 'eporner.com', 'tube8.com', 'tnaflix.com', 'hqporner.com', 'porn.com',
    'beeg.com', 'txxx.com', '4tube.com', 'motherless.com', 'thumbzilla.com', 'brazzers.com', 'realitykings.com',
    'naughtyamerica.com', 'bangbros.com', 'chaturbate.com', 'stripchat.com', 'bongacams.com', 'livejasmin.com',
    'camsoda.com', 'cam4.com', 'myfreecams.com', 'jerkmate.com', 'flirt4free.com', 'onlyfans.com', 'fansly.com',
    'erome.com', 'rule34.xxx', 'e-hentai.org', 'nhentai.net', 'hanime.tv', 'fapello.com', 'pornpics.com',
    'sex.com', 'daftsex.com', 'sxyprn.com', 'pornone.com', 'upornia.com', 'hclips.com', 'vporn.com',
    'drtuber.com', 'sunporno.com', 'nuvid.com', 'empflix.com', 'gotporn.com', 'pichunter.com', 'kink.com',
    'jacquieetmichel.net', 'jacquieetmicheltv.net', 'dorcel.com', 'dorcelvision.com', 'xstory-fr.com',
    'youjizz.com', 'spankwire.com', 'redgifs.com', 'xtube.com', 'keezmovies.com', 'extremetube.com',
    'literotica.com', 'manyvids.com', 'clips4sale.com', 'imlive.com', 'adultfriendfinder.com', 'tukif.com',
    'coqnu.com', 'fuq.com', 'ixxx.com', 'gelbooru.com', 'e621.net', 'hentaihaven.xxx', '8muses.com']);
  // Unmistakable site names: flagged on any extension, also with simple leet (p0rnhub).
  const ADULT_NAMES = new Set(['pornhub', 'xvideos', 'xvideo', 'xnxx', 'xhamster', 'redtube', 'youporn', 'spankbang',
    'eporner', 'tnaflix', 'hqporner', 'youjizz', 'spankwire', 'redgifs', 'thumbzilla', 'brazzers', 'realitykings',
    'naughtyamerica', 'bangbros', 'chaturbate', 'stripchat', 'bongacams', 'livejasmin', 'camsoda', 'myfreecams',
    'jerkmate', 'onlyfans', 'fapello', 'pornpics', 'daftsex', 'sxyprn', 'pornone', 'upornia', 'hclips', 'vporn',
    'drtuber', 'sunporno', 'empflix', 'gotporn', 'jacquieetmichel', 'jacquieetmicheltv', 'dorcelvision', 'nhentai',
    'porntrex', 'pornhd', 'hdporn', 'porndig', 'porntube', 'pornmd', 'tubegalore', 'pornhat', 'keezmovies',
    'extremetube', 'xhamsterlive', 'hentaihaven', 'adultfriendfinder', 'literotica', 'manyvids', 'youporngay']);
  const ADULT_WORDS = new Set(['porn', 'porno', 'pornos', 'pron', 'sex', 'sexe', 'xxx', 'nsfw', 'milf', 'milfs', 'hentai',
    'nude', 'nudes', 'pussy', 'fuck', 'blowjob', 'cumshot', 'camgirl', 'camgirls', 'sexcam', 'sexcams', 'sexchat',
    'livesex']);
  // Neutral words adult sites glue around the adult word (freesexmovies = free+sex+movies).
  const ADULT_GLUE = new Set(['free', 'best', 'top', 'hot', 'hd', 'my', 'the', 'tube', 'tubes', 'movie', 'movies', 'video',
    'videos', 'vids', 'clips', 'pics', 'pictures', 'photos', 'gifs', 'cam', 'cams', 'live', 'chat', 'girls', 'teen',
    'teens', 'mature', 'amateur', 'gay', 'lesbian', 'hub', 'site', 'sites', 'world', 'land', 'zone', 'club', 'tv',
    'online', 'stream', 'streaming', 'french', 'francais', 'gratuit', 'film', 'films', 'star', 'stars', 'daily',
    'new', 'real', 'only', 'sexy']);
  // Any of these next to an adult word means "about", not "is" (sex-education, stopporn...).
  const ADULT_SAFE = new Set(['education', 'educator', 'ed', 'health', 'sante', 'pistols', 'detector', 'detection',
    'filter', 'blocker', 'block', 'stop', 'quit', 'no', 'anti', 'addiction', 'addict', 'recovery', 'therapy',
    'therapist', 'offender', 'offenders', 'crime', 'crimes', 'abuse', 'trafficking', 'research', 'study', 'studies',
    'law', 'and', 'city', 'positive', 'matters', 'linked', 'ratio', 'equality', 'discrimination', 'gender',
    'safe', 'safer', 'info', 'advice', 'clinic', 'ology']);
  const ADULT_TLDS = new Set(['xxx', 'adult', 'porn', 'sex']);
  const INSTITUTION_LABELS = new Set(['gov', 'gouv', 'edu', 'ac', 'mil', 'gob', 'go', 'gc', 'nhs', 'police', 'sch']);
  const INSTITUTION_TLDS = new Set(['gov', 'edu', 'mil', 'int']);

  function punyDecode(input) {
    const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
    let n = 128, i = 0, bias = 72;
    const out = [];
    let b = input.lastIndexOf('-');
    if (b < 0) b = 0;
    for (let j = 0; j < b; j++) out.push(input.charCodeAt(j));
    const adapt = (delta, num, first) => {
      delta = first ? Math.floor(delta / damp) : delta >> 1;
      delta += Math.floor(delta / num);
      let k = 0;
      while (delta > (((base - tMin) * tMax) >> 1)) { delta = Math.floor(delta / (base - tMin)); k += base; }
      return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
    };
    for (let idx = b > 0 ? b + 1 : 0; idx < input.length;) {
      const oldi = i;
      let w = 1;
      for (let k = base; ; k += base) {
        if (idx >= input.length) return null;
        const c = input.charCodeAt(idx++);
        let digit;
        if (c >= 48 && c <= 57) digit = c - 22;
        else if (c >= 65 && c <= 90) digit = c - 65;
        else if (c >= 97 && c <= 122) digit = c - 97;
        else return null;
        i += digit * w;
        const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
        if (digit < t) break;
        w *= base - t;
      }
      const len = out.length + 1;
      bias = adapt(i - oldi, len, oldi === 0);
      n += Math.floor(i / len);
      i %= len;
      out.splice(i++, 0, n);
    }
    try { return String.fromCodePoint(...out); } catch (e) { return null; }
  }

  // Letters of other alphabets that look like a Latin letter.
  const CONFUSABLE = {
    'а': 'a', 'в': 'b', 'с': 'c', 'ԁ': 'd', 'е': 'e', 'һ': 'h', 'і': 'i', 'ј': 'j', 'к': 'k', 'ӏ': 'l', 'м': 'm',
    'н': 'h', 'о': 'o', 'р': 'p', 'ԛ': 'q', 'ѕ': 's', 'т': 't', 'у': 'y', 'ѵ': 'v', 'ԝ': 'w', 'х': 'x', 'ё': 'e',
    'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x',
    'ı': 'i', 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ɡ': 'g', 'ɑ': 'a', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe'
  };
  // ASCII "skeleton" of a decoded label, or null when it cannot be mapped.
  function skeleton(s) {
    let out = '';
    for (const ch of s.normalize('NFD').replace(/[̀-ͯ]/g, '')) {
      if (/[a-z0-9-]/.test(ch)) out += ch;
      else if (CONFUSABLE[ch]) out += CONFUSABLE[ch];
      else return null;
    }
    return out;
  }

  function cleanHost(host) {
    return String(host || '').toLowerCase().replace(/\.+$/, '');
  }

  // { suffix, main, reg, subs[], hosted } for a domain name.
  function split(host) {
    const parts = host.split('.');
    const n = parts.length;
    if (n >= 3) {
      for (const h of HOSTING_DEEP) {
        if (host.endsWith('.' + h)) {
          const k = h.split('.').length;
          return { suffix: h, main: parts[0], reg: host, subs: [], custom: parts.slice(0, n - k), hosted: true };
        }
      }
      for (const h of HOSTING) {
        if (host.endsWith('.' + h)) {
          const k = h.split('.').length;
          return { suffix: h, main: parts[n - k - 1], reg: parts.slice(n - k - 1).join('.'), subs: parts.slice(0, n - k - 1), custom: parts.slice(0, n - k), hosted: true };
        }
      }
    }
    let k = 1;
    if (n >= 3) {
      const last2 = parts[n - 2] + '.' + parts[n - 1];
      if (TWO_LEVEL.has(last2) || (SECOND_LEVEL.has(parts[n - 2]) && /^[a-z]{2}$/.test(parts[n - 1]))) k = 2;
      // gouv.qc.ca, gov.bc.ca, nsw.gov.au is already covered by gov.au
      if (n >= 4 && TWO_LEVEL.has(last2) && INSTITUTION_LABELS.has(parts[n - 3])) k = 3;
    }
    if (n <= k) return { suffix: parts.slice(1).join('.'), main: parts[0], reg: host, subs: [], hosted: false };
    return { suffix: parts.slice(n - k).join('.'), main: parts[n - k - 1], reg: parts.slice(n - k - 1).join('.'), subs: parts.slice(0, n - k - 1), hosted: false };
  }

  function registrable(host) {
    host = cleanHost(host);
    if (!host || ipv4(host) || host.includes(':')) return host;
    return split(host).reg;
  }

  function isInstitution(info) {
    const s = info.suffix.split('.');
    if (INSTITUTION_TLDS.has(s[s.length - 1])) return true;
    return s.length >= 2 && s.slice(0, -1).some(l => INSTITUTION_LABELS.has(l));
  }

  function ipv4(host) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!m) return null;
    const o = m.slice(1).map(Number);
    return o.every(x => x <= 255) ? o : null;
  }
  function privateV4(o) {
    const [a, b] = o;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  // Only real address literals and local names count: "10.evil.xyz" is NOT private.
  function isPrivateHost(host) {
    host = cleanHost(host);
    if (!host) return false;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') ||
      host.endsWith('.lan') || host.endsWith('.home.arpa')) return true;
    const v4 = ipv4(host);
    if (v4) return privateV4(v4);
    const v6 = /^\[([0-9a-f:.]+)\]$/.exec(host) || (host.includes(':') ? /^([0-9a-f:.]+)$/.exec(host) : null);
    if (v6) {
      const a = v6[1];
      if (a === '::' || a === '::1') return true;
      const first = parseInt(a.split(':')[0] || '0', 16);
      if ((first & 0xffc0) === 0xfe80 || (first & 0xfe00) === 0xfc00) return true;
      // IPv4-mapped / NAT64: ::ffff:a.b.c.d, ::ffff:hhhh:hhhh, 64:ff9b::hhhh:hhhh
      let m = /^(?:::ffff:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
      if (m) { const o = ipv4(m[1]); return !o || privateV4(o); }
      m = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);
      if (m) {
        const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16);
        return privateV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
      }
      return false;
    }
    // Single-label names (http://intranet/) only exist on a local network.
    return !host.includes('.');
  }

  function isOfficialInfo(brand, info) {
    if (brand.d.includes(info.reg)) return true;
    const tld = info.suffix.split('.').pop();
    if (BRAND_TLDS.has(tld) && !info.hosted) return true;
    if (info.hosted) return false;
    return brand.labels.has(info.main) && !FREE_TLDS.has(tld);
  }
  function isOfficial(brand, reg) { return isOfficialInfo(brand, split(cleanHost(reg))); }
  function isOfficialHost(brand, host) { return isOfficialInfo(brand, split(cleanHost(host))); }
  function isAnyOfficial(host) {
    const info = split(cleanHost(host));
    return BRANDS.some(b => isOfficialInfo(b, info));
  }

  const collapse = (s) => s.replace(/(.)\1+/g, '$1');
  function editDistance1(a, b) {
    if (a === b) return false;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0;
    while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) {
      // one substitution, or one swap of neighbours
      if (a.slice(i + 1) === b.slice(i + 1)) return true;
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    }
    return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }

  // Brand a token imitates without being it (paypa1, rnicrosoft, paypall, faceb00k), or null.
  function lookalike(token) {
    if (token.length < 4 || LOOKALIKE_SAFE.has(token)) return null;
    const hasDigit = /[013457]/.test(token);
    const vars = new Set();
    const digit = (s, one) => s.replace(/0/g, 'o').replace(/1/g, one).replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
    for (const d of hasDigit ? [digit(token, 'l'), digit(token, 'i')] : [token]) {
      vars.add(d);
      vars.add(d.replace(/rn/g, 'm'));
      vars.add(d.replace(/vv/g, 'w'));
      vars.add(d.replace(/rn/g, 'm').replace(/vv/g, 'w'));
    }
    for (const b of BRANDS) {
      for (const name of b.names) {
        if (token === name) return null;
        if (name.length < 5) continue;
        const cn = collapse(name);
        for (const v of vars) {
          if (collapse(v) !== cn) continue;
          const swapped = v !== token;
          if (swapped || !b.common || token.length > name.length) return b;
        }
        if (!b.common && name.length >= 6 && token.length >= 6 && token[0] === name[0] && !/\d/.test(token) &&
          editDistance1(token, name)) return b;
      }
    }
    return null;
  }

  // Brand names found in one label as whole hyphen-separated tokens ("la-poste-colis"
  // → laposte + [colis]), or glued to a phishing word ("paypalsecure").
  function brandHits(label) {
    const tokens = label.split(/[-_]+/).filter(Boolean);
    const hits = [];
    for (const b of BRANDS) {
      let found = false;
      for (const name of b.names) {
        for (let i = 0; i < tokens.length && !found; i++) {
          let joined = '';
          for (let j = i; j < tokens.length && joined.length < name.length; j++) {
            joined += tokens[j];
            if (joined === name) {
              hits.push({ brand: b, rest: tokens.slice(0, i).concat(tokens.slice(j + 1)), glued: false });
              found = true;
              break;
            }
          }
        }
        if (found) break;
        if (name.length < 5) continue;
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i];
          if (t.length <= name.length) continue;
          const other = t.startsWith(name) ? t.slice(name.length) : t.endsWith(name) ? t.slice(0, -name.length) : null;
          if (other && PHISH_WORDS.has(other)) {
            hits.push({ brand: b, rest: tokens.slice(0, i).concat(tokens.slice(i + 1)), glued: true });
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    return hits;
  }
  const hasWord = (tokens) => tokens.some(t => PHISH_WORDS.has(t) || BRAND_WORDS.has(t));
  const imitates = (b) => 'This address uses the name "' + b.t + '" but is not an official ' + b.t + ' site.';
  const looksLike = (b) => 'The name is a look-alike of "' + b.t + '" (swapped or extra characters).';

  function pathLooksPhishy(path) {
    const tokens = path.split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.some(t => PHISH_WORDS.has(t)) || tokens.some(t => BRANDS.some(b => b.names.includes(t)));
  }

  function checkDanger(u, host, path) {
    if (u.username || u.password) {
      let user = (u.username || '') + ' ' + (u.password || '');
      try { user = decodeURIComponent(user); } catch (e) { }
      user = user.toLowerCase();
      if (user.includes('.') || BRANDS.some(b => b.names.some(n => user.includes(n)))) {
        return 'The address hides the real site behind a fake name before the "@" sign.';
      }
    }
    if (ipv4(host) || /^\[.*\]$/.test(host)) {
      return pathLooksPhishy(path) ? 'A login-style page on a raw IP address instead of a normal site name.' : null;
    }

    // Punycode labels: replace by their ASCII look-alike form when there is one.
    let idn = false;
    let labels = host.split('.');
    for (let i = 0; i < labels.length; i++) {
      if (!labels[i].startsWith('xn--')) continue;
      const dec = punyDecode(labels[i].slice(4));
      if (!dec) continue;
      if (/\p{Script=Latin}/u.test(dec) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(dec)) {
        return 'The name mixes alphabets (e.g. Latin and Cyrillic) to imitate another site.';
      }
      const sk = skeleton(dec.toLowerCase());
      if (sk && /^[a-z0-9-]+$/.test(sk)) { labels[i] = sk; idn = true; }
    }
    const shost = labels.join('.');
    const info = split(shost);
    if (isInstitution(info)) return null;
    const tld = labels[labels.length - 1];

    if (idn) {
      for (const l of labels.slice(0, -1)) {
        for (const b of BRANDS) {
          if (b.labels.has(l) && (b.names.includes(l) || l.includes('-'))) return 'The name uses look-alike letters to imitate "' + b.t + '".';
        }
      }
    }

    if (info.hosted) {
      // Shared hosting: only a brand name together with phishing wording counts.
      for (const label of info.custom) {
        for (const h of brandHits(label)) {
          if (h.glued || h.rest.some(t => PHISH_WORDS.has(t))) return imitates(h.brand);
        }
      }
      return null;
    }

    if (!idn && (BRAND_TLDS.has(tld) || BRANDS.some(b => isOfficialInfo(b, info)))) return null;

    // 1) The registrable name itself.
    for (const h of brandHits(info.main)) {
      if (!idn && isOfficialInfo(h.brand, info)) continue;
      if (h.glued || hasWord(h.rest) || (!h.brand.common && SUSPICIOUS_TLDS.has(tld))) return imitates(h.brand);
    }
    for (const t of [info.main].concat(info.main.split(/[-_]+/))) {
      const b = lookalike(t);
      if (b) return looksLike(b);
    }

    // 2) Labels in front of it: "paypal.evil.com", "apple.com.signin-verify.net".
    const subs = info.subs.filter((l, i) => !(i === 0 && l === 'www'));
    if (subs.length) {
      const front = subs.join('.') + '.';
      for (const b of BRANDS) {
        for (const d of b.d) {
          if (front.startsWith(d + '.') || front.includes('.' + d + '.')) return imitates(b);
        }
      }
      for (let i = 0; i < subs.length; i++) {
        const l = subs[i];
        const next = i + 1 < subs.length ? subs[i + 1] : null;
        for (const b of BRANDS) {
          if (!b.labels.has(l) || !(b.names.includes(l) || l.includes('-'))) continue;
          if (!b.common) return imitates(b);
          // common words need the "brand.com." shape: amazon.fr.evil.net, apple.com-verify.info
          if (next ? TLDISH.has(next) : TLDISH.has(info.main.split('-')[0]) && info.main.includes('-')) return imitates(b);
        }
        for (const h of brandHits(l)) {
          if (h.glued || hasWord(h.rest)) return imitates(h.brand);
        }
        const lb = lookalike(l);
        if (lb && !lb.common) return looksLike(lb);
      }
    }

    // 3) No brand, but the name is built out of phishing words.
    const count = (ls) => ls.reduce((n, l) => n + l.split(/[-_]+/).filter(t => PHISH_WORDS.has(t)).length, 0);
    const inMain = count([info.main]);
    if (inMain >= 3 || (SUSPICIOUS_TLDS.has(tld) && inMain + count(subs) >= 2)) {
      return 'The name is made of words typical of phishing (login, secure, verify…).';
    }
    return null;
  }

  // Can the string be cut into known words, with at least one adult word and no "safe" word?
  function adultSegment(s) {
    const n = s.length;
    if (n < 5 || n > 30) return false;
    // best[i] = { adult, safe } for a full segmentation of s[0..i), preferring adult && !safe
    const best = new Array(n + 1).fill(null);
    best[0] = { adult: false, safe: false };
    for (let i = 0; i < n; i++) {
      if (!best[i]) continue;
      for (let j = i + 2; j <= Math.min(n, i + 10); j++) {
        const w = s.slice(i, j);
        const a = ADULT_WORDS.has(w), sf = ADULT_SAFE.has(w);
        if (!a && !sf && !ADULT_GLUE.has(w)) continue;
        const cand = { adult: best[i].adult || a, safe: best[i].safe || sf };
        // keep the "safest" reading: a safe word anywhere wins
        if (!best[j] || (cand.safe && !best[j].safe)) best[j] = cand;
      }
    }
    return !!best[n] && best[n].adult && !best[n].safe;
  }

  function checkAdult(host) {
    if (ipv4(host) || host.includes(':')) return null;
    const info = split(host);
    if (isInstitution(info)) return null;
    if (ADULT_DOMAINS.has(info.reg) || ADULT_DOMAINS.has(host.replace(/^www\./, ''))) return 'Known adult-content website.';
    const tld = host.split('.').pop();
    if (ADULT_TLDS.has(tld)) return 'The domain extension is reserved for adult content.';
    if (info.hosted) return null;
    // Only the registrable name counts, never sub-domains (xxx.lanl.gov, sex.stackexchange.com).
    const leet = (s) => s.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e');
    const main = info.main;
    if (ADULT_NAMES.has(main) || ADULT_NAMES.has(leet(main))) return 'Known adult-content website.';
    const tokens = leet(main).split(/[-_]+/).filter(Boolean);
    if (tokens.some(t => ADULT_SAFE.has(t))) return null;
    if (tokens.some(t => ADULT_WORDS.has(t) || ADULT_NAMES.has(t))) return 'The site name points to adult content.';
    if (tokens.some(t => adultSegment(t.replace(/\d+$/, '')))) return 'The site name points to adult content.';
    return null;
  }

  const strip = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Brands named in a piece of page text (title, headings...).
  function brandsIn(text) {
    const plain = strip(String(text || ''));
    const packed = plain.replace(/[^a-z0-9]/g, '');
    return BRANDS.filter(b => b.names.some(n => n.length >= 7 && !b.common
      ? packed.includes(n)
      : new RegExp('(^|[^a-z0-9])' + n + '([^a-z0-9]|$)').test(plain)));
  }

  // Returns null (fine) or { type: 'danger' | 'adult', reason, host }.
  function evaluate(rawUrl) {
    let u;
    try { u = new URL(rawUrl); } catch (e) { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = cleanHost(u.hostname);
    if (!host || isPrivateHost(host)) return null;
    let path = u.pathname + u.search;
    try { path = decodeURIComponent(path); } catch (e) { }
    try {
      const danger = checkDanger(u, host, path.toLowerCase());
      if (danger) return { type: 'danger', reason: danger, host };
      const adult = checkAdult(host);
      if (adult) return { type: 'adult', reason: adult, host };
    } catch (e) { }
    return null;
  }

  // Not a danger, just a classic prank: the one video everybody uses to rickroll.
  const RICKROLL_ID = 'dQw4w9WgXcQ';
  function isRickroll(text) {
    const t = String(text || '').trim();
    let u;
    try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : 'https://' + t); } catch (e) { return false; }
    const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return u.pathname.split('/')[1] === RICKROLL_ID;
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return false;
    if (u.searchParams.get('v') === RICKROLL_ID) return true;
    const m = u.pathname.match(/^\/(embed|shorts|v|live)\/([^/?#]+)/);
    return !!m && m[2] === RICKROLL_ID;
  }
  const RICKROLL_MSG = '🎵 Rickroll detected. This link plays "Never Gonna Give You Up".';

  root.WBProtection = { evaluate, isPrivateHost, brandsIn, isOfficialHost, isAnyOfficial, registrable, isRickroll, RICKROLL_MSG };
})(typeof self !== 'undefined' ? self : window);
