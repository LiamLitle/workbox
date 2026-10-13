// Web protection — background side. Intercepts top-level navigations and sends
// the tab to warning.html when the URL looks dangerous or is an adult site.
const PROT_KEY = 'protectionSettings';
const PROT_DEFAULTS = { enabled: true, danger: true, adult: true, probe: true, content: true };
const WARNING_PAGE = chrome.runtime.getURL('pages/warning.html');
const PROT_HOP_MS = 2500;      // a page left this quickly by a redirect is a hop, not a place to return to
const PROT_SAME_VISIT_MS = 5000;
const PROT_NAV_MAX = 20;

async function protSettings() {
  const d = await chrome.storage.local.get(PROT_KEY);
  return { ...PROT_DEFAULTS, ...(d[PROT_KEY] || {}) };
}

async function protAllowList() {
  try {
    const d = await chrome.storage.session.get('protectionAllow');
    return d.protectionAllow || [];
  } catch (e) { return []; }
}

// ---- Trusted sites: a list kept for good (unlike "continue anyway", which
// lasts until the browser restarts). A trusted name also covers its sub-sites:
// trusting example.com trusts shop.example.com too.
const PROT_TRUST_KEY = 'protectionTrusted';
const PROT_TRUST_MAX = 5000;
let protTrustSet = null;
const protTrustName = (host) => String(host || '').toLowerCase().replace(/\.+$/, '').replace(/^www\./, '');
async function protTrusted() {
  if (!protTrustSet) {
    const d = await chrome.storage.local.get(PROT_TRUST_KEY);
    protTrustSet = new Set(Array.isArray(d[PROT_TRUST_KEY]) ? d[PROT_TRUST_KEY] : []);
  }
  return protTrustSet;
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[PROT_TRUST_KEY]) protTrustSet = null; });
function protTrustMatch(set, host) {
  let h = protTrustName(host);
  if (!h) return false;
  for (;;) {
    if (set.has(h)) return true;
    const dot = h.indexOf('.');
    if (dot < 0) return false;
    h = h.slice(dot + 1);
    if (!h.includes('.')) return false;   // never down to a bare ending such as "com"
  }
}
// adds host names; returns how many were new
async function protTrustAdd(hosts) {
  const set = new Set(await protTrusted());
  let added = 0;
  for (const raw of hosts) {
    const h = protTrustName(raw);
    if (!h || h.length > 253 || !/^[a-z0-9.-]+$|^\[[0-9a-f:]+\]$/i.test(h) || set.has(h)) continue;
    if (set.size >= PROT_TRUST_MAX) break;
    set.add(h); added++;
  }
  if (added) { await chrome.storage.local.set({ [PROT_TRUST_KEY]: [...set].sort() }); protTrustSet = set; }
  return added;
}

// Bookmarks -> trusted sites. The "bookmarks" permission is asked for only at
// that moment and given back as soon as the list has been read.
async function protImportBookmarks() {
  const hosts = [];
  const walk = (nodes) => {
    for (const nd of nodes || []) {
      if (nd.url) { try { const u = new URL(nd.url); if (u.protocol === 'http:' || u.protocol === 'https:') hosts.push(u.hostname); } catch (e) { } }
      if (nd.children) walk(nd.children);
    }
  };
  walk(await chrome.bookmarks.getTree());
  const found = new Set(hosts.map(protTrustName)).size;
  const added = await protTrustAdd(hosts);
  try { await chrome.permissions.remove({ permissions: ['bookmarks'] }); } catch (e) { }
  await chrome.storage.local.set({ protectionBookmarksResult: { ts: Date.now(), found, added } });
  return { found, added };
}
// The permission prompt can close the popup before it gets the answer, so the
// import is finished here whenever the permission arrives after being asked for.
// One request = one import, whether it is started by the popup's message, by
// the permission arriving, or by both at the same moment.
let protBmBusy = false;
async function protBookmarksOnce() {
  if (protBmBusy) return null;
  protBmBusy = true;
  try {
    const d = await chrome.storage.local.get('protectionBookmarksPending');
    if (!d.protectionBookmarksPending || Date.now() - d.protectionBookmarksPending > 120000) return null;
    await chrome.storage.local.remove('protectionBookmarksPending');
    return await protImportBookmarks();
  } finally { protBmBusy = false; }
}
chrome.permissions.onAdded.addListener((p) => {
  if (p.permissions && p.permissions.includes('bookmarks')) protBookmarksOnce().catch(() => { });
});

async function protIsAllowed(host) {
  if ((await protAllowList()).includes(host)) return true;
  return protTrustMatch(await protTrusted(), host);
}

async function protAllow(host) {
  const d = await chrome.storage.session.get('protectionAllow');
  const list = d.protectionAllow || [];
  if (!list.includes(host)) list.push(host);
  await chrome.storage.session.set({ protectionAllow: list });
}

// Stats writes are chained so two quick warnings cannot overwrite each other.
let protBumpChain = Promise.resolve();
function protBump(type) {
  protBumpChain = protBumpChain.then(async () => {
    const d = await chrome.storage.local.get('protectionStats');
    const stats = { danger: 0, adult: 0, ...(d.protectionStats || {}) };
    stats[type] = (stats[type] || 0) + 1;
    await chrome.storage.local.set({ protectionStats: stats });
  }).catch(() => { });
  return protBumpChain;
}

// ---- Per-tab navigation memory (where "Go back" should lead) ----
// tabs[tabId] = { nav: [{ url, ts, redir: '' | 'client' | 'server' }], safe: url|null, last: { host, ts } }
// Mirrored in storage.session because the service worker can be stopped at any time.
let protNav = null;
const protNavReady = (async () => {
  try {
    const d = await chrome.storage.session.get('protectionNav');
    protNav = d.protectionNav || {};
  } catch (e) { protNav = {}; }
})();
function protNavSave() {
  chrome.storage.session.set({ protectionNav: protNav }).catch(() => { });
}
function protTab(tabId) {
  return protNav[tabId] || (protNav[tabId] = { nav: [], safe: null, last: null });
}

function protHostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/\.+$/, ''); } catch (e) { return ''; }
}

async function protRecordCommit(d) {
  await protNavReady;
  const q = d.transitionQualifiers || [];
  const t = protTab(d.tabId);
  t.nav.push({
    url: d.url, ts: d.timeStamp || Date.now(),
    redir: q.includes('client_redirect') ? 'client' : q.includes('server_redirect') ? 'server' : ''
  });
  if (t.nav.length > PROT_NAV_MAX) t.nav.splice(0, t.nav.length - PROT_NAV_MAX);
  protNavSave();
}

// Last committed page that is neither flagged nor a redirect hop towards the flagged URL.
// committed: the flagged page itself has committed (it is in the list); otherwise the
// flagged navigation was stopped before commit and started at time `when`.
async function protFindSafe(tabId, verdict, when, committed) {
  await protNavReady;
  const t = protTab(tabId);
  const allowed = await protAllowList();
  const trusted = await protTrusted();
  // What came after the entry being looked at.
  let next = committed ? null : { ts: when, redir: 'client' };
  let safe = null, keep = 0, fallback = null;
  for (let i = t.nav.length - 1; i >= 0; i--) {
    const e = t.nav[i];
    const host = protHostOf(e.url);
    const v = WBProtection.evaluate(e.url);
    const flagged = host === verdict.host || (!!v && !allowed.includes(v.host) && !protTrustMatch(trusted, v.host));
    const hop = !!next && next.redir === 'client' && next.ts - e.ts < PROT_HOP_MS;
    if (!flagged && !hop) { safe = e.url; keep = i + 1; break; }
    if (!flagged && !fallback) fallback = { url: e.url, keep: i + 1 };
    next = e;
  }
  // Nothing older than a "hop": the user most likely clicked the link quickly on a
  // page they had just opened. Go back there once; if that page sends the tab to
  // the flagged site again right away, it really was a redirector, so give up on it.
  if (!safe && fallback) {
    const again = t.fb && t.fb.url === fallback.url && Date.now() - t.fb.ts < 20000;
    if (!again) { safe = fallback.url; keep = fallback.keep; t.fb = { url: fallback.url, ts: Date.now() }; }
  }
  // Forget the hops and the flagged entries: a repeat warning must resolve to the same page.
  t.nav.length = keep;
  t.safe = safe;
  protNavSave();
  return safe;
}

// when/committed: see protFindSafe. `steps` is kept in the warning URL for older
// warning pages; the current one asks the background where to go instead.
async function protCheckTab(tabId, url, verdictOverride, pageAlreadyLoaded, when) {
  if (!/^https?:/i.test(url)) return;
  const s = await protSettings();
  if (!s.enabled) return;
  const verdict = verdictOverride || WBProtection.evaluate(url);
  if (!verdict) return;
  if (verdict.type === 'danger' && !s.danger) return;
  if (verdict.type === 'adult' && !s.adult) return;
  if (await protIsAllowed(verdict.host)) return;
  await protNavReady;
  const t = protTab(tabId);
  const now = Date.now();
  // One visit = one count, even when several events report it (before-navigate,
  // server redirect, page analysis) or a redirector fires more than once.
  const sameVisit = !!t.last && t.last.host === verdict.host && now - t.last.ts < PROT_SAME_VISIT_MS;
  t.last = { host: verdict.host, ts: now };
  if (!sameVisit) {
    protBump(verdict.type);
    await protFindSafe(tabId, verdict, when || now, !!pageAlreadyLoaded);
  } else {
    protNavSave();
  }
  const q = new URLSearchParams({ type: verdict.type, url, reason: verdict.reason, steps: pageAlreadyLoaded ? '2' : '1' });
  chrome.tabs.update(tabId, { url: WARNING_PAGE + '?' + q.toString() }).catch(() => { });
}

chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  if (d.frameId === 0) protCheckTab(d.tabId, d.url, null, false, d.timeStamp);
});

chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId !== 0 || !/^https?:/i.test(d.url)) return;
  const done = protRecordCommit(d);
  // A server-side redirect lands on a URL onBeforeNavigate never saw.
  if ((d.transitionQualifiers || []).includes('server_redirect')) {
    done.then(() => protCheckTab(d.tabId, d.url, null, true, d.timeStamp));
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await protNavReady;
  if (protNav[tabId]) { delete protNav[tabId]; protNavSave(); }
});

// Silent existence check: the service worker fetches the site's home address only
// (scheme://host[:port]/ — never the flagged path or query), with no cookies and no
// referrer, and nothing is run. Redirects are not followed, so a hostile site cannot
// bounce the request to a device on the local network.
// This does contact the site from the user's connection, hence the setting.
async function protProbe(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch (e) { return { state: 'invalid' }; }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password ||
    WBProtection.isPrivateHost(u.hostname.toLowerCase())) {
    return { state: 'invalid' };
  }
  try {
    const res = await fetch(u.origin + '/', {
      method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store',
      referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(7000)
    });
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      // The site answers with a redirect; where to is deliberately not looked up.
      return { state: 'online', status: res.status || '3xx', finalHost: null, redirected: true, redirect: true, title: null, adultLabel: false };
    }
    let head = '';
    try {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let got = 0;
      while (got < 65536) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        head += dec.decode(value, { stream: true });
      }
      reader.cancel().catch(() => { });
    } catch (e) { }
    const title = (head.match(/<title[^>]*>([\s\S]{0,160}?)<\/title>/i) || [])[1];
    return {
      state: 'online', status: res.status, finalHost: u.hostname, redirected: false,
      title: title ? title.replace(/\s+/g, ' ').trim() : null,
      adultLabel: /rta-5042-1996-1400-1577-rta/i.test(head)
    };
  } catch (e) {
    if (e && e.name === 'TimeoutError') return { state: 'timeout' };
    return { state: 'unreachable' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('PROTECTION_')) return;
  if (sender.id !== chrome.runtime.id) return;
  const fromWarning = !!sender.url && sender.url.startsWith(WARNING_PAGE);
  const fromPopup = !!sender.url && sender.url.startsWith(chrome.runtime.getURL('popup/popup.html'));

  if (msg.type === 'PROTECTION_PROBE' && (fromWarning || fromPopup)) {
    (async () => {
      // manual = explicit "Check" press in the popup; the warning page obeys the setting.
      if (!msg.manual && !(await protSettings()).probe) return { state: 'disabled' };
      return protProbe(msg.url);
    })().then(sendResponse).catch(() => sendResponse({ state: 'unreachable' }));
    return true;
  }

  if (msg.type === 'PROTECTION_ALLOW' && fromWarning) {
    let host = null;
    try {
      const u = new URL(msg.url);
      if (u.protocol === 'http:' || u.protocol === 'https:') host = u.hostname.toLowerCase().replace(/\.+$/, '');
    } catch (e) { }
    if (!host) { sendResponse({ ok: false }); return; }
    protAllow(host).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  // "Trust this site" on the warning page: allowed for good, listed in the Protection tool.
  if (msg.type === 'PROTECTION_TRUST' && fromWarning) {
    let host = null;
    try {
      const u = new URL(msg.url);
      if (u.protocol === 'http:' || u.protocol === 'https:') host = u.hostname;
    } catch (e) { }
    if (!host) { sendResponse({ ok: false }); return; }
    protTrustAdd([host]).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  // the popup already holds the bookmarks permission: import straight away
  if (msg.type === 'PROTECTION_IMPORT_BOOKMARKS' && fromPopup) {
    protBookmarksOnce().then((r) => sendResponse(Object.assign({ ok: true }, r || {}))).catch(() => sendResponse({ ok: false }));
    return true;
  }

  // "Go back": return to the last safe page of this tab (see protFindSafe).
  // msg.reply: the warning page navigates itself (so the warning leaves the history)
  // and only needs the address; without it the background moves the tab.
  if (msg.type === 'PROTECTION_GO_SAFE' && fromWarning && sender.tab) {
    const tabId = sender.tab.id;
    (async () => {
      await protNavReady;
      const t = protNav[tabId];
      let safe = (t && t.safe) || null;
      // Sent back to the same page twice for the same flagged site within a short
      // time: that page is what keeps sending the tab there, so stop returning to it.
      if (safe && t.last) {
        const now = Date.now(), r = t.ret;
        if (r && r.url === safe && r.host === t.last.host && now - r.ts < 30000) { safe = null; t.ret = null; t.safe = null; }
        else t.ret = { url: safe, host: t.last.host, ts: now };
        protNavSave();
      }
      if (safe && msg.reply) return { url: safe };
      await chrome.tabs.update(tabId, { url: safe || 'chrome://newtab' }).catch(() => { });
      return { url: null };
    })().then(sendResponse).catch(() => sendResponse({ url: null }));
    return true;
  }

  // Content script: the page analyzer reached a verdict on the loaded page.
  if (msg.type === 'PROTECTION_CONTENT' && sender.tab && sender.frameId === 0 && /^https?:/i.test(sender.tab.url || '')) {
    const v = msg.verdict || {};
    if (v.type !== 'danger' && v.type !== 'adult') return;
    const host = protHostOf(sender.tab.url);
    if (!host) return;
    protCheckTab(sender.tab.id, sender.tab.url,
      { type: v.type, reason: String(v.reason || '').slice(0, 200), host }, true);
  }
});
