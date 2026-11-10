// Google Identity Services for the login and registration pages.
(function () {
    'use strict';

    const button = document.getElementById('googleSignInBtn');
    if (!button) return;

    const status = document.createElement('p');
    status.className = 'google-register-note';
    status.setAttribute('role', 'status');
    button.after(status);

    const clientId = button.dataset.clientId;
    if (!clientId) {
        status.textContent = 'La connexion Google est indisponible. Continue avec ton e-mail.';
        return;
    }

    async function handleCredential({ credential } = {}) {
        if (!credential || button.inert) return;
        button.inert = true;
        status.textContent = 'Connexion en cours…';

        try {
            const response = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
                status.textContent = 'La connexion Google n’a pas abouti. Réessaie ou continue avec ton e-mail.';
                button.inert = false;
                return;
            }
            window.location.assign(result.needsOnboarding ? '/auth/complete-profile' : '/dashboard');
        } catch {
            status.textContent = 'Connexion interrompue. Réessaie dans un instant.';
            button.inert = false;
        }
    }

    const deadline = Date.now() + 10000;
    function renderWhenReady() {
        const accounts = window.google?.accounts?.id;
        if (!accounts) {
            if (Date.now() < deadline) return setTimeout(renderWhenReady, 200);
            status.textContent = 'Google n’a pas pu se charger. Tu peux continuer avec ton e-mail.';
            return;
        }

        const appleTouch = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        accounts.initialize({
            client_id: clientId,
            ...(appleTouch
                ? { ux_mode: 'redirect', login_uri: window.location.origin + '/api/auth/google/callback' }
                : { ux_mode: 'popup', callback: handleCredential }),
        });
        accounts.renderButton(button, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: button.dataset.buttonText,
            locale: 'fr',
            width: Math.min(button.parentElement.clientWidth || 280, 400),
        });
    }

    renderWhenReady();
})();
