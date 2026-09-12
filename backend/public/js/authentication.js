(function () {
    // =====================================================
    // AUTHENTICATION SYSTEM
    // Initializes the Supabase client-side SDK, exposes
    // window.auth for use by auth pages (login, register),
    // and handles session state changes.
    //
    // KEY ARCHITECTURE NOTE:
    // Protected pages (dashboard, profile, etc.) have their
    // user data pre-populated server-side via EJS + the
    // attachUserProfile middleware. This script is responsible
    // for the Supabase client SDK lifecycle, NOT for hydrating
    // the UI — that responsibility belongs to the server.
    //
    // Credentials are read from window.__SYNTA_CONFIG__ which
    // is injected by partials/head.ejs from process.env.
    // =====================================================

    // Read credentials from the server-injected config block.
    // This removes hardcoded secrets from client-side code.
    const config = window.__SYNTA_CONFIG__ || {};
    const SUPABASE_URL     = config.supabaseUrl     || '';
    const SUPABASE_ANON_KEY = config.supabaseAnonKey || '';

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('[Auth] Missing Supabase config. Check server __SYNTA_CONFIG__ injection.');
    }

    let supabaseClient;
    let authInitialized = window._authInitialized || false;
    let initializationAttempts = 0;
    const MAX_INIT_ATTEMPTS = 5;

    window.supabaseClient = window.supabaseClient || null;

    window.authLoading = window.authLoading || {
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
            // Remove the transitioning class to fade back in
            contentWrapper.classList.remove('turbo-transitioning');
        }
        const overlay = document.getElementById('global-hydration-overlay');
        if (overlay) overlay.remove();
    }

    function showGlobalError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: #f44336; color: white;
            padding: 15px 20px; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10001; font-family: 'Tajawal', sans-serif;
            max-width: 300px;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => { if (document.body.contains(errorDiv)) errorDiv.remove(); }, 5000);
    }

    // --------------------------------------------------
    // Initialisation
    // --------------------------------------------------

    function startAuthInit() {
        if (!authInitialized) {
            setTimeout(initializeSupabase, 100);
        } else {
            // On subsequent Turbo navigations, just unhide the wrapper.
            // The server has already pre-populated the page content.
            unhideContentWrapper();
        }
    }

    if (!window._authEventsBound) {
        window._authEventsBound = true;
        document.addEventListener('turbo:load', startAuthInit);
        document.addEventListener('DOMContentLoaded', startAuthInit);

        // Before Turbo swaps in new content, briefly hide to prevent flash
        document.addEventListener('turbo:before-render', function(e) {
            const cw = e.detail.newBody ? e.detail.newBody.querySelector('.content-wrapper') : null;
            if (cw) cw.classList.add('turbo-transitioning');
        });
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        startAuthInit();
    }

    function initializeSupabase() {
        if (window.supabaseClient) {
            supabaseClient = window.supabaseClient;
            return;
        }

        if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            try {
                supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                window.supabaseClient = supabaseClient;
                initializeAuth();
            } catch (error) {
                console.error('[Auth] Error creating Supabase client:', error);
                retryInitialization();
            }
        } else {
            retryInitialization();
        }
    }

    function retryInitialization() {
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            initializationAttempts++;
            setTimeout(function () {
                if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
                    try {
                        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                        window.supabaseClient = supabaseClient;
                        initializeAuth();
                    } catch (error) {
                        console.error('[Auth] Error creating Supabase client:', error);
                        retryInitialization();
                    }
                } else {
                    retryInitialization();
                }
            }, 1000);
        } else {
            console.error('[Auth] Failed to initialize Supabase after maximum attempts');
            showGlobalError('خطأ في تحميل نظام المصادقة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            // Still unhide the content so the user isn't blocked
            unhideContentWrapper();
        }
    }

    // --------------------------------------------------
    // Auth Functions
    // --------------------------------------------------

    function initializeAuth() {
        authInitialized = true;
        window._authInitialized = true;

        /**
         * Sign up a new user.
         */
        async function signUp(email, password, userData = {}) {
            if (window.authLoading.isRegistering) {
                return { success: false, error: 'جاري التسجيل بالفعل، يرجى الانتظار...' };
            }
            window.authLoading.isRegistering = true;

            try {
                const { data, error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name:   userData.fullname,
                            phone:       userData.phone,
                            user_class:  userData.userClass,
                            user_branch: userData.userBranch
                        },
                        emailRedirectTo: window.location.origin + '/login'
                    }
                });

                if (error) throw error;

                if (data.user) {
                    await supabaseClient.auth.updateUser({
                        data: { email_confirmed_at: new Date().toISOString() }
                    }).catch(() => {});
                }

                return {
                    success: true,
                    data,
                    message: 'تم إنشاء الحساب بنجاح! يمكنك تسجيل الدخول الآن.',
                    user: data.user
                };
            } catch (error) {
                let userFriendlyError = 'حدث خطأ أثناء إنشاء الحساب';
                let errorType = 'GENERAL_ERROR';

                if (error.message?.includes('already registered') || error.message?.includes('User already registered')) {
                    return { success: true, error: 'ALREADY_REGISTERED', message: 'أنت مسجل بالفعل! يمكنك تسجيل الدخول مباشرة.', user: null, redirectTo: '/dashboard' };
                } else if (error.message?.includes('Email signups are disabled')) {
                    userFriendlyError = 'التسجيل معطل حالياً. يرجى التواصل مع إدارة الموقع لتفعيل التسجيل.';
                    errorType = 'SIGNUPS_DISABLED';
                } else if (error.message?.includes('Invalid email')) {
                    userFriendlyError = 'البريد الإلكتروني غير صحيح.';
                    errorType = 'INVALID_EMAIL';
                } else if (error.message?.includes('password')) {
                    userFriendlyError = 'كلمة المرور يجب أن تكون أقوى. يرجى استخدام 8 أحرف على الأقل.';
                    errorType = 'WEAK_PASSWORD';
                } else if (error.message?.includes('network')) {
                    userFriendlyError = 'خطأ في الاتصال. يرجى التحقق من اتصال الإنترنت.';
                    errorType = 'NETWORK_ERROR';
                } else if (error.message?.includes('Too many requests')) {
                    userFriendlyError = 'تم تجاوز عدد المحاولات المسموح. يرجى الانتظار قليلاً.';
                    errorType = 'RATE_LIMIT';
                }

                return { success: false, error: errorType, message: userFriendlyError, details: error };
            } finally {
                window.authLoading.isRegistering = false;
            }
        }

        /**
         * Sign in an existing user.
         */
        async function signIn(email, password) {
            if (window.authLoading.isLoggingIn) {
                return { success: false, error: 'جاري تسجيل الدخول بالفعل، يرجى الانتظار...' };
            }
            window.authLoading.isLoggingIn = true;

            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

                if (error) {
                    if (error.message?.includes('Invalid login credentials')) {
                        return { success: false, error: 'INVALID_CREDENTIALS', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' };
                    }
                    throw error;
                }

                return { success: true, data, message: 'تم تسجيل الدخول بنجاح!', user: data.user };
            } catch (error) {
                let userFriendlyError = 'حدث خطأ أثناء تسجيل الدخول';
                let errorType = 'GENERAL_ERROR';

                if (error.message?.includes('Invalid login credentials')) {
                    userFriendlyError = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
                    errorType = 'INVALID_CREDENTIALS';
                } else if (error.message?.includes('network')) {
                    userFriendlyError = 'خطأ في الاتصال. يرجى التحقق من اتصال الإنترنت.';
                    errorType = 'NETWORK_ERROR';
                } else if (error.message?.includes('Too many requests')) {
                    userFriendlyError = 'تم تجاوز عدد المحاولات المسموح. يرجى الانتظار قليلاً.';
                    errorType = 'RATE_LIMIT';
                } else if (error.message?.includes('User not found')) {
                    userFriendlyError = 'البريد الإلكتروني غير مسجل في النظام.';
                    errorType = 'USER_NOT_FOUND';
                }

                return { success: false, error: errorType, message: userFriendlyError, details: error };
            } finally {
                window.authLoading.isLoggingIn = false;
            }
        }

        /**
         * Sign out the current user.
         */
        async function signOut() {
            try {
                const { error } = await supabaseClient.auth.signOut();
                if (error) throw error;
                return { success: true, message: 'تم تسجيل الخروج بنجاح!' };
            } catch (error) {
                return { success: false, error: error.message || 'حدث خطأ أثناء تسجيل الخروج', details: error };
            }
        }

        /**
         * Send a password reset email.
         */
        async function resetPassword(email) {
            if (window.authLoading.isResettingPassword) {
                return { success: false, error: 'جاري إرسال البريد بالفعل، يرجى الانتظار...' };
            }
            window.authLoading.isResettingPassword = true;

            try {
                const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + '/password-reset'
                });
                if (error) throw error;
                return { success: true, data, message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني!' };
            } catch (error) {
                let userFriendlyError = 'حدث خطأ أثناء إرسال رابط إعادة التعيين';
                if (error.message?.includes('User not found')) {
                    userFriendlyError = 'البريد الإلكتروني غير مسجل في النظام.';
                } else if (error.message?.includes('network')) {
                    userFriendlyError = 'خطأ في الاتصال. يرجى التحقق من اتصال الإنترنت.';
                }
                return { success: false, error: userFriendlyError, details: error };
            } finally {
                window.authLoading.isResettingPassword = false;
            }
        }

        /**
         * Get the current authenticated user from Supabase.
         */
        async function getCurrentUser() {
            try {
                const { data: { user }, error } = await supabaseClient.auth.getUser();
                if (error) throw error;
                return { success: true, user };
            } catch (error) {
                return { success: false, user: null, error };
            }
        }

        /**
         * Check if a user is currently authenticated.
         */
        async function isAuthenticated() {
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            return !error && session !== null;
        }

        /**
         * Update the user's Supabase auth metadata.
         */
        async function updateProfile(updates) {
            try {
                const { data, error } = await supabaseClient.auth.updateUser({ data: updates });
                if (error) throw error;
                return { success: true, data, message: 'تم تحديث الملف الشخصي بنجاح!' };
            } catch (error) {
                return { success: false, error: error.message || 'حدث خطأ أثناء تحديث الملف الشخصي', details: error };
            }
        }

        // --------------------------------------------------
        // Auth State Change Listener
        //
        // On protected pages the server has already populated
        // all user data server-side. Here we:
        //   1. Set window.appUserState from the pre-injected
        //      window.__SYNTA_PROFILE__ (no DB round-trip needed).
        //   2. Unhide the content wrapper so the page becomes
        //      visible. This is the single source of truth for
        //      when the page is revealed.
        //   3. On SIGNED_OUT, redirect to /login.
        // --------------------------------------------------
        supabaseClient.auth.onAuthStateChange((event, session) => {
            // Check if we have a real client session OR if the server pre-authenticated us via cookies
            const hasClientSession = session?.user;
            const hasServerSession = window.__SYNTA_PROFILE__ != null;
            
            if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && (hasClientSession || hasServerSession)) {

                if (!window.appUserState) {
                    if (hasServerSession) {
                        // Fast path: server already resolved the full profile
                        window.appUserState = {
                            ...(hasClientSession ? session.user : { id: window.__SYNTA_PROFILE__.id, email: window.__SYNTA_PROFILE__.email }),
                            ...window.__SYNTA_PROFILE__
                        };
                    } else {
                        // Fallback: client-only session
                        window.appUserState = { ...session.user };
                    }
                    document.dispatchEvent(new CustomEvent('appStateHydrated', { detail: window.appUserState }));
                }

                // Persist minimal user info to localStorage
                try {
                    localStorage.setItem('synta_user', JSON.stringify({
                        id:          window.appUserState.id,
                        email:       window.appUserState.email,
                        full_name:   window.appUserState.full_name || '',
                        user_class:  window.appUserState.user_class || '',
                        user_branch: window.appUserState.user_branch || ''
                    }));
                } catch (_) {}

                // Reveal the page content
                unhideContentWrapper();

            } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !hasClientSession && !hasServerSession)) {
                // If there's truly no session (client or server), enforce redirect on protected pages
                localStorage.removeItem('synta_user');
                window.appUserState = null;

                const protectedPrefixes = ['/dashboard', '/app/'];
                const currentPath = window.location.pathname;
                if (protectedPrefixes.some(p => currentPath.startsWith(p))) {
                    window.location.href = '/login';
                } else if (event === 'INITIAL_SESSION') {
                    // On public pages, just unhide if no session
                    unhideContentWrapper();
                }
            }
        });

        // Expose public API
        window.auth = {
            signUp,
            signIn,
            signOut,
            resetPassword,
            getCurrentUser,
            isAuthenticated,
            updateProfile,
            supabase: supabaseClient,
            isInitialized: () => authInitialized
        };

        // Notify other scripts that Supabase is ready
        document.dispatchEvent(new CustomEvent('supabaseReady'));
    }

})();
