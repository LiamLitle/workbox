// Guided tours: dim the popup, ring one element at a time and say what it is for.
// There is a short main tour, and one mini-tour per tool (Settings > Tuto > Learn a tool).
// The ring glides from one element to the next; steps that say "click" wait for the person
// to press the highlighted element. Where a tool is empty, example rows are drawn on screen
// for the tour only: they are never written to storage and disappear when the tour ends.
(function () {
  'use strict';

  // ---------------------------------------------------------------- the tours
  // Step fields: target (CSS selector, or several separated by commas: the ring wraps them all),
  // title, text, click (the person presses the target), open (go to this tool first),
  // settings (open Settings on this tab first), clicks (selectors to press before showing the step),
  // demo (draw example rows), pad, next, closeGridAfter, last.
  const TOURS = {
    main: { title: 'Quick tour', steps: [
      { title: 'Quick tour', text: 'One minute to see where everything is. You can stop at any time.', next: 'Start' },
      { target: '#bottomNav [data-tab="clipboard"]', click: true, title: 'Your clipboard',
        text: 'Everything you copy lands here, saved on this device only. Click the glowing button.' },
      { target: '#clipSearch', pad: 4, title: 'Search',
        text: 'Find anything you copied, by a word of the text or the site it came from.' },
      { target: '#clipTabs', title: 'Texts, images, pinned',
        text: 'Switch between what you copied. Pin an item to keep it at the top.' },
      { target: '#gridMenuTrigger', click: true, title: 'All the other tools',
        text: 'Password, QR codes, timer and more are behind this button. Click it.' },
      { target: '#gridPanel', pad: 0, title: 'One tile per tool',
        text: 'Each tile is a tool: color picker, password, converter, timer, QR codes and more. Open any of them later from here.', closeGridAfter: true },
      { target: '#settingsOpenBtn', title: 'Settings',
        text: 'Backup, privacy, the password lock and the guides are in here. Settings > Tuto has a mini-tour for every tool.' },
      { title: 'That is it', last: true, guide: '',
        text: 'Alt + W opens WorkBox, Alt + C opens the clipboard history, Alt + S scans a QR code.', next: 'Finish' }
    ] },

    clipboard: { icon: '📋', title: 'Clipboard', guide: 'clipboard', open: 'clipboard', steps: [
      { target: '#clipList', demo: 'clipboard', title: 'Your history',
        text: 'Everything you copy is saved here, newest first. Click an item to copy it again.' },
      { target: '#clipSearch', pad: 4, title: 'Search', text: 'Type a word to find a text you copied, or the site it came from.' },
      { target: '#clipDateFilter', pad: 4, title: 'By date', text: 'Show only what you copied in the last hour, today, or another period.' },
      { target: '#clipTabs', title: 'Texts, images, pinned', text: 'Texts, images and pinned items each have their own tab, with a counter.' },
      { target: '#clipCategories', title: 'Sorted for you', text: 'Items are sorted automatically: links, emails, colors, code, prices and more. Tap a type to filter, or create your own tag.' },
      { target: '#clipList .clip-footer', demo: 'clipboard', title: 'On each item',
        text: 'Copy it, mark it as a password (it is then hidden on screen), pin it, add a tag, or delete it.' },
      { target: '#clipPasteBtn', pad: 4, title: 'Paste button', text: 'Saves what is in your clipboard right now, even when automatic saving is off.' },
      { target: '#clipTextActions', title: 'Clean up or import', text: 'Delete all your text history, or bring in the history of another clipboard extension.' }
    ] },

    calculator: { icon: '🧮', title: 'Calculator', guide: 'calculator', open: 'calculator', steps: [
      { target: '#calcInputField', pad: 4, title: 'Type a calculation', text: 'For example (150 * 20) + 12.5, then press Enter. Escape clears it.' },
      { target: '#calcResult', title: 'The result', text: 'The answer appears here.' },
      { target: '#calcGrid', title: 'Or use the keys', text: 'The keys light up as you type on your keyboard.' },
      { target: '#calcHistory', title: 'History', text: 'Your calculations are kept below. Click one to use it again, or clear them all.' }
    ] },

    notes: { icon: '📝', title: 'Notes', guide: 'notes', open: 'notes', steps: [
      { target: '#noteAddBtn', pad: 4, title: 'New note', text: 'Add as many notes as you like. Each one is a tab.' },
      { target: '#noteTabs', title: 'Your notes', text: 'Right-click a note to pin it, rename it, export it as .txt or .md, or delete it.' },
      { target: '#noteSearch', pad: 4, title: 'Search', text: 'Looks through all your notes at once.' },
      { target: '.note-toolbar', title: 'Formatting', text: 'Bold, italic, code, headings, lists and quotes. WorkBox uses Markdown.' },
      { target: '#noteMdToggle', pad: 4, title: 'Preview', text: 'Switch to a rendered preview of your Markdown, and back.' },
      { target: '#noteArea', title: 'Write here', text: 'Your notes stay on this device. The counter below shows words and characters.' }
    ] },

    todo: { icon: '✅', title: 'To-do list', guide: 'notes', open: 'todo', steps: [
      { target: '#todoInput', pad: 4, title: 'Add a task', text: 'Type a task and press Add.' },
      { target: '#todoListWrap', demo: 'todo', title: 'Your tasks', text: 'Tick a task to finish it. Double-click its text to edit it. Finished tasks go to the bottom.' },
      { target: '#todoStats', title: 'What is left', text: 'A counter shows what is left to do. Once some tasks are finished, a Clear completed button appears to remove them in one click.' }
    ] },

    colorpicker: { icon: '🎨', title: 'Color picker', guide: 'color', open: 'colorpicker', steps: [
      { target: '#colorMainBtn', pad: 4, title: 'Choose a color', text: 'Click to open the color wheel. It also has an eyedropper that picks any color on your screen, even outside the browser window.' },
      { target: '#colorHex, #colorRgb, #colorHsl', title: 'HEX, RGB, HSL', text: 'Click a value to copy it.' },
      { target: '#paletteGrid', title: 'Palettes', text: 'Ready-made colors to start from. Click one to copy it.' }
    ] },

    password: { icon: '🔐', title: 'Password generator', guide: 'password', open: 'password', steps: [
      { target: '#pwOutputsList', demo: 'password', title: 'Your new password', text: 'It appears here with a strength gauge. Click it to copy.' },
      { target: '#pwLength', pad: 6, title: 'Length', text: 'Slide to choose how long the password is. Longer is stronger.' },
      { target: '#pwUpper, #pwLower, #pwDigits, #pwSymbols', title: 'Characters', text: 'Choose which kinds of characters it may contain.' },
      { target: '#pwGenerateBtn', pad: 4, title: 'Generate', text: 'Makes a random password on your device, with your browser secure random generator. Nothing is sent anywhere.' },
      { target: '#pwQuantity', pad: 4, title: 'Several at once', text: 'Make a few passwords in one go and pick the one you like.' },
      { target: '#pwExcludeSimilar, #pwAutoCopy', title: 'Options', text: 'Avoid look-alike characters such as O and 0, and copy each new password automatically.' }
    ] },

    converter: { icon: '🔄', title: 'Converter', guide: 'convert', open: 'converter', steps: [
      { target: '#convCategorySelect', pad: 4, title: 'What to convert', text: 'Pick a category: lengths, weights, temperatures, currencies and more.' },
      { target: '#convUnitA, #convInputA', title: 'From', text: 'Choose the unit and type a value.' },
      { target: '#convSwapBtn', pad: 4, title: 'Swap', text: 'Turns the conversion around.' },
      { target: '#convUnitB, #convInputB', title: 'To', text: 'The result appears here as you type. Use Copy to keep it.' },
      { title: 'Currencies', text: 'Choose the currency category to convert money. You can search a country or a currency, and the rates are updated once a day.' }
    ] },

    timer: { icon: '⏱️', title: 'Timer, stopwatch, Pomodoro', guide: 'timer', open: 'timer', steps: [
      { target: '#tmrTabTimer, #tmrTabStopwatch, #tmrTabPomodoro', title: 'Three tools', text: 'A timer, a stopwatch and a Pomodoro, side by side.' },
      { target: '#tmrDisplay', clicks: ['#tmrTabTimer'], title: 'Timer', text: 'Set hours, minutes and seconds. It keeps running if you close the popup.' },
      { target: '#tmrStartBtn', pad: 4, title: 'Start', text: 'You get a notification when time is up.' },
      { target: '#swStartBtn, #swLapBtn, #swResetBtn', clicks: ['#tmrTabStopwatch'], title: 'Stopwatch', text: 'Start or pause with Space, mark a lap with L, reset with R.' },
      { target: '#pomoPhase, #pomoTime', clicks: ['#tmrTabPomodoro'], title: 'Pomodoro', text: 'Focus time, then a break, again and again. The dots show where you are in the cycle.' },
      { target: '#pomoSteps, #pomoAddBtn, #pomoClassicBtn', title: 'Your own rhythm', text: 'Build your own sequence of steps, or use the classic one: 4 focus sessions, short breaks, then a long break.' },
      { target: '#pomoPresetName, #pomoSaveBtn', title: 'Save it', text: 'Give your sequence a name and save it to reuse later.' }
    ] },

    music: { icon: '🎵', title: 'Music player', guide: 'music', open: 'music', steps: [
      { target: '#musicDropZone', title: 'Your own music', text: 'Drop audio files or a whole folder here, or click to choose them.' },
      { target: '.music-list-actions', title: 'Add and reload', text: 'Add files or a folder, restart the player without losing any track, or clear the playlist.' },
      { target: '#localNowPlaying', demo: 'music', title: 'Now playing', text: 'The track that is playing, its position and its length. Drag the bar to jump to another moment.' },
      { target: '.music-controls', demo: 'music', title: 'Controls', text: 'Play or pause, previous, next, repeat (off, whole playlist, or this track only) and mute.' },
      { target: '.music-volume-row', demo: 'music', title: 'Volume', text: 'Slide to change the volume.' },
      { target: '#localPlaylist', demo: 'music', title: 'Playlist', text: 'Your tracks are listed here. Click one to play it. They stay on your device.' }
    ] },

    expander: { icon: '⚡', title: 'Text shortcuts', guide: 'text', open: 'expander', steps: [
      { target: '#expanderShortcut', pad: 4, title: 'A short code', text: 'Choose a code that starts with a symbol, like !mail.' },
      { target: '#expanderText, #expanderAddBtn', title: 'The text it becomes', text: 'Write the full text, then press Add.' },
      { target: '#expanderList', demo: 'expander', title: 'Your shortcuts', text: 'Click one to edit it. Search them when the list grows.' },
      { title: 'Use it anywhere', text: 'On any website, type your code in a text field and it turns into the full text.' }
    ] },

    qr: { icon: '📷', title: 'QR code scanner', guide: 'qr', open: 'qr', steps: [
      { target: '#qrHero', title: 'Scan this page', text: 'Click to find every QR code on the page you are looking at.' },
      { target: '#qrManualBtn', pad: 4, title: 'Draw a box', text: 'Select the area around a code yourself. Works from any page with Alt + S.' },
      { target: '#qrUploadLink, #qrPasteBtn', title: 'From an image', text: 'Import an image file, or paste one you copied.' },
      { target: '#qrEmpty', title: 'The result', text: 'You see what the code contains and where it leads before you open anything, then copy it or open the link.' }
    ] },

    qrgen: { icon: '🔳', title: 'QR code generator', guide: 'qr', open: 'qrgen', after: ['.qg-tab[data-qgtab="content"]'], steps: [
      { target: '#qgTypes', title: 'What is inside', text: 'Choose the type of content: a link, a text and more.' },
      { target: '#qgFields', title: 'Fill it in', text: 'Type or paste the content. The code is drawn above as you go.' },
      { target: '#qgPreview', title: 'Preview', text: 'This is your QR code.' },
      { target: '#qgPng, #qgFormat, #qgCopy', title: 'Download or copy', text: 'Save the image in the format you choose, or copy it.' },
      { target: '#qgTabs', title: 'Settings in tabs', text: 'Content, Shape, Colors, Logo, Export and Saved: one category at a time.' },
      { target: '#qgShape', clicks: ['.qg-tab[data-qgtab="shape"]'], title: 'Shape', text: 'Change the look of the dots and of the three corner squares.' },
      { target: '#qgFg1, #qgBg', clicks: ['.qg-tab[data-qgtab="colors"]'], title: 'Colors', text: 'Pick your colors. Keep strong contrast so phones can read the code.' },
      { target: '#qgLogoBtn', clicks: ['.qg-tab[data-qgtab="logo"]'], pad: 4, title: 'Your logo', text: 'Put an image in the middle, or fetch the logo of the website in your link.' },
      { target: '#qgTest', clicks: ['.qg-tab[data-qgtab="export"]'], pad: 4, title: 'Size and test', text: 'Choose the size, then test that the code can be read before you print or share it.' },
      { target: '#qgHistoryCard', clicks: ['.qg-tab[data-qgtab="saved"]'], title: 'Saved codes', text: 'Your codes are saved here automatically, so you can find them again.' }
    ] },

    compress: { icon: '🗜️', title: 'Image compressor', guide: 'compress', open: 'compress', steps: [
      { target: '#compressDropZone', title: 'Add images', text: 'Drop images here or click to choose them. Nothing is uploaded: it all happens in your browser.' },
      { target: '#compressFolderBtn', pad: 4, title: 'A whole folder', text: 'Compress every image in a folder at once.' },
      { target: '#compressConvertToggle', title: 'Convert to JPEG', text: 'Allow turning images into JPEG when that saves more space.' },
      { target: '#compressInfoBtn', pad: 4, title: 'Formats', text: 'See which image formats are supported.' },
      { title: 'Results', text: 'Each image shows how much space you saved. Download them one by one or all together.' }
    ] },

    tabtriage: { icon: '🗂️', title: 'Tab triage', guide: 'triage', open: 'tabtriage', steps: [
      { target: '#tabTriageToggle', pad: 4, title: 'Turn it on', text: 'It is off by default. When it is on, tabs you open in the background (mouse wheel or Ctrl + click) are sorted for you.' },
      { target: '.tt-flow', title: 'How a tab moves', text: 'A new tab waits in the first group, Not opened yet. When you open it, it leaves the group. When you leave it, it goes to Already opened. No tab is ever closed.' },
      { target: '#ttNameTodo, #ttNameDone', title: 'Rename the groups', text: 'Choose the name of each group. A colored dot or emoji at the start makes them easy to spot on the tab bar.' },
      { target: '#ttColorsTodo, #ttColorsDone', title: 'Pick the colors', text: 'The pills above change color as you choose, the same way the groups look in your browser.' },
      { target: '#tabTriageWhite', title: 'White list', text: 'Sites listed here are never sorted. One per line.' },
      { target: '#tabTriageAddCurrent', pad: 4, title: 'Add this site', text: 'Adds the site you are on to the white list.' }
    ] },

    aisearch: { icon: '🔎', title: 'AI-free search', guide: 'aisearch', open: 'aisearch', steps: [
      { target: '#aiOrb', title: 'On and off', text: 'Click the orb to hide or show AI answers in your searches.' },
      { target: '#aiState', title: 'What it does', text: 'You keep the classic list of links.' },
      { target: '#aiDetect', title: 'Where it works', text: 'On Google and Brave Search.' }
    ] },

    protection: { icon: '🛡️', title: 'Protection', guide: 'protection', open: 'protection', steps: [
      { target: '#protOrb', title: 'On and off', text: 'Click the orb to turn web protection on or off.' },
      { target: '#protTestInput, #protTestBtn', title: 'Check an address', text: 'Type a site address and press Check to see what WorkBox thinks of it, before you visit.' },
      { target: '#protDanger', title: 'What to warn about', text: 'Choose the kinds of sites you want a warning for.' },
      { target: '#protTrustInput, #protTrustAdd', title: 'Trusted sites', text: 'Add sites you trust, so they never trigger a warning.' },
      { target: '#protTrustBookmarks', pad: 4, title: 'Your bookmarks', text: 'Trust all your bookmarks in one click. WorkBox asks your permission first.' },
      { title: 'A help, not a guarantee', text: 'It can miss a dangerous site or flag a harmless one. It does not replace your own care.' }
    ] },

    settings: { icon: '⚙️', title: 'Settings', guide: 'backup', steps: [
      { settings: 'backup', target: '#copySecretKeyBtn', pad: 4, title: 'Back up', text: 'Create a link that holds your notes, clipboard history, tasks and colors. Keep it somewhere safe.' },
      { target: '#importLinkField', pad: 4, title: 'Restore', text: 'Paste a backup link here to bring your data into this WorkBox. You choose to keep or replace what is already there.' },
      { settings: 'privacy', target: '#clipWatchToggle', title: 'Save what I copy', text: 'Turn off to stop WorkBox reading the clipboard at all.' },
      { target: '#appLockSettingsInput', pad: 4, title: 'Encrypt your texts', text: 'Set a password: your saved texts are encrypted. A recovery code is shown once, keep it safe.' },
      { target: '#privSiteInput', pad: 4, title: 'Private sites', text: 'Nothing you copy on these sites is saved. Good for banks and webmail.' },
      { settings: 'storage', target: '#stMini', title: 'Storage', text: 'How full your texts and images are. Nothing is deleted without you.' },
      { settings: 'tuto', target: '#startTourBtn', pad: 4, title: 'Tutorials', text: 'The quick tour and the written guide live here.' }
    ] }
  };

  const GUIDE_URL = () => chrome.runtime.getURL('pages/guide.html');

  // ---------------------------------------------------------------- state
  const MOVE_MS = 460;
  const still = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let root = null, ui = null, hole = null, steps = [], tour = null, index = 0;
  let onKey = null, waitTimer = null, token = 0, raf = 0, busy = false, openedSettings = false, demoCleanups = [];

  const el = (tag, cls, parent) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  };
  const px = (n) => Math.round(n * 10) / 10 + 'px';
  const $ = (s) => document.querySelector(s);
  const clickIf = (s) => { const n = $(s); if (n) n.click(); return !!n; };
  const gridOpen = () => !!$('#gridOverlay.open');
  const closeGrid = () => { if (gridOpen()) $('#gridCloseBtn')?.click(); };

  // ---------------------------------------------------------------- moving around the app
  const panelOn = (n) => !!$('#panel-' + n + '.active');

  async function openTool(name) {
    if (name === 'todo') { await openTool('notes'); clickIf('#btnViewTodo'); await wait(260); return; }
    if (name === 'notes') {
      if (!panelOn('notes')) { clickIf('#bottomNav [data-tab="notes"]'); await wait(360); }
      clickIf('#btnViewNotes'); await wait(200); return;
    }
    if (name === 'qrgen') {
      await openTool('qr');
      if (!panelOn('qrgen')) { clickIf('#panel-qr [data-qrtab="qrgen"]'); await wait(380); }
      return;
    }
    if (name === 'qr' && panelOn('qrgen')) { clickIf('#panel-qrgen [data-qrtab="qr"]'); await wait(380); return; }
    if (panelOn(name)) return;
    if (clickIf('#bottomNav [data-tab="' + name + '"]')) { await wait(360); return; }
    if (!gridOpen()) { clickIf('#gridMenuTrigger'); await wait(430); }
    clickIf('.grid-item[data-tab="' + name + '"]');
    await wait(430);
    closeGrid();
  }

  async function openSettings(pane) {
    if (!$('#settingsOverlay.active')) { clickIf('#settingsOpenBtn'); openedSettings = true; await wait(380); }
    const tab = $('.st-tab[data-pane="' + pane + '"]');
    if (tab && tab.getAttribute('aria-selected') !== 'true') { tab.click(); await wait(280); }
  }

  // ---------------------------------------------------------------- example rows (screen only)
  const mask = (n) => '<span style="display:inline-block;width:14px;height:14px;background-color:currentColor;-webkit-mask:url(\'../icons/svg/presse%20papier/' + n + '.svg\') center/contain no-repeat;mask:url(\'../icons/svg/presse%20papier/' + n + '.svg\') center/contain no-repeat;"></span>';

  function hideChildren(container, keep) {
    // Hide what is there (the empty message) and bring it back afterwards
    const hidden = [];
    [...container.children].forEach((c) => { if (!c.hasAttribute('data-wb-demo') && keep(c)) { hidden.push([c, c.style.display]); c.style.display = 'none'; } });
    return () => hidden.forEach(([c, d]) => { c.style.display = d; });
  }

  const DEMOS = {
    clipboard() {
      const list = $('#clipList');
      if (!list || list.querySelector('.clip-item:not([data-wb-demo])')) return false;   // real items: use them
      const restore = hideChildren(list, () => true);
      const rows = [
        { cat: '🔗 Link', text: 'https://developer.mozilla.org/en-US/docs/Web', time: 'just now' },
        { cat: '📝 Text', text: 'Meeting moved to Thursday 10:30. Send the agenda before.', time: '4 min ago', pin: true },
        { cat: '🎨 Color', text: '#8b5cf6', time: '9 min ago' }
      ];
      rows.forEach((r) => {
        const d = el('div', 'clip-item' + (r.pin ? ' pinned' : ''), list);
        d.setAttribute('data-wb-demo', '');
        d.innerHTML = '<div class="clip-header-info"><div style="display:flex; flex-wrap:wrap;"><span class="clip-cat-badge"></span></div><span class="clip-time"></span></div>'
          + '<div class="clip-text-content"><div class="clip-text-preview clamp"></div></div>'
          + '<div class="clip-footer"><button>' + mask('copier') + '</button><button>🔐</button><button class="' + (r.pin ? 'is-pinned' : '') + '">' + mask('pin') + '</button><button>' + mask('add-tags') + '</button><button class="btn-delete">' + mask('delete') + '</button></div>';
        d.querySelector('.clip-cat-badge').textContent = r.cat;
        d.querySelector('.clip-time').textContent = r.time;
        d.querySelector('.clip-text-preview').textContent = r.text;
      });
      demoCleanups.push(restore);
      return true;
    },
    todo() {
      const wrap = $('#todoListWrap');
      if (!wrap || wrap.querySelector('.todo-item:not([data-wb-demo])')) return false;
      const restore = hideChildren(wrap, () => true);
      [['Publish the new release', false], ['Reply to the support messages', false], ['Back up the project', true]].forEach(([t, done]) => {
        const d = el('div', 'todo-item' + (done ? ' done' : ''), wrap);
        d.setAttribute('data-wb-demo', '');
        d.innerHTML = '<input type="checkbox" class="todo-check" disabled><span class="todo-text"></span>';
        d.querySelector('.todo-check').checked = done;
        d.querySelector('.todo-text').textContent = t;
      });
      demoCleanups.push(restore);
      return true;
    },
    expander() {
      const list = $('#expanderList');
      if (!list || list.querySelector('.exp-item:not([data-wb-demo])')) return false;
      const restore = hideChildren(list, () => true);
      [['!mail', 'hello@example.com'], ['!thx', 'Thank you for your message, I will get back to you shortly.']].forEach(([k, t]) => {
        const d = el('div', 'exp-item', list);
        d.setAttribute('data-wb-demo', '');
        d.innerHTML = '<div class="exp-item-main"><span class="exp-key"></span><span class="exp-text"></span></div>';
        d.querySelector('.exp-key').textContent = k;
        d.querySelector('.exp-text').textContent = t;
      });
      demoCleanups.push(restore);
      return true;
    },
    music() {
      const list = $('#localPlaylist'), now = $('#localNowPlaying');
      if (!list || !now || list.querySelector('.local-playlist-row:not([data-wb-demo])')) return false;   // real tracks: use them
      const restore = hideChildren(list, () => true);
      const title = $('#localNowTitle'), cur = $('#localTimeCurrent'), tot = $('#localTimeTotal'), bar = $('#localProgressBar'), count = $('#localPlaylistCount');
      const keep = { d: now.style.display, t: title && title.textContent, c: cur && cur.textContent, o: tot && tot.textContent, v: bar && bar.value, n: count && count.textContent };
      now.style.display = '';
      if (title) title.textContent = 'Example track';
      if (cur) cur.textContent = '1:12';
      if (tot) tot.textContent = '3:45';
      if (bar) bar.value = 32;
      if (count) count.textContent = '3';
      ['Example track', 'Calm focus', 'Evening walk'].forEach((n, k) => {
        const r = el('div', 'local-playlist-row' + (k === 0 ? ' active' : ''), list);
        r.setAttribute('data-wb-demo', '');
        r.innerHTML = '<span class="local-playlist-dot' + (k === 0 ? ' local-playlist-dot--active' : '') + '"></span><span class="local-playlist-name"></span>';
        r.querySelector('.local-playlist-name').textContent = n;
      });
      demoCleanups.push(() => {
        restore();
        now.style.display = keep.d;
        if (title) title.textContent = keep.t;
        if (cur) cur.textContent = keep.c;
        if (tot) tot.textContent = keep.o;
        if (bar) bar.value = keep.v;
        if (count) count.textContent = keep.n;
      });
      return true;
    },
    password() {
      const out = $('#pwOutput'), fill = $('#pwStrengthFill'), label = $('#pwStrengthLabel');
      if (!out || !/appear here/i.test(out.textContent)) return false;   // a real password is showing: use it
      const keep = { t: out.textContent, c: out.className, s: out.getAttribute('style') };
      const fk = fill && { c: fill.className, s: fill.getAttribute('style') };
      const lk = label && { t: label.textContent, s: label.getAttribute('style') };
      out.textContent = 'Kd7#vQ2m!xR9pLw4';
      if (fill) { fill.style.width = '88%'; fill.style.background = 'var(--success)'; }
      if (label) { label.textContent = 'Strong'; label.style.color = 'var(--success)'; }
      demoCleanups.push(() => {
        out.textContent = keep.t; out.className = keep.c; keep.s == null ? out.removeAttribute('style') : out.setAttribute('style', keep.s);
        if (fill) { fill.className = fk.c; fk.s == null ? fill.removeAttribute('style') : fill.setAttribute('style', fk.s); }
        if (label) { label.textContent = lk.t; lk.s == null ? label.removeAttribute('style') : label.setAttribute('style', lk.s); }
      });
      return true;
    }
  };

  function clearDemos() {
    while (demoCleanups.length) { try { demoCleanups.pop()(); } catch (_) { } }
    document.querySelectorAll('[data-wb-demo]').forEach((n) => n.remove());
  }

  // ---------------------------------------------------------------- overlay
  function stop() {
    token++;
    busy = false;
    clearTimeout(waitTimer);
    cancelAnimationFrame(raf);
    if (onKey) { document.removeEventListener('keydown', onKey, true); onKey = null; }
    clearDemos();
    closeGrid();
    if (tour && tour.after) tour.after.forEach(clickIf);
    if (openedSettings) { openedSettings = false; if ($('#settingsOverlay.active')) clickIf('#settingsCloseBtn'); }
    if (root) { root.remove(); root = null; ui = null; hole = null; }
    steps = []; tour = null;
  }

  function build() {
    const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
    root = el('div', 'wbt-root');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'WorkBox guided tour');
    ui = { W, H, dims: [0, 1, 2, 3].map(() => el('div', 'wbt-dim', root)) };
    ui.cover = el('div', 'wbt-cover', root);
    ui.ring = el('div', 'wbt-ring', root);
    el('span', 'wbt-ripple', ui.ring);
    el('span', 'wbt-ripple wbt-ripple-2', ui.ring);
    ui.hand = el('div', 'wbt-hand', root);
    ui.hand.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M8.5 3a1.5 1.5 0 0 1 3 0v6.2l1.1-.3a1.6 1.6 0 0 1 1.9 1l.3-.1a1.6 1.6 0 0 1 1.9 1.1l.3-.1a1.6 1.6 0 0 1 2 1.6V16c0 3.3-2.2 6-5.5 6h-1.4c-2 0-3.3-.8-4.4-2.2L4.4 15c-.6-.8-.4-1.9.5-2.4.7-.4 1.5-.3 2.1.3l1.5 1.4V3z" fill="#fff" stroke="#7c3aed" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    ui.card = el('div', 'wbt-card', root);
    ui.arrow = el('span', 'wbt-arrow', ui.card);
    ui.head = el('div', 'wbt-head', ui.card);
    ui.title = el('span', 'wbt-title', ui.head);
    ui.dots = el('span', 'wbt-dots', ui.head);
    ui.count = el('span', 'wbt-count', ui.head);
    ui.text = el('p', 'wbt-text', ui.card);
    ui.note = el('p', 'wbt-note', ui.card);
    ui.row = el('div', 'wbt-row', ui.card);
    document.body.appendChild(root);
    hole = { x: W / 2, y: H / 2, w: 0, h: 0 };
    paint(hole);
  }

  // Four dim panels around the hole stop clicks everywhere except on the highlighted element
  function paint(h) {
    const { W, H } = ui;
    const set = (n, x, y, w, hh) => { n.style.cssText = 'left:' + px(x) + ';top:' + px(y) + ';width:' + px(Math.max(0, w)) + ';height:' + px(Math.max(0, hh)); };
    set(ui.dims[0], 0, 0, W, h.y);
    set(ui.dims[1], 0, h.y + h.h, W, H - (h.y + h.h));
    set(ui.dims[2], 0, h.y, h.x, h.h);
    set(ui.dims[3], h.x + h.w, h.y, W - (h.x + h.w), h.h);
    set(ui.ring, h.x, h.y, h.w, h.h);
    set(ui.cover, h.x, h.y, h.w, h.h);
  }

  function glideTo(to) {
    cancelAnimationFrame(raf);
    const from = { x: hole.x, y: hole.y, w: hole.w, h: hole.h };
    if (still()) { hole = to; paint(hole); return; }
    const t0 = performance.now();
    const frame = (now) => {
      if (!root) return;
      const k = Math.min(1, (now - t0) / MOVE_MS), e = ease(k);
      hole = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
      paint(hole);
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  // The element(s) of a step: the ring wraps all of them
  function targetOf(step) {
    if (!step.target) return null;
    const nodes = step.target.split(',').map((s) => $(s.trim())).filter(Boolean)
      .map((n) => (n.matches && n.matches('input[type="checkbox"]') ? (n.closest('label') || n) : n));
    if (!nodes.length) return null;
    nodes[0].scrollIntoView({ block: 'center', inline: 'nearest' });
    let l = 1e9, t = 1e9, r = -1e9, b = -1e9, seen = 0;
    nodes.forEach((n) => {
      const q = n.getBoundingClientRect();
      if (q.width <= 0 || q.height <= 0) return;
      seen++; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    });
    return seen ? { node: nodes[0], r: { left: l, top: t, right: r, bottom: b } } : null;
  }

  function sparkles() {
    if (still()) return;
    const box = el('div', 'wbt-sparks', ui.card);
    for (let i = 0; i < 18; i++) {
      const s = el('i', '', box);
      const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.4, d = 50 + Math.random() * 70;
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d - 20 + 'px');
      s.style.animationDelay = Math.random() * 120 + 'ms';
    }
    setTimeout(() => box.remove(), 1400);
  }

  // ---------------------------------------------------------------- one step
  async function show(i) {
    const my = ++token;
    clearTimeout(waitTimer);
    const step = steps[i];
    if (!step) { stop(); return; }
    index = i;
    busy = true;

    // Go where the step needs to be (another tool, a tab, Settings), then draw the examples
    if (step.settings) await openSettings(step.settings);
    else if (step.open) await openTool(step.open);
    if (my !== token) return;
    if (step.clicks) { for (const s of step.clicks) { clickIf(s); await wait(280); if (my !== token) return; } }
    clearDemos();
    const demoShown = step.demo ? !!DEMOS[step.demo]() : false;
    if (demoShown) await wait(60);
    if (my !== token) return;
    if (!root) build();
    const { W, H } = ui;
    const last = !!step.last;

    const t = targetOf(step);
    const pad = step.pad == null ? 6 : step.pad;
    let to = { x: W / 2, y: H / 2, w: 0, h: 0 };
    if (t) {
      const x = Math.max(0, t.r.left - pad), y = Math.max(0, t.r.top - pad);
      to = { x, y, w: Math.min(W, t.r.right + pad) - x, h: Math.min(H, t.r.bottom + pad) - y };
    }
    glideTo(to);
    ui.ring.classList.toggle('wbt-on', !!t);
    ui.ring.classList.toggle('wbt-pulse', !!(t && step.click));
    ui.cover.style.display = (t && !step.click) ? 'block' : 'none';

    ui.title.textContent = step.title;
    ui.count.textContent = (i + 1) + '/' + steps.length;
    ui.dots.textContent = '';
    if (steps.length <= 10) steps.forEach((_, k) => el('b', k === i ? 'on' : (k < i ? 'done' : ''), ui.dots));
    ui.count.style.display = steps.length <= 10 ? 'none' : '';
    ui.text.textContent = step.text;
    ui.note.textContent = demoShown ? 'The examples shown here are only for the tour. Nothing is saved.' : '';
    ui.note.style.display = demoShown ? 'block' : 'none';
    [ui.title, ui.text].forEach((n) => { n.classList.remove('wbt-swap'); void n.offsetWidth; n.classList.add('wbt-swap'); });

    ui.row.textContent = '';
    const side = el('button', 'wbt-btn wbt-ghost', ui.row);
    side.type = 'button';
    if (last) {
      side.textContent = 'Open the full guide';
      side.addEventListener('click', () => {
        const anchor = step.guide != null ? step.guide : (tour && tour.guide) || '';
        try { chrome.tabs.create({ url: GUIDE_URL() + (anchor ? '#' + anchor : '') }); } catch (_) { }
        stop();
      });
    } else {
      side.textContent = 'Skip tour';
      side.addEventListener('click', stop);
    }
    let nextBtn = null;
    if (!step.click) {
      nextBtn = el('button', 'wbt-btn wbt-primary', ui.row);
      nextBtn.type = 'button';
      nextBtn.textContent = step.next || (last ? 'Finish' : 'Next');
      nextBtn.addEventListener('click', () => {
        if (busy) return;
        if (last) { stop(); return; }
        if (step.closeGridAfter) closeGrid();
        show(i + 1);
      });
    } else {
      el('span', 'wbt-hint', ui.row).textContent = 'Click the glowing button';
    }

    // Card: on the side of the target with the most room, gliding there like the ring
    const cw = 300;
    ui.card.style.width = cw + 'px';
    const cardH = ui.card.offsetHeight;
    let left, top, below = true, ax = cw / 2, arrow = false;
    if (t) {
      const roomBelow = H - (to.y + to.h) - 16, roomAbove = to.y - 16;
      below = roomBelow >= cardH || roomBelow >= roomAbove;
      top = below ? Math.min(to.y + to.h + 16, H - cardH - 8) : Math.max(8, to.y - 16 - cardH);
      left = Math.max(10, Math.min(W - cw - 10, to.x + to.w / 2 - cw / 2));
      ax = Math.max(18, Math.min(cw - 18, to.x + to.w / 2 - left));
      arrow = top + cardH <= to.y + 1 || top >= to.y + to.h - 1;   // no arrow when the card has to sit on the target
    } else {
      left = (W - cw) / 2;
      top = Math.max(40, (H - cardH) / 2);
    }
    ui.card.style.left = px(left);
    ui.card.style.top = px(top);
    ui.arrow.style.display = arrow ? 'block' : 'none';
    ui.arrow.className = 'wbt-arrow ' + (below ? 'wbt-arrow-up' : 'wbt-arrow-down');
    ui.arrow.style.left = px(ax - 7);

    ui.hand.classList.toggle('wbt-on', !!(t && step.click));
    if (t && step.click) {
      ui.hand.style.left = px(to.x + to.w / 2 - 12);   // the fingertip lands near the middle of the element
      ui.hand.style.top = px(to.y + to.h / 2 - 12);
    }
    if (last) sparkles();
    (nextBtn || side).focus({ preventScroll: true });
    busy = false;

    if (step.click && t) {
      // Advance once the person has pressed the element and the app has reacted
      const go = () => {
        t.node.removeEventListener('click', go);
        const startedAt = Date.now();
        const tick = () => {
          if (my !== token) return;
          const opened = step.target === '#gridMenuTrigger' ? gridOpen() : true;
          if (opened || Date.now() - startedAt > 1200) waitTimer = setTimeout(() => { if (my === token) show(i + 1); }, 420);
          else waitTimer = setTimeout(tick, 60);
        };
        waitTimer = setTimeout(tick, 60);
      };
      t.node.addEventListener('click', go);
    }
  }

  // ---------------------------------------------------------------- start
  function start(name) {
    if (root) return;
    const key = typeof name === 'string' && TOURS[name] ? name : 'main';
    tour = TOURS[key];
    steps = tour.steps.map((s) => Object.assign({}, s));
    if (tour.open && !steps[0].open && !steps[0].settings) steps[0].open = tour.open;
    if (key !== 'main' && !steps[steps.length - 1].last) {
      steps.push({ title: 'All set', last: true, guide: tour.guide, text: 'That is the whole ' + tour.title.toLowerCase() + '. The written guide has the details whenever you need them.' });
    }
    if ($('#settingsOverlay.active')) clickIf('#settingsCloseBtn');
    closeGrid();
    if (!onKey) {
      onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); stop(); } };
      document.addEventListener('keydown', onKey, true);
    }
    setTimeout(() => show(0), 300);
  }

  // The list in Settings > Tuto, one button per tool
  const hub = document.getElementById('tourHub');
  if (hub) {
    Object.keys(TOURS).forEach((k) => {
      if (k === 'main') return;
      const b = el('button', 'st-btn tour-chip', hub);
      b.type = 'button';
      b.textContent = TOURS[k].icon + ' ' + TOURS[k].title;
      b.addEventListener('click', () => start(k));
    });
  }

  window.wbStartTour = start;
  window.wbTours = TOURS;   // read by the tour test
  document.getElementById('startTourBtn')?.addEventListener('click', () => start('main'));
  window.addEventListener('pagehide', stop);
})();
