/* Cross-page view transitions for the account pages (login, register, password reset…).
   auth-entry.css opts these pages in with `@view-transition { navigation: auto; }`. A transition
   needs both pages to opt in: when an account page navigates elsewhere (e.g. to the dashboard
   after signing in), the destination does not opt in and Chrome aborts the transition with an
   uncaught InvalidStateError. Skip the transition up front for those navigations, so animated
   navigation between account pages is unchanged and nothing is aborted. */
(() => {
    'use strict';
    // Same-origin pages that load auth-head.ejs (and therefore opt in to view transitions).
    const AUTH_PAGES = /^\/(login|register|password-reset|auth\/(verify-email|complete-profile))\/?$/;

    window.addEventListener('pageswap', event => {
        const transition = event.viewTransition;
        if (!transition) return;
        // Visual transitions may be aborted by navigation/browser state even
        // between opted-in pages; their readiness must never break navigation.
        transition.ready.catch(() => {});
        let destination = null;
        try {
            const url = event.activation?.entry?.url && new URL(event.activation.entry.url);
            if (url && url.origin === location.origin) destination = url.pathname;
        } catch { /* unknown destination: treat as a non-account page */ }
        if (destination && AUTH_PAGES.test(destination)) return;
        // Skipping is intentional here; its `ready` promise rejecting is the expected outcome.
        transition.ready.catch(() => {});
        transition.skipTransition();
    });
    window.addEventListener('pagereveal', event => {
        event.viewTransition?.ready.catch(() => {});
    });
})();
