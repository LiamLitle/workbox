// Copy button on the legal pages: puts the whole page on the clipboard as Markdown.
(function () {
  const main = document.querySelector('main');
  if (!main) return;

  function inline(node) {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, ' '); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName.toLowerCase();
      const inner = inline(n);
      if (t === 'strong' || t === 'b') out += inner.trim() ? '**' + inner.trim() + '**' : inner;
      else if (t === 'em' || t === 'i') out += inner.trim() ? '*' + inner.trim() + '*' : inner;
      else if (t === 'code') out += '`' + n.textContent + '`';
      else if (t === 'a') out += /^https?:/.test(n.getAttribute('href') || '') ? '[' + inner + '](' + n.getAttribute('href') + ')' : inner;
      else if (t === 'br') out += '\n';
      else if (n.classList.contains('date')) out += ' – ' + inner.trim();
      else out += inner;
    });
    return out;
  }

  function toMarkdown() {
    const lines = [];
    main.querySelectorAll(':scope > *').forEach((el) => {
      const t = el.tagName.toLowerCase();
      if (el.classList.contains('brand') || t === 'footer' || el.classList.contains('copy-md')) return;
      const text = inline(el).replace(/[ \t]+/g, ' ').trim();
      if (t === 'h1') lines.push('# ' + text, '');
      else if (t === 'h2') lines.push('## ' + text, '');
      else if (t === 'h3') lines.push('### ' + text, '');
      else if (t === 'ul' || t === 'ol') {
        el.querySelectorAll(':scope > li').forEach((li, i) => lines.push((t === 'ol' ? (i + 1) + '. ' : '- ') + inline(li).replace(/\s+/g, ' ').trim()));
        lines.push('');
      } else if (t === 'section') {
        // a changelog version: headings, lists and paragraphs inside, in order
        el.querySelectorAll(':scope > *').forEach((c) => {
          const ct = c.tagName.toLowerCase();
          const ctext = inline(c).replace(/[ \t]+/g, ' ').trim();
          if (ct === 'h2') lines.push('## ' + ctext, '');
          else if (ct === 'h3') lines.push('### ' + ctext, '');
          else if (ct === 'ul') { c.querySelectorAll(':scope > li').forEach((li) => lines.push('- ' + inline(li).replace(/\s+/g, ' ').trim())); lines.push(''); }
          else if (ctext) lines.push(ctext, '');
        });
      } else if (text) lines.push(text, '');
    });
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy-md';
  btn.title = 'Copy this page as Markdown';
  btn.setAttribute('aria-label', 'Copy this page as Markdown');
  btn.innerHTML = '<span class="copy-md-ico" aria-hidden="true"></span><span class="copy-md-done" aria-live="polite"></span>';
  document.body.appendChild(btn);

  btn.addEventListener('click', async () => {
    const md = toMarkdown();
    try { await navigator.clipboard.writeText(md); }
    catch (_) {
      const ta = document.createElement('textarea'); ta.value = md; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (__) { }
      ta.remove();
    }
    const done = btn.querySelector('.copy-md-done');
    done.textContent = 'Copied';
    btn.classList.add('ok');
    setTimeout(() => { done.textContent = ''; btn.classList.remove('ok'); }, 1800);
  });
})();
