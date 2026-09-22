// =====================================================
// GOOGLE SIGN-IN — Client-side handler
// Uses Google Identity Services (GIS) One-Tap / popup flow.
//
// This file is loaded AFTER auth.js on /login and /register pages.
// It wires up the "Sign in with Google" button, triggers the GIS
// prompt, receives the credential (ID token), and POSTs it to the
// backend endpoint /api/auth/google to get session cookies set.
// =====================================================

(function () {
    'use strict';

    // ---- Configuration -------------------------------------------------------
    // The Google OAuth Client ID is embedded at build-time via a meta tag or
    // inline window variable. For this plain-HTML setup we hard-code it here.
    const GOOGLE_CLIENT_ID =
        '963391276270-li88ohh7vvvjivmoui64lo7mrip5cdal.apps.googleusercontent.com';

    // ---- State ---------------------------------------------------------------
    let gisReady = false;       // true once google.accounts.id is fully loaded
    let tokenClient = null;     // The initialized GIS client

    // ---- Utility: show a message using the existing auth page helper ----------
    function showMsg(message, type) {
        if (typeof showMessage === 'function') {
            showMessage(message, type);
        } else {
            // Fallback: simple alert so errors are never silent
            console.error('[google-auth]', type, message);
            if (type === 'error') alert(message);
        }
    }

    // ---- Button loading state ------------------------------------------------
    function setLoading(isLoading) {
        const btn     = document.getElementById('googleSignInBtn');
        const text    = document.getElementById('googleBtnText');
        const spinner = document.getElementById('googleBtnSpinner');

        if (!btn) return;

        if (isLoading) {
            btn.disabled = true;
            btn.style.opacity = '0.75';
            if (text)    text.style.display = 'none';
            if (spinner) spinner.style.display = 'inline-block';
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            if (text)    text.style.display = 'inline';
            if (spinner) spinner.style.display = 'none';
        }
    }

    // ---- Send the ID token to our backend ------------------------------------
    async function sendCredentialToBackend(credential) {
        const res = await fetch('/api/auth/google', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ credential }),
            credentials: 'include', // send/receive HttpOnly cookies
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'فشل تسجيل الدخول بـ Google');
        }

        return data;
    }

    // ---- GIS callback — called with the credential response ------------------
    async function handleGoogleCredential(response) {
        const { credential } = response;

        if (!credential) {
            showMsg('لم يتم استلام بيانات Google. يرجى المحاولة مرة أخرى.', 'error');
            return;
        }

        setLoading(true);

        try {
            const data = await sendCredentialToBackend(credential);

            showMsg('تم تسجيل الدخول بـ Google بنجاح!', 'success');

            // Redirect to dashboard after a brief visual confirmation
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1200);
        } catch (err) {
            console.error('[google-auth] Backend error:', err);
            showMsg(err.message || 'حدث خطأ أثناء تسجيل الدخول بـ Google.', 'error');
        } finally {
            setLoading(false);
        }
    }

    // ---- Initialize GIS ------------------------------------------------------
    function initGIS() {
        if (!window.google || !window.google.accounts || !window.google.accounts.id) {
            console.warn('[google-auth] GIS SDK not yet available');
            return;
        }

        window.google.accounts.id.initialize({
            client_id:         GOOGLE_CLIENT_ID,
            callback:          handleGoogleCredential,
            auto_select:       false,   // Don't silently sign in
            cancel_on_tap_outside: true,
        });

        gisReady = true;
        console.log('[google-auth] GIS initialized');
    }

    // ---- Trigger Google One-Tap / popup on button click ----------------------
    function triggerGoogleSignIn() {
        if (!gisReady) {
            // GIS might still be loading (async defer); try once more
            initGIS();
            if (!gisReady) {
                showMsg('جاري تحميل نظام تسجيل الدخول بـ Google. يرجى الانتظار لحظة والمحاولة مرة أخرى.', 'error');
                return;
            }
        }

        // google.accounts.id.prompt() shows the One-Tap UI.
        // If it's suppressed (e.g., ITP / user dismissed), we fall back
        // to rendering a hidden GIS button and clicking it programmatically.
        window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                console.warn('[google-auth] One-Tap not displayed, reason:', notification.getNotDisplayedReason?.() || notification.getSkippedReason?.());

                // Fallback: render a GIS button in a hidden container and click it
                const hiddenContainer = document.getElementById('__gis_hidden_btn__');
                if (hiddenContainer) {
                    window.google.accounts.id.renderButton(hiddenContainer, {
                        type:  'standard',
                        theme: 'outline',
                        size:  'large',
                    });

                    // Programmatically click the rendered iframe button
                    const iframe = hiddenContainer.querySelector('iframe');
                    if (iframe) {
                        iframe.click();
                    } else {
                        // Last resort: re-show prompt after a tick
                        setTimeout(() => window.google.accounts.id.prompt(), 200);
                    }
                }
            }
        });
    }

    // ---- Error handler: when popup is closed by user -------------------------
    // GIS fires the callback with no credential if the user closes the popup.
    // We already handle this gracefully in handleGoogleCredential (early return).

    // ---- DOM setup -----------------------------------------------------------
    function setup() {
        // Attach click handler to our custom button
        const googleBtn = document.getElementById('googleSignInBtn');
        if (googleBtn) {
            googleBtn.addEventListener('click', function (e) {
                e.preventDefault();
                triggerGoogleSignIn();
            });
        }

        // Hidden container for fallback GIS rendered button
        if (!document.getElementById('__gis_hidden_btn__')) {
            const hidden = document.createElement('div');
            hidden.id = '__gis_hidden_btn__';
            hidden.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
            document.body.appendChild(hidden);
        }

        // Attempt to initialize GIS now (in case the SDK loaded before this script)
        initGIS();
    }

    // ---- Wait for GIS SDK to load (it's loaded with async defer) -------------
    // google.accounts.id is set when the GIS script fires. We poll politely.
    function waitForGIS(maxWaitMs = 8000) {
        const start = Date.now();
        const poll  = setInterval(() => {
            if (window.google && window.google.accounts && window.google.accounts.id) {
                clearInterval(poll);
                initGIS();
            } else if (Date.now() - start > maxWaitMs) {
                clearInterval(poll);
                console.error('[google-auth] GIS SDK failed to load within', maxWaitMs, 'ms');
                // Hide the Google button gracefully so users can still use email login
                const container = document.getElementById('google-signin-container');
                if (container) {
                    container.style.display = 'none';
                    console.warn('[google-auth] Google sign-in button hidden due to SDK load failure');
                }
            }
        }, 100);
    }

    // ---- Entry point ---------------------------------------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setup();
            waitForGIS();
        });
    } else {
        setup();
        waitForGIS();
    }
})();
