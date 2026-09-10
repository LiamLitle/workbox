(function () {
    const extAPI = typeof browser !== 'undefined' ? browser : chrome; // Firefox expose `browser`, Chrome expose `chrome`

    let shortcuts = {}; // "!mail" -> "test@gmail.com"

    function loadShortcuts() {
        if (!extAPI || !extAPI.storage) return;
        extAPI.storage.local.get('textExpanderRules', (data) => {
            const rules = data.textExpanderRules || [];
            shortcuts = {};
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

    document.addEventListener('input', (e) => {
        // e.target est retargeté vers le composant hôte quand le vrai champ est dans un
        // Shadow DOM (design systems à base de web components) — composedPath() donne
        // le noeud réel qui a émis l'event
        const el = (typeof e.composedPath === 'function' && e.composedPath()[0]) || e.target;

        if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable)) return;
        if (el.tagName === 'INPUT' && el.type === 'password') return; // jamais dans un champ mot de passe

        let text = '';
        let startPos = 0;
        let isInput = false;

        if (el.isContentEditable) {
            // Gmail, Notion et autres éditeurs riches passent par contentEditable plutôt que value/selectionStart
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;
            const node = sel.anchorNode;
            if (node.nodeType === 3) { // text node
                text = node.textContent;
                startPos = sel.anchorOffset;
            } else {
                return;
            }
        } else {
            isInput = true;
            text = el.value || '';
            startPos = el.selectionStart || 0;
        }

        if (startPos === 0 || !text) return;

        const textBeforeCursor = text.substring(0, startPos);
        const words = textBeforeCursor.split(/(\s+)/);
        const lastWord = words[words.length - 1];
        if (!lastWord) return;

        const lastWordLower = lastWord.toLowerCase();
        if (shortcuts[lastWordLower]) {
            const replacement = shortcuts[lastWordLower];
            const wordLen = lastWord.length;

            if (isInput) {
                // execCommand garde l'historique Ctrl+Z, donc on l'essaie en premier
                el.setSelectionRange(startPos - wordLen, startPos);
                let nativeSuccess = false;
                try {
                    nativeSuccess = document.execCommand('insertText', false, replacement);
                } catch (err) { }

                if (!nativeSuccess) {
                    // Certains sites (React/Vue) interceptent .value — on passe par le setter natif
                    // du prototype pour contourner leur override et déclencher leur détection de changement
                    const before = text.substring(0, startPos - wordLen);
                    const after = text.substring(startPos);
                    const newValue = before + replacement + after;

                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;

                    if (el.tagName === 'INPUT' && nativeInputValueSetter) {
                        nativeInputValueSetter.call(el, newValue);
                    } else if (el.tagName === 'TEXTAREA' && nativeTextareaValueSetter) {
                        nativeTextareaValueSetter.call(el, newValue);
                    } else {
                        el.value = newValue;
                    }

                    const newPos = startPos - wordLen + replacement.length;
                    el.setSelectionRange(newPos, newPos);
                }

                el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
            } else {
                const sel = window.getSelection();
                const range = sel.getRangeAt(0);
                range.setStart(range.startContainer, startPos - wordLen);
                range.setEnd(range.startContainer, startPos);
                sel.removeAllRanges();
                sel.addRange(range);

                let success = false;
                try {
                    success = document.execCommand('insertText', false, replacement);
                } catch (err) { }

                if (!success) {
                    range.deleteContents();
                    const textNode = document.createTextNode(replacement);
                    range.insertNode(textNode);
                    range.setStartAfter(textNode);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                }
            }
        }
    }, true); // capture phase pour intercepter avant que le site ne réagisse
})();
