// Session expiry handling for signed-in app pages.
// Detects 401 API responses, warns before the session ends, and replays progress saves after re-login.
(function () {
    'use strict';
    if (window.SyntaSession || !window.__SYNTA_PROFILE__?.id) return;

    const WARNING_MS = 5 * 60 * 1000;
    const QUEUE_KEY = 'synta:pending-saves';
    const QUEUE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
    const QUEUE_LIMIT = 50;
    const REPLAYABLE = new Set(['/api/tracking/progress', '/api/tracking/response']);
    const originalFetch = window.fetch.bind(window);
    let expired = false;
    let loggingOut = false;
    let dialogShown = false;
    let deadline = null;
    let timer = null;

    const userId = () => window.__SYNTA_PROFILE__?.id || '';
    const returnPath = () => location.pathname + location.search;
    const loginUrl = reason => '/login?next=' + encodeURIComponent(returnPath()) + (reason ? '&reason=' + reason : '');

    function readQueue() {
        try {
            const saved = JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]');
            return Array.isArray(saved) ? saved : [];
        } catch (_) { return []; }
    }

    function writeQueue(items) {
        try {
            if (items.length) sessionStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-QUEUE_LIMIT)));
            else sessionStorage.removeItem(QUEUE_KEY);
        } catch (_) { /* Storage can be disabled; the save is then lost as before. */ }
    }

    function queueSave(path, body) {
        writeQueue([...readQueue(), { userId: userId(), path, body, at: Date.now() }]);
    }

    async function replayQueue() {
        const items = readQueue();
        if (!items.length) return;
        writeQueue([]);
        const now = Date.now();
        for (const item of items) {
            // Never send another student's pending work, and drop stale entries.
            if (item.userId !== userId() || !REPLAYABLE.has(item.path) || now - item.at > QUEUE_MAX_AGE_MS) continue;
            try {
                await window.fetch(item.path, {
                    method: 'POST', credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' }, body: item.body,
                });
            } catch (_) { /* A network failure drops this save, as an ordinary failed save would. */ }
        }
    }

    function reconnect() {
        if (expired) return location.assign(loginUrl('expired'));
        // Still signed in: end the old session first, otherwise /login sends the student straight back.
        loggingOut = true;
        originalFetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
            .catch(() => {})
            .finally(() => location.assign(loginUrl()));
    }

    function banner(text) {
        let bar = document.getElementById('session-banner');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'session-banner';
            bar.className = 'session-banner';
            bar.setAttribute('role', 'status');
            const message = document.createElement('span');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'session-banner-action';
            button.textContent = 'Se reconnecter';
            button.addEventListener('click', reconnect);
            bar.append(message, button);
            document.body.appendChild(bar);
        }
        bar.firstChild.textContent = text;
    }

    function showExpiredDialog() {
        if (dialogShown || loggingOut) return;
        dialogShown = true;
        clearTimeout(timer);
        document.getElementById('session-banner')?.remove();
        const previousFocus = document.activeElement;
        const dialog = document.createElement('div');
        dialog.className = 'session-dialog-backdrop';
        dialog.innerHTML = `
            <div class="session-dialog" role="alertdialog" aria-modal="true" aria-labelledby="session-dialog-title" aria-describedby="session-dialog-text">
                <h2 id="session-dialog-title">Session expirée</h2>
                <p id="session-dialog-text">Ta session a expiré. Reconnecte-toi pour reprendre là où tu t’étais arrêté. Ta progression non envoyée sera enregistrée après la reconnexion.</p>
                <div class="session-dialog-actions">
                    <button type="button" class="session-dialog-primary">Se reconnecter</button>
                    <button type="button" class="session-dialog-secondary">Plus tard</button>
                </div>
            </div>`;
        const [primary, secondary] = dialog.querySelectorAll('button');
        const later = () => {
            dialog.remove();
            banner('Ta session a expiré. Reconnecte-toi pour enregistrer ta progression.');
            if (previousFocus?.isConnected) previousFocus.focus();
        };
        primary.addEventListener('click', reconnect);
        secondary.addEventListener('click', later);
        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); later(); }
            if (event.key === 'Tab') {
                event.preventDefault();
                (document.activeElement === primary ? secondary : primary).focus();
            }
        });
        document.body.appendChild(dialog);
        primary.focus();
    }

    function markExpired() {
        expired = true;
        if (document.body) showExpiredDialog();
        else document.addEventListener('DOMContentLoaded', showExpiredDialog, { once: true });
    }

    function schedule() {
        clearTimeout(timer);
        if (expired || deadline === null) return;
        const remaining = deadline - Date.now();
        if (remaining <= 0) return markExpired();
        if (remaining <= WARNING_MS) {
            const minutes = Math.max(1, Math.ceil(remaining / 60000));
            banner(`Ta session expire dans ${minutes} min. Enregistre ton travail puis reconnecte-toi.`);
            timer = setTimeout(schedule, Math.min(remaining, 30000));
        } else {
            timer = setTimeout(schedule, Math.min(remaining - WARNING_MS, 2147483647));
        }
    }

    function readDeadline() {
        const meta = document.querySelector('meta[name="synta-session-expires-in"]');
        // Turbo can move from a fixed testing session to a renewable page without
        // recreating this script. Do not retain its previous one-hour countdown.
        clearTimeout(timer);
        deadline = null;
        if (!meta) {
            if (!expired) document.getElementById('session-banner')?.remove();
            return;
        }
        const seconds = Number(meta.content);
        if (Number.isFinite(seconds) && seconds >= 0) {
            deadline = Date.now() + seconds * 1000;
            schedule();
        }
    }

    window.fetch = async function (input, init) {
        let path = '';
        try {
            const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
            if (url.origin === location.origin) path = url.pathname;
        } catch (_) { /* Not a URL we handle. */ }
        if (path === '/api/auth/logout') loggingOut = true;
        const response = await originalFetch(input, init);
        if (response.status === 401 && path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
            const method = String(init?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
            if (method === 'POST' && REPLAYABLE.has(path) && typeof init?.body === 'string') queueSave(path, init.body);
            markExpired();
        }
        return response;
    };

    window.SyntaSession = {
        redirectToLogin: () => location.assign(loginUrl(expired ? 'expired' : '')),
        markExpired,
    };

    // This script runs in <head>; the banner and dialog need <body>.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', readDeadline, { once: true });
    else readDeadline();
    document.addEventListener('turbo:load', readDeadline);
    void replayQueue();
})();
