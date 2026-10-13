(function () {
    const extAPI = typeof browser !== 'undefined' ? browser : chrome; // Firefox expose `browser`, Chrome expose `chrome`

    let shortcuts = Object.create(null); // "!mail" -> "test@gmail.com"

    function loadShortcuts() {
        if (!extAPI || !extAPI.storage) return;
        extAPI.storage.local.get('textExpanderRules', (data) => {
            const rules = data.textExpanderRules || [];
            shortcuts = Object.create(null);
            rules.forEach(rule => {
                if (rule.shortcut && rule.text) {
                    shortcuts[rule.shortcut.toLowerCase()] = rule.text;
                }
            });
        });
    }

    loadShortcuts();

    if (extAPI && extAPI.storage && extAPI.storage.onChanged) {
        extAPI.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.textExpanderRules) {
                loadShortcuts();
            }
        });
    }

    const WORD_CHAR = /[\p{L}\p{N}_]/u;
    const DELIMITER = /[\s.,;:!?]/;

    // "!mail" style shortcuts (first character is a symbol) fire as soon as they are
    // typed, unless a longer shortcut starts the same way. Plain words ("sig") and
    // those ambiguous prefixes wait for a delimiter, so "signature" can still be typed.
    function firesImmediately(key) {
        if (WORD_CHAR.test(key[0])) return false;
        for (const other in shortcuts) {
            if (other !== key && other.startsWith(key)) return false;
        }
        return true;
    }

    // Longest shortcut that ends `before`, not glued to a preceding word.
    function findShortcut(before, immediate) {
        const lower = before.toLowerCase();
        let best = null;
        for (const key in shortcuts) {
            if (!lower.endsWith(key) || (best && key.length <= best.length)) continue;
            if (firesImmediately(key) !== immediate) continue;
            const prev = before.charAt(before.length - key.length - 1);
            if (prev && WORD_CHAR.test(prev)) continue;
            best = key;
        }
        return best;
    }

    // Returns { el, text, startPos, isInput, noSelection } for a supported field.
    function readField(e) {
        // e.target est retargeté vers le composant hôte quand le vrai champ est dans un
        // Shadow DOM (design systems à base de web components) — composedPath() donne
        // le noeud réel qui a émis l'event
        const el = (typeof e.composedPath === 'function' && e.composedPath()[0]) || e.target;

        if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable)) return null;
        if (el.tagName === 'INPUT' && el.type === 'password') return null; // jamais dans un champ mot de passe

        if (el.isContentEditable) {
            // Gmail, Notion et autres éditeurs riches passent par contentEditable plutôt que value/selectionStart
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return null;
            const node = sel.anchorNode;
            if (!node || node.nodeType !== 3) return null; // text node only
            return { el, text: node.textContent, startPos: sel.anchorOffset, isInput: false };
        }
        const text = el.value || '';
        // email/number inputs expose no selection: the caret is assumed to be at the end
        const noSelection = el.selectionStart == null;
        return { el, text, startPos: noSelection ? text.length : el.selectionStart, isInput: true, noSelection };
    }

    function setNativeValue(el, value) {
        // Certains sites (React/Vue) interceptent .value — on passe par le setter natif
        // du prototype pour contourner leur override et déclencher leur détection de changement
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value); else el.value = value;
    }

    // Replaces the `removeLen` characters before the caret with `insert`.
    function replaceBeforeCaret(field, removeLen, insert) {
        const { el, text, startPos } = field;
        if (field.isInput) {
            const newValue = text.substring(0, startPos - removeLen) + insert + text.substring(startPos);
            if (field.noSelection) {
                setNativeValue(el, newValue);
            } else {
                // execCommand garde l'historique Ctrl+Z, donc on l'essaie en premier
                let selected = false;
                try { el.setSelectionRange(startPos - removeLen, startPos); selected = true; } catch (err) { }
                let nativeSuccess = false;
                if (selected) {
                    try { nativeSuccess = document.execCommand('insertText', false, insert); } catch (err) { }
                }
                if (!nativeSuccess) {
                    setNativeValue(el, newValue);
                    const newPos = startPos - removeLen + insert.length;
                    try { el.setSelectionRange(newPos, newPos); } catch (err) { }
                }
            }
            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
            return;
        }
        const sel = window.getSelection();
        const range = sel.getRangeAt(0);
        range.setStart(range.startContainer, startPos - removeLen);
        range.setEnd(range.startContainer, startPos);
        sel.removeAllRanges();
        sel.addRange(range);

        let success = false;
        try { success = document.execCommand('insertText', false, insert); } catch (err) { }

        if (!success) {
            range.deleteContents();
            const textNode = document.createTextNode(insert);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
        }
    }

    let expanding = false;
    function expand(field, key, tail) {
        expanding = true;
        try { replaceBeforeCaret(field, key.length + tail.length, shortcuts[key] + tail); }
        finally { expanding = false; }
    }

    document.addEventListener('input', (e) => {
        if (!e.isTrusted || expanding) return;
        const field = readField(e);
        if (!field || field.startPos === 0 || !field.text) return;

        const before = field.text.substring(0, field.startPos);
        let key = findShortcut(before, true);
        if (key) { expand(field, key, ''); return; }

        // the delimiter just typed stays after the replacement
        const last = before.charAt(before.length - 1);
        if (!DELIMITER.test(last)) return;
        key = findShortcut(before.slice(0, -1), false);
        if (key) expand(field, key, last);
    }, true); // capture phase pour intercepter avant que le site ne réagisse

    // Enter produces no usable input event in a single-line field or a rich editor
    // (form submit, new paragraph): expand just before the key is handled.
    document.addEventListener('keydown', (e) => {
        if (!e.isTrusted || expanding || e.key !== 'Enter' || e.isComposing) return;
        const field = readField(e);
        if (!field || field.startPos === 0 || !field.text) return;
        const key = findShortcut(field.text.substring(0, field.startPos), false);
        if (key) expand(field, key, '');
    }, true);
})();
