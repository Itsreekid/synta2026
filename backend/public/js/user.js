// =====================================================
// USER.JS — Global App Shell Script
// Runs on every protected page (included in all app layouts).
// Responsibilities:
//  - Load and display user balance in the header
//  - Handle notification badge + dropdown (events from API)
//  - Manage mobile menu and dropdown toggles
//  - Provide logout functionality
//  - Provide showMessage utility for all pages
//
// NOTE: Events are loaded exclusively from GET /api/events.
// The global `upcomingEvents` variable (from the removed
// static /data/events.js script tag) is no longer used.
// =====================================================

// ---- Module-level caches (survive Turbo navigations) ----
var _balanceCached    = typeof _balanceCached !== 'undefined' ? _balanceCached : null;
var _balanceLastFetch = typeof _balanceLastFetch !== 'undefined' ? _balanceLastFetch : 0;
var BALANCE_TTL_MS    = 60000; // re-fetch only after 60s

var _eventsCached     = typeof _eventsCached !== 'undefined' ? _eventsCached : null;
var _eventsLastFetch  = typeof _eventsLastFetch !== 'undefined' ? _eventsLastFetch : 0;
var EVENTS_TTL_MS     = 60000; // re-fetch only after 60s
// ---------------------------------------------------------

if (!window._userEventsBound) {
    window._userEventsBound = true;

    /**
     * Seed _balanceCached from the DOM as a UI FALLBACK only.
     * NEVER sets _balanceLastFetch — the API must still run on first load.
     * On Turbo navigations (header is permanent), the DOM value is already
     * the API-fetched value, so this just pre-fills the cache correctly.
     */
    function seedCacheFromDOM() {
        if (_balanceCached !== null) return; // already seeded by a real API call

        // Try DOM first (fast, synchronous)
        const balEl = document.getElementById('userBalance');
        if (balEl) {
            const rendered = parseFloat(balEl.textContent.trim());
            // Only use if it's a positive value — 0 may mean server failed to load profile
            if (!isNaN(rendered) && rendered > 0) {
                _balanceCached = rendered;
                // Note: _balanceLastFetch stays 0 → API will still be called once
            }
        }
    }


    function initUserLogic() {
        // Seed cache FIRST so loadUserBalance() finds a valid cache and skips the fetch
        seedCacheFromDOM();

        // Since header is data-turbo-permanent, the balance is already correct.
        // loadUserBalance will be a no-op (cache hit) on every Turbo navigation.
        loadUserBalance();

        // Same for notifications — will be a cache hit after the first load
        updateNotificationBadge();
    }

    document.addEventListener('turbo:load', initUserLogic);
    // Fallback for initial load if turbo doesn't catch it
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initUserLogic();
    } else {
        document.addEventListener('DOMContentLoaded', initUserLogic);
    }


    // Close mobile menu / dropdowns when clicking outside
    document.addEventListener('click', function (event) {
        const sidebar           = document.getElementById('app-sidebar');
        const menuToggle        = document.querySelector('.mobile-menu-toggle');
        const profileDropdown   = document.getElementById('profileDropdown');
        const profilePicture    = document.querySelector('.profile-picture');
        const notificationDropdown = document.getElementById('notificationDropdown');
        const notificationIcon  = document.querySelector('.notification-icon');

        if (sidebar && menuToggle &&
            !sidebar.contains(event.target) &&
            !menuToggle.contains(event.target) &&
            sidebar.classList.contains('active')) {
            closeMobileMenu();
        }

        if (profileDropdown && profilePicture &&
            !profileDropdown.contains(event.target) &&
            !profilePicture.contains(event.target) &&
            profileDropdown.classList.contains('active')) {
            profileDropdown.classList.remove('active');
        }

        if (notificationDropdown && notificationIcon &&
            !notificationDropdown.contains(event.target) &&
            !notificationIcon.contains(event.target) &&
            notificationDropdown.classList.contains('active')) {
            notificationDropdown.classList.remove('active');
        }
    });
}

// --------------------------------------------------
// Balance — smart cached fetch (no flicker on Turbo navigation)
// --------------------------------------------------

/**
 * Updates the balance display ONLY if the value has changed.
 * Prevents the DOM flicker caused by overwriting with the same value.
 */
function setBalanceDisplay(value) {
    const el = document.getElementById('userBalance');
    if (!el) return;
    const formatted = (parseFloat(value) || 0).toFixed(2);
    if (el.textContent.trim() !== formatted) {
        el.textContent = formatted;
    }
}

/**
 * Fetches balance from the API.
 * - First call (_balanceLastFetch === 0): ALWAYS hits the API to get the real value
 * - Subsequent calls within 60s: skips API (header is permanent, value already shown)
 * - After 60s: re-fetches to stay up-to-date
 */
async function loadUserBalance() {
    const now = Date.now();
    // Only skip if we've had a REAL API response recently (not just a DOM seed)
    if (_balanceLastFetch > 0 && (now - _balanceLastFetch) < BALANCE_TTL_MS) {
        // Header is data-turbo-permanent — value is already visible, nothing to do
        return;
    }
    try {
        const response = await fetch('/api/user/balance', { credentials: 'same-origin' });
        if (!response.ok) return;
        const { balance } = await response.json();
        _balanceCached    = balance;
        _balanceLastFetch = Date.now();
        setBalanceDisplay(balance);
    } catch (err) {
        // Non-fatal — the server-rendered value from EJS remains visible
        console.warn('[User] Could not refresh balance:', err.message);
    }
}

/**
 * Call this after a purchase to immediately update the cached balance
 * and the header display without a round-trip.
 */
function refreshBalanceNow(newValue) {
    _balanceCached    = newValue;
    _balanceLastFetch = Date.now();
    setBalanceDisplay(newValue);
}
window.refreshBalanceNow = refreshBalanceNow;


// Cache for events is declared at the top of the file

/**
 * Fetches events from the server API, with a 60s in-memory cache.
 */
async function fetchEventsFromApi() {
    const now = Date.now();
    if (_eventsCached !== null && (now - _eventsLastFetch) < EVENTS_TTL_MS) {
        return _eventsCached;
    }
    try {
        const response = await fetch('/api/events', { credentials: 'same-origin' });
        if (!response.ok) return _eventsCached || [];
        const { events } = await response.json();
        _eventsCached    = Array.isArray(events) ? events : [];
        _eventsLastFetch = Date.now();
        return _eventsCached;
    } catch (err) {
        console.warn('[User] Could not fetch events:', err.message);
        return _eventsCached || [];
    }
}

/**
 * Updates the notification badge count.
 * Uses cached events — no network request if called within 60s.
 */
async function updateNotificationBadge() {
    const badge = document.getElementById('notificationCount');
    if (!badge) return;
    const events = await fetchEventsFromApi();
    badge.textContent = events.length;
    badge.style.display = events.length > 0 ? 'flex' : 'none';
}


// --------------------------------------------------
// Dropdowns
// --------------------------------------------------

function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.toggle('active');
}

function toggleNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    if (!dropdown) return;

    dropdown.classList.toggle('active');
    if (dropdown.classList.contains('active')) {
        loadNotificationEvents();
    }
}

/**
 * Loads events into the notification dropdown.
 */
async function loadNotificationEvents() {
    const eventsList = document.getElementById('notificationEventsList');
    if (!eventsList) return;

    const events = await fetchEventsFromApi();

    if (events.length === 0) {
        eventsList.innerHTML = '<div class="no-events">Aucun événement à venir</div>';
        return;
    }

    eventsList.innerHTML = events.map(event => `
        <div class="notification-event-item">
            <div class="event-icon">${event.icon || '📅'}</div>
            <div class="event-info">
                <div class="event-title">${event.title}</div>
                <div class="event-time">${event.time || ''}</div>
            </div>
        </div>
    `).join('');
}

// --------------------------------------------------
// Mobile Menu
// --------------------------------------------------

function toggleMobileMenu() {
    const sidebar    = document.getElementById('app-sidebar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const overlay    = document.getElementById('sidebar-overlay');
    if (sidebar)    sidebar.classList.toggle('active');
    if (menuToggle) menuToggle.classList.toggle('active');
    if (overlay)    overlay.classList.toggle('active');
}

function closeMobileMenu() {
    const sidebar    = document.getElementById('app-sidebar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const overlay    = document.getElementById('sidebar-overlay');
    if (sidebar)    sidebar.classList.remove('active');
    if (menuToggle) menuToggle.classList.remove('active');
    if (overlay)    overlay.classList.remove('active');
}

// --------------------------------------------------
// Logout
// --------------------------------------------------

/**
 * Clears the server-side HttpOnly cookie, signs out of Supabase
 * client-side, then redirects to /login.
 */
async function logout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
        });
    } catch (err) {
        console.warn('[User] Could not reach logout endpoint:', err.message);
    }

    try {
        if (window.auth) {
            await window.auth.signOut();
        } else if (window.supabaseClient) {
            await window.supabaseClient.auth.signOut();
        }
    } catch (err) {
        console.warn('[User] Supabase signOut error:', err.message);
    }

    window.location.href = '/login';
}

// --------------------------------------------------
// Show Message — Global Utility
// Used by profile.js, dashboard.js, and other page scripts.
// --------------------------------------------------

/**
 * Displays a floating toast notification.
 * @param {string} message - The message text
 * @param {'info'|'success'|'error'} type - Message type
 */
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');

    let background;
    if (type === 'error')   background = '#dc3545';
    else if (type === 'success') background = '#28a745';
    else                    background = '#ff7b1a';

    messageDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        padding: 1rem 2rem; border-radius: 10px;
        color: white; background: ${background};
        font-family: 'Tajawal', sans-serif; font-weight: 500;
        z-index: 10000; animation: slideIn 0.3s ease;
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => { if (messageDiv.parentNode) messageDiv.remove(); }, 3000);
}

// --------------------------------------------------
// Inline styles for animations
// --------------------------------------------------
(() => {
    const customStyle = document.createElement('style');
    customStyle.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes pulseLive {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.6; transform: scale(1.1); }
        }
        .live-indicator {
            display: inline-block; width: 8px; height: 8px;
            background: #ff0000; border-radius: 50%;
            animation: pulseLive 1.5s ease-in-out infinite;
            box-shadow: 0 0 8px rgba(255,0,0,0.6);
            flex-shrink: 0;
        }
        .main-section {
            flex: 1; overflow-y: auto; padding: 0;
        }
    `;
    document.head.appendChild(customStyle);
})();

// --------------------------------------------------
// Global exports (called from inline onclick handlers in EJS)
// --------------------------------------------------
window.logout                 = logout;
window.toggleMobileMenu       = toggleMobileMenu;
window.toggleProfileDropdown  = toggleProfileDropdown;
window.toggleNotifications    = toggleNotifications;
window.showMessage            = showMessage;
