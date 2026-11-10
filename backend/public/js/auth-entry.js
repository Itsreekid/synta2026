/* Account entry interactions. Passwords stay in the current form only. */
(() => {
    'use strict';

    const form = document.querySelector('#loginForm, #registerForm, #completeProfileForm');
    if (!form) return;
    const register = form.id === 'registerForm';
    const profileOnly = form.id === 'completeProfileForm';
    let step = 1;
    let busy = false;
    const byId = id => document.getElementById(id);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const accountFields = ['fullName', 'email', 'password', 'confirmPassword'];
    const emailStorageKey = 'synta_auth_email';

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
        const error = byId(input.id + '-error');
        if (error) error.textContent = text;
    }

    function validate(input) {
        if (input.disabled) return true;
        const value = input.type === 'password' ? input.value : input.value.trim();
        let error = '';
        if (!value) error = input.tagName === 'SELECT' ? 'Choisis une option pour continuer.' : 'Ce champ est nécessaire.';
        else if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = 'Vérifie ton adresse e-mail.';
        else if (input.id === 'phone' && !/^[24579][0-9]{7}$/.test(value)) error = 'Indique 8 chiffres, commençant par 2, 4, 5, 7 ou 9.';
        else if (input.id === 'password' && register && value.length < 6) error = 'Choisis un mot de passe d’au moins 6 caractères.';
        else if (input.id === 'password' && register && new TextEncoder().encode(value).length > 72) error = 'Ce mot de passe est trop long. Utilise au maximum 72 octets.';
        else if (input.id === 'confirmPassword' && value !== byId('password').value) error = 'Les deux mots de passe doivent être identiques.';
        fieldError(input, error);
        return !error;
    }

    function validateFields(ids) {
        let firstInvalid = null;
        for (const id of ids) {
            const input = byId(id);
            if (input && !validate(input) && !firstInvalid) firstInvalid = input;
        }
        if (firstInvalid) {
            firstInvalid.focus();
            firstInvalid.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        }
        return !firstInvalid;
    }

    function setStep(next, focus = true) {
        step = next;
        byId('accountStep').hidden = next !== 1;
        byId('profileStep').hidden = next !== 2;
        byId('registerGoogle').hidden = next !== 1;
        byId('accountStepLabel').toggleAttribute('aria-current', next === 1);
        byId('profileStepLabel').toggleAttribute('aria-current', next === 2);
        (next === 1 ? byId('accountStepLabel') : byId('profileStepLabel')).setAttribute('aria-current', 'step');
        message('');
        if (focus) (next === 1 ? byId('fullName') : form.querySelector('input[name="learnerType"]:checked')).focus();
    }

    function rememberEmail() {
        try {
            const email = byId('email')?.value.trim();
            if (email) sessionStorage.setItem(emailStorageKey, email);
        } catch { /* Navigation and forms also work when browser storage is blocked. */ }
    }

    if (byId('email')) {
        try {
            if (!byId('email').value) byId('email').value = sessionStorage.getItem(emailStorageKey) || '';
        } catch { /* Browser storage is optional. */ }
    }
    document.querySelectorAll('[data-auth-link]').forEach(link => link.addEventListener('click', rememberEmail));

    form.querySelectorAll('input:not([type="radio"]), select').forEach(input => {
        input.addEventListener('blur', () => { if (input.value) validate(input); });
        input.addEventListener('input', () => {
            if (input.getAttribute('aria-invalid') === 'true') fieldError(input, '');
        });
        input.addEventListener('change', () => fieldError(input, ''));
    });
    document.querySelectorAll('.password-toggle').forEach(button => {
        button.addEventListener('click', () => {
            const input = button.previousElementSibling;
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            button.textContent = show ? 'Masquer' : 'Afficher';
            button.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
            button.setAttribute('aria-pressed', String(show));
        });
    });

    function syncProfile() {
        const independent = form.querySelector('[name="learnerType"]:checked')?.value === 'independent';
        byId('schoolFields').hidden = independent;
        byId('userClass').disabled = independent;
        byId('userBranch').disabled = independent;
        byId('section-hint').textContent = independent
            ? 'Pour tes études ou tes projets, découvre les formations ouvertes à tous.'
            : 'Choisis ton niveau actuel pour retrouver les formations qui te correspondent.';
    }
    if (byId('schoolFields')) {
        form.querySelectorAll('[name="learnerType"]').forEach(input => input.addEventListener('change', syncProfile));
        byId('userClass').addEventListener('change', () => {
            if (byId('userClass').value === '1ere' && !byId('userBranch').value) byId('userBranch').value = 'other';
        });
        byId('phone').addEventListener('input', event => {
            let digits = event.target.value.replace(/\D/g, '');
            if (digits.length === 13 && digits.startsWith('00216')) digits = digits.slice(5);
            else if (digits.length === 11 && digits.startsWith('216')) digits = digits.slice(3);
            event.target.value = digits.slice(0, 8);
        });
        syncProfile();
    }

    if (register) {
        byId('nextStep').addEventListener('click', () => {
            if (validateFields(accountFields)) setStep(2);
        });
        byId('previousStep').addEventListener('click', () => setStep(1));
    }

    function setBusy(value) {
        busy = value;
        form.setAttribute('aria-busy', String(value));
        form.querySelectorAll('button:not(.password-toggle)').forEach(button => { button.disabled = value; });
        const submit = form.querySelector('[type="submit"]');
        submit.textContent = value ? 'Un instant…' : submit.dataset.idle;
    }

    function showVerification(email, signup) {
        byId(signup ? 'registerFormPanel' : 'loginFormPanel').hidden = true;
        byId(signup ? 'registeredEmailDisplay' : 'unverifiedEmailDisplay').textContent = email;
        const panel = byId(signup ? 'registerSuccessState' : 'unverifiedState');
        panel.hidden = false;
        panel.focus();
        wireResend(email, signup);
        rememberEmail();
        if (byId('password')) byId('password').value = '';
        if (byId('confirmPassword')) byId('confirmPassword').value = '';
    }

    function wireResend(email, signup) {
        const button = byId(signup ? 'resendVerificationBtn' : 'resendVerificationBtnLogin');
        const status = byId(signup ? 'resendMessage' : 'resendMessageLogin');
        button.onclick = async () => {
            button.disabled = true;
            status.textContent = 'Envoi du lien…';
            let coolingDown = false;
            try {
                const response = await fetch('/api/auth/resend-verification', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
                });
                let seconds = 60;
                if (!response.ok) {
                    status.textContent = response.status === 429
                        ? 'Trop de demandes. Patiente quelques minutes avant de réessayer.'
                        : 'Le lien n’a pas pu être envoyé. Réessaie dans un instant.';
                    if (response.status !== 429) return;
                    const retryAfter = Number(response.headers.get('Retry-After'));
                    if (Number.isFinite(retryAfter) && retryAfter > 0) seconds = retryAfter;
                } else status.textContent = 'Demande envoyée. Regarde ta boîte mail et tes courriers indésirables.';
                coolingDown = true;
                const readyAt = Date.now() + seconds * 1000;
                const original = button.textContent;
                const timer = setInterval(() => {
                    const remaining = Math.max(0, Math.ceil((readyAt - Date.now()) / 1000));
                    button.textContent = remaining ? 'Réessayer dans ' + remaining + ' s' : original;
                    if (!remaining) { clearInterval(timer); button.disabled = false; }
                }, 1000);
                return;
            } catch {
                status.textContent = 'La connexion a été interrompue. Réessaie.';
            } finally {
                if (!coolingDown) button.disabled = false;
            }
        };
    }

    byId('unverifiedState')?.querySelector('[data-return-login]')?.addEventListener('click', () => {
        byId('unverifiedState').hidden = true;
        byId('loginFormPanel').hidden = false;
        byId('password').focus();
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        if (register && step === 1) {
            if (validateFields(accountFields)) setStep(2);
            return;
        }
        if (register && !validateFields(accountFields)) { setStep(1, false); return; }
        const fields = register || profileOnly ? ['userClass', 'userBranch', 'phone'] : ['email', 'password'];
        if (!validateFields(fields)) return;
        message('');
        setBusy(true);
        let navigating = false;
        try {
            const email = byId('email')?.value.trim();
            const independent = form.querySelector('[name="learnerType"]:checked')?.value === 'independent';
            const profile = register || profileOnly ? {
                phone: byId('phone').value,
                userClass: independent ? 'other' : byId('userClass').value,
                userBranch: independent ? 'other' : byId('userBranch').value,
            } : null;
            let result;
            if (profileOnly) {
                const response = await fetch('/api/auth/complete-profile', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: profile.phone, user_class: profile.userClass, user_branch: profile.userBranch }),
                });
                result = { success: response.ok };
                if (response.status === 401) {
                    message('Ta session a expiré. Reconnecte-toi pour terminer ton profil.');
                    return;
                }
            } else if (register) {
                result = await window.auth.signUp(email, byId('password').value, { name: byId('fullName').value.trim(), ...profile });
            } else result = await window.auth.signIn(email, byId('password').value);

            if (result.success) {
                if (register) showVerification(email, true);
                else { navigating = true; window.location.assign('/dashboard'); }
            } else if (result.unverified) showVerification(email, false);
            else message(result.message || 'Impossible de continuer pour le moment. Réessaie dans un instant.');
        } catch {
            message('La connexion a été interrompue. Vérifie ton réseau et réessaie.');
        } finally {
            if (!navigating) setBusy(false);
        }
    });

    window.addEventListener('pageshow', event => {
        if (event.persisted) setBusy(false);
    });
    const params = new URLSearchParams(window.location.search);
    if (params.has('google_error')) {
        message('La connexion Google n’a pas abouti. Réessaie ou utilise ton adresse e-mail.');
        params.delete('google_error');
        window.history.replaceState(null, '', window.location.pathname + (params.size ? '?' + params : '') + window.location.hash);
    }
})();
