(function () {
    // =====================================================
    // CUSTOM REST AUTHENTICATION SYSTEM
    // Replaces Supabase with calls to our own REST API.
    // Exposes window.auth for use by auth pages (login, register).
    // =====================================================

    let authInitialized = true;
    const french = document.documentElement.lang === 'fr';
    const frenchErrors = {
        'email, password, and name are required': 'Renseigne ton nom, ton adresse e-mail et ton mot de passe.',
        'Password must be at least 6 characters': 'Choisis un mot de passe d’au moins 6 caractères.',
        'An account with this email already exists': 'Un compte utilise déjà cette adresse. Connecte-toi ou utilise une autre adresse.',
        'Internal server error': 'Le service est momentanément indisponible. Réessaie dans un instant.',
        'Le mot de passe est trop long.': 'Ce mot de passe est trop long. Choisis un mot de passe plus court.',
        'Vérifie ton nom et ton adresse e-mail.': 'Vérifie ton nom et ton adresse e-mail.',
        'Indique un numéro tunisien valide de 8 chiffres.': 'Indique un numéro tunisien valide de 8 chiffres.',
        'Choisis une année scolaire valide.': 'Choisis une année scolaire valide.',
        'Choisis une section valide.': 'Choisis une section valide.',
        'Invalid email or password': 'L’adresse e-mail ou le mot de passe est incorrect.',
        'البريد الإلكتروني أو كلمة المرور غير صحيحة': 'L’adresse e-mail ou le mot de passe est incorrect.',
        'يرجى التحقق من بريدك الإلكتروني لتفعيل حسابك قبل تسجيل الدخول.': 'Confirme ton adresse e-mail pour activer ton compte.',
    };
    window._authInitialized = true;

    window.authLoading = {
        isRegistering: false,
        isLoggingIn: false,
        isResettingPassword: false
    };

    // --------------------------------------------------
    // UI Helpers
    // --------------------------------------------------
    function unhideContentWrapper() {
        const contentWrapper = document.querySelector('.content-wrapper');
        if (contentWrapper) {
            contentWrapper.classList.remove('turbo-transitioning');
        }
        const overlay = document.getElementById('global-hydration-overlay');
        if (overlay) overlay.remove();
    }

    // Unhide the content as soon as the page loads, because
    // authentication is handled by HttpOnly cookies & EJS renders.
    document.addEventListener('DOMContentLoaded', unhideContentWrapper);

    // --------------------------------------------------
    // Auth Functions
    // --------------------------------------------------
    async function signUp(email, password, userData = {}) {
        if (window.authLoading.isRegistering) {
            return { success: false, message: french ? 'Création du compte en cours…' : 'جاري التسجيل بالفعل، يرجى الانتظار...' };
        }
        window.authLoading.isRegistering = true;

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    name: userData.name || userData.fullname || userData.fullName,
                    phone: userData.phone,
                    class: userData.userClass,
                    branch: userData.userBranch
                })
            });

            const data = await response.json();

            if (!response.ok) {
                const arabicErrors = {
                    'email, password, and name are required': 'يرجى ملء جميع الحقول المطلوبة',
                    'Password must be at least 6 characters': 'يجب أن تكون كلمة المرور 6 أحرف على الأقل',
                    'An account with this email already exists': 'يوجد حساب بهذا البريد الإلكتروني مسبقاً',
                    'Internal server error': 'حدث خطأ في الخادم. يرجى المحاولة لاحقاً.'
                };
                const raw = data.error || '';
                return {
                    success: false,
                    error: 'GENERAL_ERROR',
                    message: french
                        ? response.status === 429 ? 'Trop de tentatives. Réessaie dans quelques minutes.' : frenchErrors[raw] || 'Impossible de créer ton compte. Réessaie dans un instant.'
                        : arabicErrors[raw] || raw || 'حدث خطأ أثناء التسجيل'
                };
            }

            return { success: true, user: data.user, message: 'تم إنشاء الحساب بنجاح!' };
        } catch (error) {
            return { success: false, error: 'NETWORK_ERROR', message: french ? 'Connexion interrompue. Vérifie ton réseau et réessaie.' : 'خطأ في الاتصال بالخادم.' };
        } finally {
            window.authLoading.isRegistering = false;
        }
    }

    async function signIn(email, password) {
        if (window.authLoading.isLoggingIn) {
            return { success: false, message: french ? 'Connexion en cours…' : 'جاري تسجيل الدخول بالفعل، يرجى الانتظار...' };
        }
        window.authLoading.isLoggingIn = true;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false, error: 'INVALID_CREDENTIALS',
                    message: french
                        ? response.status === 429 ? 'Trop de tentatives. Réessaie dans quelques minutes.' : frenchErrors[data.error] || 'La connexion a échoué. Vérifie tes informations et réessaie.'
                        : data.error || 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
                    unverified: data.unverified
                };
            }

            return { success: true, user: data.user, message: 'تم تسجيل الدخول بنجاح!' };
        } catch (error) {
            return { success: false, error: 'NETWORK_ERROR', message: french ? 'Connexion interrompue. Vérifie ton réseau et réessaie.' : 'خطأ في الاتصال بالخادم.' };
        } finally {
            window.authLoading.isLoggingIn = false;
        }
    }

    async function signOut() {
        try {
            const response = await fetch('/api/auth/logout', { method: 'POST' });
            if (response.ok) {
                window.location.href = '/login';
                return { success: true };
            }
            return { success: false, error: 'Logout failed' };
        } catch (error) {
            return { success: false, error: 'Network error' };
        }
    }

    async function resetPassword(email) {
        // Mocked or point to an API if you implement password reset emails via Node.js
        return { success: false, message: "إعادة تعيين كلمة المرور غير مدعومة حالياً. يرجى التواصل مع الإدارة." };
    }

    async function getCurrentUser() {
        try {
            const response = await fetch('/api/user/me');
            if (response.ok) {
                const data = await response.json();
                return { success: true, user: data.user };
            }
            return { success: true, user: null };
        } catch (error) {
            return { success: true, user: null };
        }
    }

    async function updateProfile(updates) {
        try {
            const response = await fetch('/api/user/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            if (response.ok) {
                return { success: true };
            }
            return { success: false, error: 'Update failed' };
        } catch (error) {
            return { success: false, error: 'Network error' };
        }
    }

    // Expose public API
    window.auth = {
        signUp,
        signIn,
        signOut,
        resetPassword,
        getCurrentUser,
        updateProfile,
        isInitialized: () => true
    };

    // Notify other scripts that auth is ready
    document.dispatchEvent(new CustomEvent('supabaseReady')); // Keeping the event name for legacy compatibility

})();
