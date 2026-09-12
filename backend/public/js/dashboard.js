// =====================================================
// DASHBOARD JAVASCRIPT
// Loads activity, progress, and events from the server
// API. User name and avatar are pre-populated server-side
// via EJS — this script only needs to enhance dynamic data.
// =====================================================

if (!window._dashboardEventsBound) {
    window._dashboardEventsBound = true;

    document.addEventListener('turbo:before-cache', function () {
        // Clear dynamic content so Turbo doesn't cache stale loading states
        const loaders = document.querySelectorAll(
            '#activity-list .loading, #progress-list .loading, #events-list .loading'
        );
        loaders.forEach(el => el.remove());
    });

    document.addEventListener('turbo:load', initDashboardLogicWrapper);
}

// --------------------------------------------------
// Boot: run when the page is ready (both Turbo and standard load)
// --------------------------------------------------
function initDashboardLogicWrapper() {
    if (!document.querySelector('.dashboard-container')) return;

    if (window.appUserState) {
        // State already hydrated (e.g. Turbo back-navigation) — enhance DOM and load data
        enhanceDashboardDOM(window.appUserState);
        initializeDashboardLogic();
    } else {
        // Wait for the appStateHydrated event fired by authentication.js
        document.addEventListener('appStateHydrated', function (e) {
            // Guard: only run on the dashboard page
            if (!document.querySelector('.dashboard-container')) return;
            enhanceDashboardDOM(e.detail || window.appUserState);
            initializeDashboardLogic();
        }, { once: true });
    }
};

initDashboardLogicWrapper();

// --------------------------------------------------
// DOM Enhancement
// The EJS template already pre-populates #user-name and #user-avatar
// server-side. This function is a lightweight client-side enhancement
// that updates the inline stats after the API call resolves.
// --------------------------------------------------
function enhanceDashboardDOM(userState) {
    if (!userState) return;

    // Update inline stats from userState if available
    const nameEl   = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');

    // Only override if the server rendered a blank value (edge case)
    if (nameEl && !nameEl.textContent.trim()) {
        nameEl.textContent = userState.full_name || userState.email?.split('@')[0] || 'Utilisateur';
    }
    if (avatarEl && avatarEl.textContent.trim() === 'U') {
        const name = userState.full_name || userState.email || 'U';
        avatarEl.textContent = name.charAt(0).toUpperCase();
    }
}

// --------------------------------------------------
// Dashboard Data Loading
// --------------------------------------------------
async function initializeDashboardLogic() {
    try {
        await Promise.all([
            loadUserStats(),
            loadActivities(),
            loadUpcomingEvents()
        ]);
    } catch (error) {
        console.error('[Dashboard] Error initializing dashboard:', error);
    }
}

/**
 * Fetches /api/user/stats and updates the inline stat counters.
 */
async function loadUserStats() {
    try {
        const response = await fetch('/api/user/stats', { credentials: 'same-origin' });
        if (!response.ok) return;

        const stats = await response.json();

        const completedEl = document.getElementById('completed-courses');
        const progressEl  = document.getElementById('overall-progress');
        const achievEl    = document.getElementById('achievements');

        if (completedEl) completedEl.textContent = stats.completedCourses ?? 0;
        if (progressEl)  progressEl.textContent  = `${stats.overallProgress ?? 0}%`;
        if (achievEl)    achievEl.textContent     = stats.achievements ?? 0;
    } catch (err) {
        // Non-fatal — stats remain at their default "0" values
        console.warn('[Dashboard] Could not load stats:', err.message);
    }
}

/**
 * Fetches /api/user/activity and renders the activity list.
 */
async function loadActivities() {
    const activityList = document.getElementById('activity-list');
    const progressList = document.getElementById('progress-list');

    try {
        const response = await fetch('/api/user/activity', { credentials: 'same-origin' });

        if (!response.ok) {
            if (activityList) activityList.innerHTML = '<div class="activity-item" style="padding:15px; color:#666;">Aucune activité récente</div>';
            if (progressList) progressList.innerHTML = '<div class="activity-item" style="padding:15px; color:#666;">Aucun progrès</div>';
            return;
        }

        const { activity } = await response.json();

        if (!activity || activity.length === 0) {
            if (activityList) activityList.innerHTML = '<div class="activity-item" style="padding:15px; color:#666;">Aucune activité récente</div>';
            if (progressList) progressList.innerHTML = '<div class="activity-item" style="padding:15px; color:#666;">Aucun progrès enregistré</div>';
            return;
        }

        // Render activity items
        if (activityList) {
            activityList.innerHTML = activity.map(item => `
                <div class="activity-item">
                    <span class="activity-icon">📘</span>
                    <div class="activity-info">
                        <div class="activity-title">${item.lessons?.title || 'Leçon'}</div>
                        <div class="activity-course">${item.lessons?.courses?.title || ''}</div>
                    </div>
                </div>
            `).join('');
        }

        // Render progress items (same data, different presentation)
        if (progressList) {
            progressList.innerHTML = activity.map(item => `
                <div class="activity-item">
                    <span class="activity-icon">✅</span>
                    <div class="activity-info">
                        <div class="activity-title">${item.lessons?.courses?.title || 'Cours'}</div>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.warn('[Dashboard] Could not load activity:', err.message);
        if (activityList) activityList.innerHTML = '<div class="activity-item" style="padding:15px; color:#666;">Aucune activité récente</div>';
        if (progressList) progressList.innerHTML = '<div class="activity-item" style="padding:15px; color:#666;">Aucun progrès</div>';
    }
}

/**
 * Fetches /api/events (server-filtered by user class/branch) and renders the events list.
 */
async function loadUpcomingEvents() {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;

    try {
        const response = await fetch('/api/events', { credentials: 'same-origin' });

        if (!response.ok) {
            eventsList.innerHTML = '<div class="event-item" style="padding:15px; color:#666;">Aucun événement à venir</div>';
            return;
        }

        const { events } = await response.json();

        if (!events || events.length === 0) {
            eventsList.innerHTML = '<div class="event-item" style="padding:15px; color:#666;">Aucun événement à venir</div>';
            return;
        }

        eventsList.innerHTML = events.slice(0, 5).map(event => `
            <div class="event-item" onclick="navigateToCalendar('${event.date}')">
                <div class="event-icon">${event.icon || '📅'}</div>
                <div class="event-info">
                    <div class="event-title">${event.title}</div>
                    <div class="event-time">${event.time || ''}</div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.warn('[Dashboard] Could not load events:', err.message);
        eventsList.innerHTML = '<div class="event-item" style="padding:15px; color:#666;">Aucun événement à venir</div>';
    }
}

window.navigateToCalendar = function (dateStr) {
    window.location.href = `/app/calendar?date=${dateStr}`;
};
