// ----------------------------------------------------------------
// AI DEBUGGER FLOATING DRAWER
// ----------------------------------------------------------------
let aiCooldown = false;

function toggleAiDrawer(forceOpen = null) {
    const drawer = document.getElementById('ai-drawer');
    if (forceOpen === true) {
        drawer.classList.add('open');
    } else if (forceOpen === false) {
        drawer.classList.remove('open');
    } else {
        drawer.classList.toggle('open');
    }
}

async function askAiDebugger() {
    if (!pyEditor) return;
    if (aiCooldown) return;
    
    const code = pyEditor.getValue().trim();
    if (!code) return;

    // Apply 4-second cooldown to prevent spam
    aiCooldown = true;
    const aiBtn = document.querySelector('.cp-ai-btn');
    if (aiBtn) {
        aiBtn.style.opacity = '0.5';
        aiBtn.style.cursor = 'not-allowed';
        setTimeout(() => {
            aiCooldown = false;
            if (aiBtn) {
                aiBtn.style.opacity = '1';
                aiBtn.style.cursor = 'pointer';
            }
        }, 4000);
    }

    // Open drawer
    toggleAiDrawer(true);

    // Grab console context
    const consoleEl = document.getElementById('py-console');
    const errorSpans = consoleEl.querySelectorAll('.console-error');
    let errorText = "";
    if (errorSpans.length > 0) {
        errorSpans.forEach(s => errorText += s.textContent + "\n");
    } else {
        errorText = consoleEl.textContent.trim().substring(0, 500); 
    }

    const historyEl = document.getElementById('ai-chat-history');
    
    // 1. Append User Message
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-bubble user';
    userMsg.innerHTML = `<strong>الكود:</strong><br>${escapeHtml(code)}`;
    historyEl.appendChild(userMsg);

    // 2. Append Loading Skeleton
    const typingId = 'loading-' + Date.now();
    const loadingEl = document.createElement('div');
    loadingEl.className = 'ai-typing';
    loadingEl.id = typingId;
    loadingEl.innerHTML = `<span></span><span></span><span></span>`;
    historyEl.appendChild(loadingEl);
    
    historyEl.scrollTop = historyEl.scrollHeight;

    try {
        const response = await fetch('/api/ai/debug', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, error: errorText })
        });

        const data = await response.json();
        
        // Remove typing indicator
        document.getElementById(typingId)?.remove();

        const aiMsg = document.createElement('div');
        aiMsg.className = 'ai-bubble ai';

        if (!response.ok) {
            aiMsg.innerHTML = `⚠️ خطأ: ${escapeHtml(data.error || 'Erreur inconnue')}`;
        } else {
            let htmlResponse = escapeHtml(data.explanation);
            htmlResponse = htmlResponse.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            aiMsg.innerHTML = htmlResponse;
        }

        historyEl.appendChild(aiMsg);
        historyEl.scrollTop = historyEl.scrollHeight;

    } catch (err) {
        console.error(err);
        document.getElementById(typingId)?.remove();
        const aiMsg = document.createElement('div');
        aiMsg.className = 'ai-bubble ai';
        aiMsg.innerHTML = `⚠️ السيرفر مشغول، يرجى المحاولة بعد قليل.`;
        historyEl.appendChild(aiMsg);
        historyEl.scrollTop = historyEl.scrollHeight;
    }
}

// ----------------------------------------------------------------
// INIT — mount CodeMirror editors
// ----------------------------------------------------------------
function initEditors() {
    // Clear any previous CodeMirror instances from DOM
    ['py-editor-body','web-pane-html','web-pane-css','web-pane-js'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const cm = el.querySelector('.CodeMirror');
            if (cm) cm.remove();
        }
    });

    // ---- PYTHON editor ----
    pyEditor = CodeMirror(document.getElementById('py-editor-body'), {
        value: '# Ecrivez votre code Python ici...',
        mode: 'python',
        theme: 'dracula',
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: false,
        extraKeys: {
            'Ctrl-Enter': runPython,
            'Enter': function(cm) {
                const cursor  = cm.getCursor();
                const line    = cm.getLine(cursor.line);
                const trimmed = line.trimEnd();
                if (trimmed.endsWith(':')) {
                    const indent = line.match(/^\s*/)[0];
                    cm.replaceSelection('\n' + indent + '    ');
                } else {
                    cm.execCommand('newlineAndIndent');
                }
            }
        }
    });

    // ---- WEB editors — initialize ALL even if hidden so CodeMirror has correct size ----
    // We force them visible temporarily, init, then hide again
    var htmlPane = document.getElementById('web-pane-html');
    var cssPane  = document.getElementById('web-pane-css');
    var jsPane   = document.getElementById('web-pane-js');

    webHtmlEditor = CodeMirror(htmlPane, {
        value: '<!-- Ecrivez votre HTML ici -->\n<h1>Bonjour, Synta Academy !</h1>\n<p>Testez votre page web ici.</p>',
        mode: 'htmlmixed',
        theme: 'dracula',
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        indentUnit: 2,
        tabSize: 2,
        lineWrapping: true,
        extraKeys: { 'Ctrl-Enter': runWeb }
    });

    webCssEditor = CodeMirror(cssPane, {
        value: '/* Votre CSS ici */\nbody {\n  font-family: sans-serif;\n  text-align: center;\n  padding: 40px;\n  background: #f0f4ff;\n}\nh1 { color: #ff7b1a; }',
        mode: 'css',
        theme: 'dracula',
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        indentUnit: 2,
        tabSize: 2,
        extraKeys: { 'Ctrl-Enter': runWeb }
    });

    webJsEditor = CodeMirror(jsPane, {
        value: '// Votre JavaScript ici\nconsole.log("Page chargee !");',
        mode: 'javascript',
        theme: 'dracula',
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        indentUnit: 2,
        tabSize: 2,
        extraKeys: { 'Ctrl-Enter': runWeb }
    });

    // Refresh all editors after a short delay to fix hidden-pane sizing
    setTimeout(function() {
        pyEditor.refresh();
        webHtmlEditor.refresh();
        webCssEditor.refresh();
        webJsEditor.refresh();
        // Set cursor to line 0 col 0 (no blank space scroll offset)
        pyEditor.setCursor(0, 0);
        webHtmlEditor.setCursor(0, 0);
        webCssEditor.setCursor(0, 0);
        webJsEditor.setCursor(0, 0);
    }, 50);

    // Populate examples + run initial web preview
    populateExamples('python');
    runWeb();
}

// ----------------------------------------------------------------
// BOOT
// ----------------------------------------------------------------
function boot() {
    // Guard: only run on the Code Pratique page
    if (!document.getElementById('py-editor-body')) return;
    pyEditor = null; webHtmlEditor = null; webCssEditor = null; webJsEditor = null;
    initEditors();
    clearConsole();
    showConsoleWelcome();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

// Turbo SPA: always re-boot when the page is loaded (DOM may have changed)
document.addEventListener('turbo:load', function() {
    // Check if CodeMirror is actually mounted in the current DOM
    var pyBody = document.getElementById('py-editor-body');
    if (!pyBody) return; // not on this page
    var alreadyMounted = !!pyBody.querySelector('.CodeMirror');
    if (!alreadyMounted) { boot(); }
    else {
        // Editor is there — just refresh layout
        if (pyEditor) pyEditor.refresh();
        if (webHtmlEditor) webHtmlEditor.refresh();
        if (webCssEditor)  webCssEditor.refresh();
        if (webJsEditor)   webJsEditor.refresh();
    }
});
</script>
</body>
</html>
