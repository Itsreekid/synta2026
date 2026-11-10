document.addEventListener('DOMContentLoaded', function() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('header nav');
    const panel = document.querySelector('.header-menu');
    const authButtons = document.querySelector('.auth-buttons');
    const body = document.body;

    // Only run on pages that have the mobile menu (landing pages, not app pages).
    if (!menuBtn || !nav) return;

    const mobile = window.matchMedia('(max-width: 1020px)');
    let open = false;
    let savedScroll = 0;

    function syncNavigation() {
        if (panel) panel.inert = mobile.matches && !open;
        nav.inert = mobile.matches && !open;
        if (authButtons) authButtons.inert = mobile.matches && !open;
        menuBtn.setAttribute('aria-expanded', String(open));
    }

    function setMenuOpen(next, restoreFocus = false) {
        if (next === open) return;
        if (next) {
            savedScroll = window.scrollY;
            body.style.top = -savedScroll + 'px';
        }
        open = next;
        menuBtn.classList.toggle('open', open);
        if (panel) panel.classList.toggle('active', open);
        nav.classList.toggle('active', open);
        if (authButtons) authButtons.classList.toggle('active', open);
        body.classList.toggle('menu-open', open);
        syncNavigation();

        if (open) nav.querySelector('a')?.focus();
        else {
            body.style.top = '';
            window.scrollTo({ top: savedScroll, behavior: 'instant' });
            if (restoreFocus) menuBtn.focus();
        }
    }

    menuBtn.addEventListener('click', () => {
        if (mobile.matches) setMenuOpen(!open);
    });

    // Close menu when choosing either navigation or account links.
    document.querySelectorAll('header nav a, header .auth-buttons a').forEach(link => {
        link.addEventListener('click', () => setMenuOpen(false));
    });

    document.addEventListener('keydown', event => {
        if (!open || !mobile.matches) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            setMenuOpen(false, true);
            return;
        }
        if (event.key !== 'Tab') return;
        const items = [
            menuBtn,
            ...nav.querySelectorAll('a[href]'),
            ...(authButtons ? authButtons.querySelectorAll('a[href]') : []),
        ].filter(item => item.getClientRects().length);
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
            event.preventDefault();
            first?.focus();
        }
    });

    mobile.addEventListener('change', () => {
        if (!mobile.matches) setMenuOpen(false);
        syncNavigation();
    });
    window.addEventListener('pageshow', () => {
        // Clear a persisted overlay when returning with the browser's Back button.
        setMenuOpen(false);
        syncNavigation();
    });
    syncNavigation();
});
