(function () {
  const p = new URLSearchParams(location.search);
  const type = p.get('type') === 'adult' ? 'adult' : 'danger';
  const target = p.get('url') || '';

  let parsed = null;
  try {
    const u = new URL(target);
    if (u.protocol === 'http:' || u.protocol === 'https:') parsed = u;
  } catch (e) { }

  const $ = (id) => document.getElementById(id);
  $('wrap').dataset.type = type;
  $('host').textContent = parsed ? parsed.hostname : '(unknown)';
  $('reason').textContent = p.get('reason') || '';
  $('fullUrl').textContent = parsed ? parsed.href : '';

  if (type === 'danger') {
    document.title = 'Dangerous site blocked';
    $('title').textContent = 'Dangerous site blocked';
    $('lead').textContent = 'This address looks like a scam or phishing page, so WorkBox stopped the visit.';
    $('moreSummary').textContent = 'I think this is a mistake';
    $('moreText').textContent = 'Only continue if you are certain this is the right site. Never enter passwords or card details on it.';
    $('continueBtn').textContent = 'Continue anyway (risky)';
  } else {
    document.title = 'Adult content warning';
    $('title').textContent = 'Adult content ahead';
    $('lead').textContent = 'This site contains adult content. Do you really want to open it?';
    $('moreSummary').textContent = 'I am an adult and want to continue';
    $('moreText').textContent = 'The site will open and will not be flagged again until you restart the browser.';
    $('continueBtn').textContent = 'Continue to the site';
  }

  // Silent background check: does this site actually exist and answer?
  function describeProbe(r) {
    if (!r) return null;
    switch (r.state) {
      case 'online': {
        if (r.redirect) return 'Online (answers with a redirect to another address)';
        let t = 'Online (HTTP ' + r.status + ')';
        if (r.redirected && r.finalHost) t += ', redirects to ' + r.finalHost;
        if (r.title) t += ' — "' + r.title.slice(0, 80) + '"';
        return t;
      }
      case 'unreachable': return 'Does not respond: the address may not exist or the site has been taken down.';
      case 'timeout': return 'No answer after 7 seconds.';
      default: return null;
    }
  }
  if (parsed) {
    chrome.runtime.sendMessage({ type: 'PROTECTION_PROBE', url: parsed.href }).then((r) => {
      // Live check switched off (or not applicable): no row at all.
      const text = describeProbe(r);
      if (!text) { $('probeRow').hidden = true; return; }
      $('probe').textContent = text;
      $('probeRow').hidden = false;
    }).catch(() => { $('probeRow').hidden = true; });
    $('probeRow').hidden = false;
  }

  // The background knows the last safe page of this tab (history.go is unreliable
  // behind redirectors). The warning replaces itself, so it leaves the history.
  // With no safe page, the background opens the new-tab page instead.
  let leaving = false;
  function goSafe() {
    if (leaving) return;
    leaving = true;
    chrome.runtime.sendMessage({ type: 'PROTECTION_GO_SAFE', reply: true }).then((r) => {
      let safe = null;
      try {
        const u = new URL(r && r.url);
        if (u.protocol === 'http:' || u.protocol === 'https:') safe = u.href;
      } catch (e) { }
      if (safe) location.replace(safe);
    }).catch(() => { leaving = false; window.close(); });
  }

  // Dangerous sites: bring the person back automatically unless they cancel.
  let timer = null;
  if (type === 'danger') {
    let left = 5;
    const count = $('count');
    count.hidden = false;
    $('cancelBtn').hidden = false;
    const tick = () => {
      count.textContent = 'Taking you back in ' + left + 's…';
      if (left-- <= 0) { clearInterval(timer); goSafe(); }
    };
    tick();
    timer = setInterval(tick, 1000);
    $('cancelBtn').addEventListener('click', () => {
      clearInterval(timer);
      count.hidden = true;
      $('cancelBtn').hidden = true;
    });
  }

  $('backBtn').addEventListener('click', () => { clearInterval(timer); goSafe(); });

  $('more').addEventListener('toggle', () => { if ($('more').open) { clearInterval(timer); $('count').hidden = true; $('cancelBtn').hidden = true; } });

  $('continueBtn').addEventListener('click', async () => {
    if (!parsed) return;
    clearInterval(timer);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'PROTECTION_ALLOW', url: parsed.href });
      if (res && res.ok) location.replace(parsed.href);
    } catch (e) { }
  });

  // Trusted for good (the Protection tool lists it, and can remove it).
  $('trustBtn').addEventListener('click', async (e) => {
    if (!parsed || !e.isTrusted) return;
    clearInterval(timer);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'PROTECTION_TRUST', url: parsed.href });
      if (res && res.ok) location.replace(parsed.href);
    } catch (err) { }
  });
})();
