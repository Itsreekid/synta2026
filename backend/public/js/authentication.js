(function () {
    // =====================================================
    // CUSTOM REST AUTHENTICATION SYSTEM
    // Replaces Supabase with calls to our own REST API.
    // Exposes window.auth for use by auth pages (login, register).
    // =====================================================

    let authInitialized = true;
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
            return { success: false, error: 'جاري التسجيل بالفعل، يرجى الانتظار...' };
        }
        window.authLoading.isRegistering = true;

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    name: userData.fullname,
                    phone: userData.phone,
                    class: userData.userClass,
                    branch: userData.userBranch
                })
            });

            const data = await response.json();

            if (!response.ok) {
                return { success: false, error: 'GENERAL_ERROR', message: data.error || 'حدث خطأ أثناء التسجيل' };
            }

            return { success: true, user: data.user, message: 'تم إنشاء الحساب بنجاح!' };
        } catch (error) {
            return { success: false, error: 'NETWORK_ERROR', message: 'خطأ في الاتصال بالخادم.' };
        } finally {
            window.authLoading.isRegistering = false;
        }
    }

    async function signIn(email, password) {
        if (window.authLoading.isLoggingIn) {
            return { success: false, error: 'جاري تسجيل الدخول بالفعل، يرجى الانتظار...' };
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
                return { success: false, error: 'INVALID_CREDENTIALS', message: data.error || 'البريد الإلكتروني أو كلمة المرور غير صحيحة.', unverified: data.unverified };
            }

            return { success: true, user: data.user, message: 'تم تسجيل الدخول بنجاح!' };
        } catch (error) {
            return { success: false, error: 'NETWORK_ERROR', message: 'خطأ في الاتصال بالخادم.' };
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
