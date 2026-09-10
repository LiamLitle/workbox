// Capture ce qui est copié/coupé sur la page et l'envoie au background

function safeSend(text) {
  if (!text || !text.trim()) return;
  try {
    let inputType = '';
    try {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        inputType = (el.type || '').toLowerCase();
      }
    } catch (e) { }

    chrome.runtime.sendMessage({
      type: 'clipboard_capture',
      text: text.trim(),
      inputType
    }).catch(() => { });
  } catch (e) { }
}

// Fallback quand clipboardData ne donne rien directement (arrive sur certains sites) :
// on relit la sélection juste après l'événement
function getSelectedText() {
  let text = '';
  try { text = window.getSelection().toString(); } catch (e) { }
  if (text) return text;

  try {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start !== end && typeof el.value === 'string') {
        text = el.value.substring(start, end);
      }
    }
  } catch (e) { }
  return text;
}

function captureFromEvent(event) {
  const directText = event?.clipboardData?.getData('text/plain');
  if (directText && directText.trim()) {
    safeSend(directText);
    return;
  }

  setTimeout(() => {
    const fallbackText = getSelectedText();
    if (fallbackText) safeSend(fallbackText);
  }, 100);
}

function checkImageCapture(event) {
  try {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = (e) => {
          chrome.runtime.sendMessage({
            type: 'clipboard_image',
            dataUrl: e.target.result
          }).catch(() => { });
        };
        reader.readAsDataURL(blob);
      }
    }
  } catch (err) { }
}

// Capture phase (true) pour intercepter avant que le site ne bloque l'event
document.addEventListener('copy', (e) => {
  checkImageCapture(e);
  captureFromEvent(e);
}, true);

document.addEventListener('cut', (e) => {
  checkImageCapture(e);
  captureFromEvent(e);
}, true);

// ── AI answer blocker for search engines ───────────────────────────────
// Bing, Brave, DuckDuckGo and Qwant each expose a URL parameter that turns
// their inline AI answer off without touching anything else on the page
// (source: github.com/jruns/disable-ai). Google is the odd one out: its
// only URL-level switch (udm=14) doesn't just remove the AI Overview, it
// forces the whole page into the "Web" results tab, which also drops
// Images/Videos/Shopping — too big a side effect. So for Google we instead
// remove just the AI Overview block from the DOM, anchored on Google's own
// internal data-async-type="folsrch" marker rather than an obfuscated CSS
// class (those get renamed constantly; this marker is far more stable).
//
// One toggle per engine in chrome.storage.local: blockAiGoogle /
// blockAiBing / blockAiBrave / blockAiDuckDuckGo / blockAiQwant — only one
// is ever active at a time (the popup enforces this like a radio group,
// since a person only has one default search engine). Google is the
// default-on engine on first run; the others stay off until explicitly
// picked in the popup. Works the same in any Chromium browser (Chrome,
// Brave, Edge...) — it's keyed off the search engine's domain, not the
// browser.
//
// Ecosia, Yahoo and Yandex aren't covered yet: Ecosia's AI answer is
// blocked server-side (needs network request blocking, not a URL param),
// and no clean bypass parameter is documented for Yahoo/Yandex.
(() => {
  const host = location.hostname;
  const path = location.pathname;
  const hasQuery = new URL(location.href).searchParams.has('q');

  let engine = null;
  if (/(^|\.)google\.[a-z.]+$/i.test(host) && path === '/search') engine = 'Google';
  else if (/(^|\.)bing\.com$/i.test(host) && path === '/search') engine = 'Bing';
  else if (host === 'search.brave.com' && path === '/search') engine = 'Brave';
  // DuckDuckGo and Qwant put search results on the root path (?q=...)
  // rather than /search, so they also need a real query to count.
  else if (/(^|\.)duckduckgo\.com$/i.test(host) && path === '/' && hasQuery) engine = 'DuckDuckGo';
  else if (/(^|\.)qwant\.com$/i.test(host) && path === '/' && hasQuery) engine = 'Qwant';
  if (!engine) return;

  const storageKey = 'blockAi' + engine;
  const isDefaultEngine = engine === 'Google';

  function redirectParam(url) {
    // Only add a param when it's completely absent, so we never override an
    // explicit choice already baked into the URL, or fight with a redirect
    // we already did. Google isn't handled here — see hideGoogleAiBlocks().
    let changed = false;
    if (engine === 'Bing') {
      // copilot=off was the original toggle, but Bing shipped an official
      // "-ai" query suffix in June 2026 (same mechanism as their own
      // opt-out browser extension) that's the one actually honored now —
      // keep both since copilot=off is harmless and -ai is the real switch.
      if (!url.searchParams.has('copilot')) { url.searchParams.set('copilot', 'off'); changed = true; }
      const q = url.searchParams.get('q') || '';
      if (!/(^|\s)-ai($|\s)/i.test(q)) {
        url.searchParams.set('q', q.replace(/\s+$/, '') + ' -ai');
        changed = true;
      }
    }
    if (engine === 'Brave' && !url.searchParams.has('summary')) { url.searchParams.set('summary', '0'); changed = true; }
    if (engine === 'DuckDuckGo') {
      if (!url.searchParams.has('assist')) { url.searchParams.set('assist', 'false'); changed = true; }
      if (!url.searchParams.has('kbe')) { url.searchParams.set('kbe', '0'); changed = true; }
      if (!url.searchParams.has('kbg')) { url.searchParams.set('kbg', '-1'); changed = true; }
      if (!url.searchParams.has('kbj')) { url.searchParams.set('kbj', '1'); changed = true; }
    }
    if (engine === 'Qwant' && !url.searchParams.has('llm')) { url.searchParams.set('llm', '0'); changed = true; }
    return changed;
  }

  // Walks up from a marker element to the block directly inside the results
  // container (#rso) or the page banner container (#rcnt), so we hide the
  // whole card instead of just an inner wrapper.
  function findBlockUnderResults(marker) {
    let el = marker;
    while (el && el.parentElement) {
      const parentId = el.parentElement.id;
      if (parentId === 'rso' || parentId === 'rcnt') return el;
      el = el.parentElement;
    }
    return null;
  }

  function hideGoogleAiBlocks() {
    // The AI Overview card is built around an async-loaded module Google
    // tags internally with data-async-type="folsrch" — unlike its CSS
    // classes, this marker has stayed put across their redesigns.
    const overviewMarker = document.querySelector('[data-async-type="folsrch"], [id^="folsrch"]');
    if (overviewMarker) {
      const block = findBlockUnderResults(overviewMarker);
      if (block && block.style.display !== 'none') block.style.display = 'none';
    }

    // "Things to know" is a separate AI-generated panel that can show up
    // even when there's no AI Overview above it.
    const thingsToKnow = document.querySelector('[data-maindata]:not([data-bkt])');
    if (thingsToKnow) {
      const block = findBlockUnderResults(thingsToKnow) || thingsToKnow;
      if (block.style.display !== 'none') block.style.display = 'none';
    }

    // The "AI Mode" tab next to Images/Videos/News has no URL toggle either.
    const firstTab = document.querySelector('[role="list"]')?.children?.[0];
    if (firstTab && /^AI Mode$/i.test((firstTab.innerText || '').trim())) {
      firstTab.style.display = 'none';
    }
  }

  // Belt-and-suspenders for Bing: the -ai query suffix and copilot=off should
  // already stop the answer from being generated, but Bing's rollout is
  // inconsistent (A/B tests, region, logged-in state, redesigns), so a
  // generated answer box can still show up under a marker we don't already
  // know about. Beyond the known ids (#copans_container, the older
  // <li class="b_ans"> slot, #b_copilot_search_container, and the current
  // .b_chatResponse / .b_copilotSummary answer classes), we also do a generic
  // case-insensitive scan for anything whose id/class mentions "copilot" —
  // Bing renames the exact selector often enough that chasing each one
  // individually doesn't hold up, while this catches new variants without a
  // code change. Deliberately excludes the "Search" pivot tab (id starts
  // with b-scopeListItem-copilotsearch) — that's just a nav link to Bing's
  // separate Copilot chat mode, not an auto-injected answer, so removing it
  // would delete real navigation rather than an AI block.
  function hideBingCopilotBlock() {
    const known = document.querySelector('#copans_container, .copans_container, #b_copilot_search_container, .b_chatResponse, .b_copilotSummary');
    const generic = known ? null : Array.from(document.querySelectorAll('[id*="copilot" i], [class*="copilot" i]'))
      .find(el => !el.id.startsWith('b-scopeListItem-') && !el.closest('[id^="b-scopeListItem-"]'));
    const marker = known || generic;
    if (!marker) return;
    const target = marker.closest('li') || marker;
    if (target.style.display !== 'none') target.style.display = 'none';
  }

  chrome.storage.local.get(storageKey, (res) => {
    // Absent from storage (first run, before the popup has been opened):
    // only the default engine (Google) is active, not all five at once.
    const val = res[storageKey];
    const enabled = val === undefined ? isDefaultEngine : val === true;
    if (!enabled) return;

    if (engine === 'Google') {
      hideGoogleAiBlocks();
      new MutationObserver(hideGoogleAiBlocks).observe(document.documentElement, { childList: true, subtree: true });
      return;
    }

    const url = new URL(location.href);
    if (redirectParam(url)) {
      location.replace(url.toString());
      return;
    }

    if (engine === 'Bing') {
      hideBingCopilotBlock();
      new MutationObserver(hideBingCopilotBlock).observe(document.documentElement, { childList: true, subtree: true });
    }
  });
})();
