// Deliberately small Markdown subset. Raw HTML is text, never executable markup.
// A final allowlist sanitization also strips attributes and unexpected elements.
(() => {
    const allowed = new Set(['P', 'STRONG', 'EM', 'UL', 'OL', 'LI']);
    function sanitize(node) {
        const output = document.createDocumentFragment();
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) output.append(document.createTextNode(child.data));
            else if (child.nodeType === Node.ELEMENT_NODE && allowed.has(child.tagName)) {
                const clean = document.createElement(child.tagName.toLowerCase());
                clean.append(sanitize(child));
                output.append(clean);
            }
        }
        return output;
    }
    function inline(text, parent, depth = 0) {
        if (depth > 8) { parent.append(document.createTextNode(text)); return; }
        const pattern = /\\([\\*_])|\*\*(?=\S)(.+?)\*\*|__(?=\S)(.+?)__|\*(?=\S)([^*]+?)\*|(?<![\p{L}\p{N}_])_(?=\S)([^_]+?)_(?![\p{L}\p{N}_])/gu;
        let match, position = 0;
        while ((match = pattern.exec(text))) {
            parent.append(document.createTextNode(text.slice(position, match.index)));
            if (match[1]) parent.append(document.createTextNode(match[1]));
            else {
                const element = document.createElement(match[2] || match[3] ? 'strong' : 'em');
                inline(match[2] || match[3] || match[4] || match[5], element, depth + 1);
                parent.append(element);
            }
            position = pattern.lastIndex;
        }
        parent.append(document.createTextNode(text.slice(position)));
    }
    function render(value, { maxLength } = {}) {
        const fragment = document.createDocumentFragment();
        let paragraph = [], list = null;
        const flush = () => {
            if (!paragraph.length) return;
            const p = document.createElement('p'); inline(paragraph.join(' '), p);
            fragment.append(p); paragraph = [];
        };
        for (const line of String(value ?? '').replace(/\r\n?/g, '\n').split('\n')) {
            const item = /^\s*(?:([-+*])\s+|(\d+)[.)]\s+)(.+)$/.exec(line);
            if (item) {
                flush(); const tag = item[1] ? 'ul' : 'ol';
                if (!list || list.tagName.toLowerCase() !== tag) {
                    list = document.createElement(tag); fragment.append(list);
                }
                const li = document.createElement('li'); inline(item[3], li); list.append(li);
            } else {
                list = null;
                if (!line.trim()) flush(); else paragraph.push(line.trim());
            }
        }
        flush();
        const clean = sanitize(fragment);
        if (Number.isInteger(maxLength) && maxLength > 0) {
            const walker = document.createTreeWalker(clean, NodeFilter.SHOW_TEXT);
            const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
            let remaining = maxLength;
            const truncated = nodes.reduce((count, node) => count + Array.from(node.data).length, 0) > maxLength;
            for (const node of nodes) {
                const characters = Array.from(node.data), take = Math.min(remaining, characters.length);
                node.data = characters.slice(0, take).join(''); remaining -= take;
                if (truncated && remaining === 0 && take > 0) node.data = node.data.trimEnd() + '…';
            }
            for (const element of [...clean.querySelectorAll('*')].reverse()) if (!element.textContent) element.remove();
        }
        return clean;
    }
    window.CourseMarkdown = Object.freeze({ render });
})();
