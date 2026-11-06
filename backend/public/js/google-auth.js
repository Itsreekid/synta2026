// =====================================================
// GOOGLE SIGN-IN — Client-side handler (v3)
//
// Uses Google's official renderButton over a custom-looking
// wrapper. On iPhone/iPad Safari, popup overlays often fail
// silently, so we switch those devices to redirect UX mode.
// =====================================================

(function () {
    'use strict';

    const GOOGLE_CLIENT_ID =
        '963391276270-li88ohh7vvvjivmoui64lo7mrip5cdal.apps.googleusercontent.com';
    const REDIRECT_CALLBACK = `${window.location.origin}/api/auth/google/callback`;

    let gisReady = false;
    let renderDone = false;
    let initStarted = false;

    function isAppleTouchDevice() {
        const ua = navigator.userAgent || '';
        if (/iPad|iPhone|iPod/.test(ua)) return true;
        // iPadOS desktop UA
        return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    }

    function showMsg(message, type) {
        if (typeof showMessage === 'function') {
            showMessage(message, type);
        } else {
            console[type === 'error' ? 'error' : 'log']('[google-auth]', message);
        }
    }

    function setLoading(isLoading) {
        const btn = document.getElementById('googleSignInBtn');
        const text = document.getElementById('googleBtnText');
        const spinner = document.getElementById('googleBtnSpinner');
        const overlay = document.getElementById('__gis_overlay__');
        if (!btn) return;

        btn.classList.toggle('is-loading', isLoading);
        btn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
        // Never disable the wrapper — that blocks Google's iframe taps on iOS.
        if (text) text.style.display = isLoading ? 'none' : 'inline';
        if (spinner) spinner.style.display = isLoading ? 'inline-block' : 'none';
        if (overlay) overlay.style.pointerEvents = isLoading ? 'none' : 'auto';
    }

    async function sendCredentialToBackend(credential) {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
            credentials: 'include',
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || 'فشل تسجيل الدخول بـ Google');
        }
        return data;
    }

    async function handleGoogleCredential(response) {
        if (!response || !response.credential) {
            setLoading(false);
            showMsg('تم إلغاء تسجيل الدخول بـ Google.', 'info');
            return;
        }

        setLoading(true);

        try {
            const data = await sendCredentialToBackend(response.credential);

            if (data.needsOnboarding) {
                showMsg('مرحباً! يرجى إكمال بياناتك للمتابعة.', 'success');
                setTimeout(() => { window.location.href = '/auth/complete-profile'; }, 800);
            } else {
                showMsg('تم تسجيل الدخول بـ Google بنجاح!', 'success');
                setTimeout(() => { window.location.href = '/dashboard'; }, 800);
            }
        } catch (err) {
            console.error('[google-auth] Backend error:', err);
            showMsg(err.message || 'حدث خطأ أثناء تسجيل الدخول بـ Google.', 'error');
            setLoading(false);
            // Allow another tap after failure
            renderDone = false;
            scheduleRerender();
        }
    }

    function renderGISOverlay() {
        const overlay = document.getElementById('__gis_overlay__');
        const outerBtn = document.getElementById('googleSignInBtn');

        if (!overlay || !outerBtn) return false;
        if (!window.google?.accounts?.id) return false;

        const btnWidth = Math.max(outerBtn.offsetWidth || 0, Math.floor(outerBtn.getBoundingClientRect().width) || 0);
        if (btnWidth < 40) return false;

        // Clear previous GIS markup before re-render (orientation / resize)
        overlay.innerHTML = '';

        window.google.accounts.id.renderButton(overlay, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: Math.min(btnWidth, 400),
        });

        renderDone = true;

        const spinner = document.getElementById('googleBtnSpinner');
        const text = document.getElementById('googleBtnText');
        if (spinner && text && !outerBtn.classList.contains('is-loading')) {
            spinner.style.display = 'none';
            text.style.opacity = '1';
        }

        return true;
    }

    function initGIS() {
        if (!window.google?.accounts?.id || initStarted) return;
        initStarted = true;

        try {
            window.google.accounts.id.cancel();
        } catch (_) {}

        const useRedirect = isAppleTouchDevice();
        const config = {
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredential,
            auto_select: false,
            cancel_on_tap_outside: true,
            itp_support: true,
            use_fedcm_for_prompt: false,
        };

        // iPhone/iPad: popup/iframe taps are unreliable — use full-page redirect.
        if (useRedirect) {
            config.ux_mode = 'redirect';
            config.login_uri = REDIRECT_CALLBACK;
        }

        window.google.accounts.id.initialize(config);
        gisReady = true;

        if (!renderGISOverlay()) {
            // Layout may not be ready yet (fonts / RTL).
            setTimeout(() => {
                renderDone = false;
                renderGISOverlay();
            }, 250);
        }

        console.log('[google-auth] GIS initialized', useRedirect ? '(redirect/iOS)' : '(popup)');
    }

    function injectOverlayCSS() {
        if (document.getElementById('__gis_overlay_style__')) return;

        const style = document.createElement('style');
        style.id = '__gis_overlay_style__';
        style.textContent = `
            #googleSignInBtn {
                position: relative !important;
                overflow: visible !important;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
                user-select: none;
            }
            #googleSignInBtn.is-loading {
                opacity: 0.75;
                cursor: wait;
            }
            /* Ripple must never steal taps from the Google iframe */
            .google-btn::after {
                pointer-events: none !important;
            }
            .gis-overlay {
                position: absolute !important;
                inset: 0 !important;
                /* iOS ignores taps on opacity:0 layers — keep a tiny opacity */
                opacity: 0.02 !important;
                z-index: 20 !important;
                overflow: hidden !important;
                border-radius: inherit !important;
                display: block !important;
                cursor: pointer !important;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
            }
            .gis-overlay > div,
            .gis-overlay > div > div,
            .gis-overlay iframe {
                position: absolute !important;
                inset: 0 !important;
                width: 100% !important;
                height: 100% !important;
                min-width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
                border: 0 !important;
            }
            .gis-overlay iframe {
                opacity: 0.02 !important;
            }
        `;
        document.head.appendChild(style);
    }

    function hideGoogleButton(reason) {
        console.error('[google-auth]', reason);
        const container = document.getElementById('google-signin-container');
        const divider = container?.previousElementSibling;
        if (container) {
            container.innerHTML = `<p class="google-register-note" style="color:#b91c1c;">تعذّر تحميل تسجيل Google. حدّث الصفحة أو جرّب شبكة أخرى.</p>`;
        }
        if (divider && divider.classList.contains('social-divider')) {
            divider.style.display = 'none';
        }
    }

    function waitForGIS(maxWaitMs = 10000) {
        const start = Date.now();
        const poll = setInterval(() => {
            if (window.google?.accounts?.id) {
                clearInterval(poll);
                initGIS();
            } else if (Date.now() - start > maxWaitMs) {
                clearInterval(poll);
                hideGoogleButton('GIS SDK did not load in time');
            }
        }, 100);
    }

    function scheduleRerender() {
        requestAnimationFrame(() => {
            if (!gisReady) return;
            renderDone = false;
            renderGISOverlay();
        });
    }

    function setup() {
        injectOverlayCSS();

        const outerBtn = document.getElementById('googleSignInBtn');
        const spinner = document.getElementById('googleBtnSpinner');
        const text = document.getElementById('googleBtnText');

        if (spinner && text) {
            spinner.style.display = 'inline-block';
            text.style.opacity = '0.7';
        }

        if (outerBtn) {
            // Keyboard activation for the wrapper (actual sign-in still via GIS iframe)
            outerBtn.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    const frame = document.querySelector('#__gis_overlay__ iframe, #__gis_overlay__ div[role="button"]');
                    frame?.click?.();
                }
            });
        }

        if (window.google?.accounts?.id) {
            initGIS();
        } else {
            waitForGIS();
        }

        if (document.readyState === 'complete') {
            scheduleRerender();
        } else {
            window.addEventListener('load', scheduleRerender, { once: true });
        }

        window.addEventListener('resize', () => {
            clearTimeout(window.__gisResizeTimer);
            window.__gisResizeTimer = setTimeout(scheduleRerender, 200);
        });
        window.addEventListener('orientationchange', () => {
            setTimeout(scheduleRerender, 350);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
