/* Password reset: request a link, then choose a new password from the emailed link.
   The token is read from the URL fragment (never sent to the server in a URL) and kept in memory only. */
(() => {
    'use strict';

    const byId = id => document.getElementById(id);
    const panels = ['requestPanel', 'sentPanel', 'checkingPanel', 'resetPanel', 'expiredPanel', 'donePanel'];
    const emailStorageKey = 'synta_auth_email';
    let busy = false;

    function show(id) {
        panels.forEach(panel => { byId(panel).hidden = panel !== id; });
        const panel = byId(id);
        const target = panel.matches('.status-panel') ? panel : panel.querySelector('input:not([hidden])');
        target?.focus();
    }

    function message(text, error = true) {
        const mount = byId('authMessageMount');
        mount.replaceChildren();
        if (!text) return;
        const note = document.createElement('p');
        note.className = error ? 'message error' : 'message';
        note.textContent = text;
        mount.appendChild(note);
    }

    function fieldError(input, text) {
        input.setAttribute('aria-invalid', text ? 'true' : 'false');
        byId(input.id + '-error').textContent = text;
    }

    function setBusy(form, value) {
        busy = value;
        form.setAttribute('aria-busy', String(value));
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = value;
        submit.textContent = value ? 'Un instant…' : submit.dataset.idle;
    }

    async function postJson(url, body) {
        const response = await fetch(url, {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));
        return { response, data };
    }

    document.querySelectorAll('.password-toggle').forEach(button => {
        button.addEventListener('click', () => {
            const input = button.previousElementSibling;
            const reveal = input.type === 'password';
            input.type = reveal ? 'text' : 'password';
            button.textContent = reveal ? 'Masquer' : 'Afficher';
            button.setAttribute('aria-label', reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
            button.setAttribute('aria-pressed', String(reveal));
        });
    });
    document.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
        if (input.getAttribute('aria-invalid') === 'true') fieldError(input, '');
    }));

    // ── Step 1: request a link ─────────────────────────────────────────────
    const forgotForm = byId('forgotForm');
    const emailInput = byId('email');
    try { emailInput.value = sessionStorage.getItem(emailStorageKey) || ''; } catch { /* storage is optional */ }

    async function requestLink(email) {
        const { response, data } = await postJson('/api/auth/forgot-password', { email });
        if (response.status === 429) return { ok: false, text: 'Trop de demandes. Patiente quelques minutes avant de réessayer.', retryAfter: Number(response.headers.get('Retry-After')) };
        if (!response.ok) return { ok: false, text: data.error || 'Le lien n’a pas pu être envoyé. Réessaie dans un instant.' };
        return { ok: true };
    }

    forgotForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        const email = emailInput.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            fieldError(emailInput, email ? 'Vérifie ton adresse e-mail.' : 'Ce champ est nécessaire.');
            emailInput.focus();
            return;
        }
        message('');
        setBusy(forgotForm, true);
        try {
            const result = await requestLink(email);
            if (!result.ok) { message(result.text); return; }
            try { sessionStorage.setItem(emailStorageKey, email); } catch { /* optional */ }
            byId('sentEmail').textContent = email;
            show('sentPanel');
            wireResend(email);
        } catch {
            message('La connexion a été interrompue. Vérifie ton réseau et réessaie.');
        } finally {
            setBusy(forgotForm, false);
        }
    });

    function cooldown(button, seconds) {
        const original = button.dataset.idle || (button.dataset.idle = button.textContent);
        const readyAt = Date.now() + seconds * 1000;
        button.disabled = true;
        const tick = () => {
            const remaining = Math.max(0, Math.ceil((readyAt - Date.now()) / 1000));
            button.textContent = remaining ? 'Réessayer dans ' + remaining + ' s' : original;
            if (!remaining) { clearInterval(timer); button.disabled = false; }
        };
        const timer = setInterval(tick, 1000);
        tick();
    }

    function wireResend(email) {
        const button = byId('resendBtn');
        const status = byId('resendStatus');
        cooldown(button, 60);
        button.onclick = async () => {
            button.disabled = true;
            status.textContent = 'Envoi du lien…';
            try {
                const result = await requestLink(email);
                status.textContent = result.ok ? 'Demande envoyée. Regarde ta boîte mail et tes courriers indésirables.' : result.text;
                cooldown(button, Number.isFinite(result.retryAfter) && result.retryAfter > 0 ? result.retryAfter : 60);
            } catch {
                status.textContent = 'La connexion a été interrompue. Réessaie.';
                button.disabled = false;
            }
        };
    }

    // ── Step 2: arriving from the emailed link ─────────────────────────────
    let token = null;
    function openLinkFromHash() {
        const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('token');
        if (!fromHash) return;
        token = fromHash;
        // Drop the token from the address bar and history; it stays in memory for this page only.
        window.history.replaceState(null, '', window.location.pathname);
        message('');
        show('checkingPanel');
        postJson('/api/auth/reset-password/check', { token })
            .then(({ response, data }) => {
                if (response.ok && data.valid) show('resetPanel');
                else if (response.ok) show('expiredPanel');
                else { show('resetPanel'); message(data.error || 'Vérification impossible. Tu peux quand même essayer.'); }
            })
            .catch(() => { show('resetPanel'); message('La connexion a été interrompue. Vérifie ton réseau.'); });
    }
    openLinkFromHash();
    // A second email link opened in an already-open tab only changes the fragment.
    window.addEventListener('hashchange', openLinkFromHash);

    const resetForm = byId('resetForm');
    resetForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        const password = byId('password');
        const confirm = byId('confirmPassword');
        let invalid = null;
        if (password.value.length < 6) { fieldError(password, 'Choisis un mot de passe d’au moins 6 caractères.'); invalid ??= password; }
        else if (new TextEncoder().encode(password.value).length > 72) { fieldError(password, 'Ce mot de passe est trop long. Utilise au maximum 72 octets.'); invalid ??= password; }
        if (confirm.value !== password.value) { fieldError(confirm, 'Les deux mots de passe doivent être identiques.'); invalid ??= confirm; }
        if (invalid) { invalid.focus(); return; }
        message('');
        setBusy(resetForm, true);
        try {
            const { response, data } = await postJson('/api/auth/reset-password', { token, password: password.value });
            if (response.ok && data.success) {
                password.value = ''; confirm.value = '';
                show('donePanel');
            } else if (data.expired) show('expiredPanel');
            else message(response.status === 429 ? 'Trop de tentatives. Réessaie dans quelques minutes.' : (data.error || 'Le mot de passe n’a pas pu être changé. Réessaie.'));
        } catch {
            message('La connexion a été interrompue. Vérifie ton réseau et réessaie.');
        } finally {
            setBusy(resetForm, false);
        }
    });

    window.addEventListener('pageshow', event => {
        if (event.persisted) { setBusy(forgotForm, false); setBusy(resetForm, false); }
    });
})();
