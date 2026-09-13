document.addEventListener('DOMContentLoaded', function() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('nav');
    const authButtons = document.querySelector('.auth-buttons');
    const body = document.body;

    // Only run on pages that have the mobile menu (landing pages, not app pages)
    if (!menuBtn || !nav) return;

    menuBtn.addEventListener('click', function() {
        this.classList.toggle('open');
        nav.classList.toggle('active');
        if (authButtons) authButtons.classList.toggle('active');
        body.classList.toggle('menu-open');

        // Smooth scroll to top when opening
        if (nav.classList.contains('active')) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // Close menu when clicking links
    document.querySelectorAll('nav a').forEach(link => {
        link.addEventListener('click', () => {
            menuBtn.classList.remove('open');
            nav.classList.remove('active');
            if (authButtons) authButtons.classList.remove('active');
            body.classList.remove('menu-open');
        });
    });
});
