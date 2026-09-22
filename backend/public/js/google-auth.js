// =====================================================
// GOOGLE SIGN-IN — Client-side handler (v2)
//
// Strategy: "renderButton overlay"
//  - google.accounts.id.renderButton() renders Google's official
//    button inside a transparent div positioned over our custom button.
//  - When the user clicks anywhere on our styled button, they actually
//    click Google's rendered button, which opens the proper centered
//    Google account-picker popup — NOT the One-Tap floating overlay.
//
// This gives the "official centered Google popup" UX the user expects,
// while keeping our custom button design pixel-perfect.
// =====================================================

(function () {
    'use strict';

    const GOOGLE_CLIENT_ID =
        '963391276270-li88ohh7vvvjivmoui64lo7mrip5cdal.apps.googleusercontent.com';

    let gisReady   = false;
    let renderDone = false;

    // ── Utility: delegate to the existing auth.js showMessage() ──────────────
    function showMsg(message, type) {
        if (typeof showMessage === 'function') {
            showMessage(message, type);
        } else {
            console[type === 'error' ? 'error' : 'log']('[google-auth]', message);
        }
    }

    // ── Button loading state ──────────────────────────────────────────────────
    function setLoading(isLoading) {
        const btn     = document.getElementById('googleSignInBtn');
        const text    = document.getElementById('googleBtnText');
        const spinner = document.getElementById('googleBtnSpinner');
        if (!btn) return;

        if (isLoading) {
            btn.disabled   = true;
            btn.style.opacity = '0.75';
            if (text)    text.style.display = 'none';
            if (spinner) spinner.style.display = 'inline-block';
        } else {
            btn.disabled   = false;
            btn.style.opacity = '1';
            if (text)    text.style.display = 'inline';
            if (spinner) spinner.style.display = 'none';
        }
    }

    // ── Send the ID token to our Express backend ──────────────────────────────
    async function sendCredentialToBackend(credential) {
        const res = await fetch('/api/auth/google', {
            method:      'POST',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({ credential }),
            credentials: 'include', // send/receive HttpOnly session cookies
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'فشل تسجيل الدخول بـ Google');
        }
        return data;
    }

    // ── GIS callback — called after user picks their Google account ───────────
    async function handleGoogleCredential(response) {
        // User closed the popup without choosing an account
        if (!response || !response.credential) {
            setLoading(false);
            return;
        }

        setLoading(true);

        try {
            const data = await sendCredentialToBackend(response.credential);

            if (data.needsOnboarding) {
                // New Google user: redirect to profile completion before dashboard
                showMsg('مرحباً! يرجى إكمال بياناتك للمتابعة.', 'success');
                setTimeout(() => { window.location.href = '/auth/complete-profile'; }, 1000);
            } else {
                showMsg('تم تسجيل الدخول بـ Google بنجاح!', 'success');
                setTimeout(() => { window.location.href = '/dashboard'; }, 1200);
            }
        } catch (err) {
            console.error('[google-auth] Backend error:', err);
            showMsg(err.message || 'حدث خطأ أثناء تسجيل الدخول بـ Google.', 'error');
            setLoading(false);
        }
    }

    // ── Render the transparent GIS button overlay ─────────────────────────────
    // google.accounts.id.renderButton() renders an official Google sign-in
    // button (with its own click handler that opens a proper popup window).
    // We size it to cover our custom button and make it invisible, so our
    // button looks custom while Google's popup logic fires on click.
    function renderGISOverlay() {
        if (renderDone) return;

        const overlay  = document.getElementById('__gis_overlay__');
        const outerBtn = document.getElementById('googleSignInBtn');

        if (!overlay || !outerBtn) return;
        if (!window.google || !window.google.accounts || !window.google.accounts.id) return;

        const btnWidth = outerBtn.offsetWidth || 400;

        window.google.accounts.id.renderButton(overlay, {
            type:  'standard',
            theme: 'outline',
            size:  'large',
            text:  'signin_with',
            width: btnWidth,
            // logo_alignment: 'left'
        });

        renderDone = true;
        console.log('[google-auth] GIS overlay button rendered (width:', btnWidth, ')');
    }

    // ── Initialize GIS ─────────────────────────────────────────────────────────
    function initGIS() {
        if (!window.google || !window.google.accounts || !window.google.accounts.id) return;

        // Cancel any One-Tap auto-prompt — we use renderButton instead
        window.google.accounts.id.cancel();

        window.google.accounts.id.initialize({
            client_id:          GOOGLE_CLIENT_ID,
            callback:           handleGoogleCredential,
            auto_select:        false,  // never silently sign in
            cancel_on_tap_outside: true,
            // itp_support: true,       // uncomment if targeting Safari ITP
        });

        gisReady = true;
        renderGISOverlay();
        console.log('[google-auth] GIS initialized');
    }

    // ── CSS for the overlay div ───────────────────────────────────────────────
    // Appended once to <head>
    function injectOverlayCSS() {
        if (document.getElementById('__gis_overlay_style__')) return;

        const style = document.createElement('style');
        style.id = '__gis_overlay_style__';
        style.textContent = `
            /* The button wrapper must be position:relative for the overlay to cover it */
            #googleSignInBtn {
                position: relative;
                overflow: visible !important;
            }

            /* Transparent overlay that GIS renders its button into */
            .gis-overlay {
                position: absolute;
                inset: 0;
                opacity: 0;
                pointer-events: all;
                z-index: 10;
                overflow: hidden;
                border-radius: inherit;
                /* stretch the inner GIS button to fill the overlay */
                display: flex;
                align-items: stretch;
            }

            /* Force the GIS-rendered div/iframe to fill the overlay */
            .gis-overlay > div,
            .gis-overlay iframe {
                width: 100% !important;
                height: 100% !important;
                min-width: unset !important;
                max-width: unset !important;
            }
        `;
        document.head.appendChild(style);
    }

    // ── Wait for GIS SDK to load (it's async defer) ───────────────────────────
    function waitForGIS(maxWaitMs = 8000) {
        const start = Date.now();
        const poll  = setInterval(() => {
            if (window.google && window.google.accounts && window.google.accounts.id) {
                clearInterval(poll);
                initGIS();
            } else if (Date.now() - start > maxWaitMs) {
                clearInterval(poll);
                console.error('[google-auth] GIS SDK did not load in', maxWaitMs, 'ms — hiding button.');
                const container = document.getElementById('google-signin-container');
                const divider   = container?.previousElementSibling;
                if (container) container.style.display = 'none';
                if (divider && divider.classList.contains('social-divider')) {
                    divider.style.display = 'none';
                }
            }
        }, 100);
    }

    // ── Re-render overlay after any dynamic resize ───────────────────────────
    // (e.g. on mobile where the button width changes after paint)
    function scheduleRerender() {
        // Run once after paint to catch the real rendered button width
        requestAnimationFrame(() => {
            renderDone = false;
            renderGISOverlay();
        });
    }

    // ── Entry point ───────────────────────────────────────────────────────────
    function setup() {
        injectOverlayCSS();

        // If GIS SDK already loaded before this script executed, init immediately
        if (window.google && window.google.accounts && window.google.accounts.id) {
            initGIS();
        } else {
            waitForGIS();
        }

        // Re-render the overlay after layout stabilises (correct button width)
        if (document.readyState === 'complete') {
            scheduleRerender();
        } else {
            window.addEventListener('load', scheduleRerender, { once: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }

})();
