// Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function () {
    initializeDashboard();
});

async function fetchDashboardData(url, callback, errorCallback) {
    try {
        const response = await fetch(url, {
            credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        callback(await response.json());
    } catch (error) {
        errorCallback?.(error.message);
    }
}

window.addEventListener('pageshow', event => {
    if (event.persisted) initializeDashboard();
});

function initializeDashboard() {
    try {
        // Load dashboard data immediately in parallel without blocking
        loadUserData();
        loadStats();
        loadEvents();
        loadReplays();
        loadCoursePath();
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showMessage('Une erreur est survenue lors du chargement des données', 'error');
    }
}

function loadUserData() {
    fetchDashboardData('/api/user/me', (data) => {
        const user = data.user;
        if (!user) return;

        const userName = user.user_metadata?.full_name || user.name || user.email?.split('@')[0] || 'Utilisateur';
        const userEmail = user.email || 'Non disponible';

        const userNameEl = document.getElementById('user-name');
        if (userNameEl) userNameEl.textContent = userName;

        const userEmailEl = document.getElementById('user-email');
        if (userEmailEl) userEmailEl.textContent = userEmail;

        const avatar = document.getElementById('user-avatar');
        if (avatar && userName) avatar.textContent = userName.charAt(0).toUpperCase();

        const classNames = { '1ere':'1ère', '2eme':'2ème', '3eme':'3ème', bac:'Bac' };
        const branchNames = { informatique:'Informatique', sciences:'Sciences', mathematiques:'Mathématiques', technique:'Technique', lettres:'Lettres', economie:'Économie' };
        const academicLabel = [classNames[user.user_metadata?.user_class], branchNames[user.user_metadata?.user_branch]].filter(Boolean).join(' · ');
        const subtitle = document.querySelector('.greeting-subtitle span');
        if (subtitle && academicLabel) subtitle.textContent = `Ton parcours : ${academicLabel} · Chaque petit pas compte ! 💪`;
    });
}

function loadStats() {
    fetchDashboardData('/api/user/stats', (stats) => {
        const completedEl = document.getElementById('completed-courses');
        if (completedEl) completedEl.textContent = stats.totalCompletedLessons || 0;

        const progressEl = document.getElementById('overall-progress');
        if (progressEl) progressEl.textContent = stats.overallProgress + '%';

        const achievementsEl = document.getElementById('achievements');
        if (achievementsEl) achievementsEl.textContent = stats.achievements;

        const xp = (stats.totalCompletedLessons || 0) * 10;
        const level = Math.floor(xp / 100) + 1;
        const currentLevelXp = xp % 100;
        
        const levelIcon = document.querySelector('.level-icon');
        const levelStrong = document.querySelector('.level-info strong');
        const levelXpLabel = document.querySelector('.level-xp');
        const levelProgressBar = document.querySelector('.level-progress-wrapper .progress-bar-fill');
        
        if (levelIcon) levelIcon.textContent = level;
        if (levelStrong) levelStrong.textContent = `Niveau ${level}`;
        if (levelXpLabel) levelXpLabel.textContent = `${currentLevelXp} / 100 XP`;
        if (levelProgressBar) levelProgressBar.style.width = `${(currentLevelXp / 100) * 100}%`;
    });
}

function escapeDashboardHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
    ));
}

function courseActivityDate(course) {
    const raw = course?.last_accessed || course?.last_lesson_activity || null;
    const time = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(time) ? time : 0;
}

function pickActiveCourse(courses) {
    if (!Array.isArray(courses) || courses.length === 0) return null;

    const started = courses.filter(course =>
        courseActivityDate(course) > 0 || (Number(course.progress) || 0) > 0 || (Number(course.completed_lessons) || 0) > 0
    );

    const pool = started.length ? started : courses;
    return [...pool].sort((a, b) => {
        const activityDiff = courseActivityDate(b) - courseActivityDate(a);
        if (activityDiff) return activityDiff;

        const progressA = Number(a.progress) || 0;
        const progressB = Number(b.progress) || 0;
        const aIncomplete = progressA < 100 ? 1 : 0;
        const bIncomplete = progressB < 100 ? 1 : 0;
        if (bIncomplete !== aIncomplete) return bIncomplete - aIncomplete;
        if (progressB !== progressA) return progressB - progressA;

        return Date.parse(b.enrolled_at || 0) - Date.parse(a.enrolled_at || 0);
    })[0];
}

function courseIconFor(course) {
    const emojiMap = { informatique: '💻', algorithmique: '🧭', python: '🐍', math: '📐', programmation: '💻' };
    const haystack = `${course?.category || ''} ${course?.title || ''}`.toLowerCase();
    for (const key in emojiMap) {
        if (haystack.includes(key)) return emojiMap[key];
    }
    return '📚';
}

function renderLockedContinueState(continueSection) {
    const dashboardContainer = document.querySelector('.dashboard-container');
    if (dashboardContainer) dashboardContainer.classList.add('locked-mode');

    continueSection.innerHTML = `
        <div class="locked-state" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:1.5rem;background:#fff7ed;padding:2rem;border-radius:var(--radius-lg);border:2px dashed #fdba74;flex:1;min-height:190px;">
            <div style="width:80px;height:80px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:var(--orange-primary);box-shadow:0 4px 15px rgba(249,115,22,.15);">🔒</div>
            <div>
                <h4 style="margin:0 0 .5rem;color:#1e293b;font-size:1.3rem;font-weight:800;">Aucune formation pour le moment</h4>
                <p style="margin:0;color:var(--text-muted);font-size:1rem;max-width:300px;">Choisis une offre pour débloquer tes cours. Rien n’apparaît ici tant que tu n’as pas commencé.</p>
            </div>
            <a class="btn-primary dashboard-course-link" href="/app/offers" style="padding:.75rem 1.5rem;font-size:1rem;">Découvrir les offres &rarr;</a>
        </div>
    `;
}

function renderContinueCourseCard(course, { featured = false } = {}) {
    const progress = Math.round(Math.max(0, Math.min(100, Number(course.progress) || 0)));
    const started = courseActivityDate(course) > 0 || progress > 0 || (Number(course.completed_lessons) || 0) > 0;
    const cta = started ? (progress >= 100 ? 'Revoir la formation' : 'Continuer') : 'Commencer';
    const category = String(course.category || 'Formation');

    return `<article class="continue-course-card${featured ? ' is-featured' : ''}">
        <div class="course-logo">${courseIconFor(course)}</div>
        <div class="course-details">
            <h4>${escapeDashboardHtml(course.title || 'Formation')}</h4>
            <p>${escapeDashboardHtml(category)}${started ? '' : ' · Pas encore commencé'}</p>
            <div class="course-progress-container">
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${progress}%"></div></div>
                <span class="course-progress-text">${progress}%</span>
            </div>
        </div>
        <a class="btn-primary dashboard-course-link" href="/app/course-details?id=${encodeURIComponent(course.course_id)}">${cta} &rarr;</a>
    </article>`;
}

function renderPathEmpty(pathSection, title, message) {
    if (!pathSection) return;
    pathSection.style.display = '';
    const titleEl = pathSection.querySelector('.path-title');
    const progressEl = pathSection.querySelector('.path-progress-text');
    const track = pathSection.querySelector('.stepper-track');
    if (titleEl) titleEl.textContent = title || '';
    if (progressEl) progressEl.textContent = '';
    if (track) {
        track.innerHTML = `<div class="path-empty-state">${escapeDashboardHtml(message)}</div>`;
    }
}

function renderPathStepper(pathSection, activeCourse, modules, completedIds) {
    const progress = Number(activeCourse.progress) || 0;
    pathSection.style.display = '';
    pathSection.querySelector('.path-title').textContent = activeCourse.title || 'Ton parcours';
    pathSection.querySelector('.path-progress-text').textContent = `${progress}% complété`;

    const stepperTrack = pathSection.querySelector('.stepper-track');
    if (!modules.length) {
        stepperTrack.innerHTML = `<div class="path-empty-state">Les chapitres de cette formation apparaîtront ici dès qu’ils seront publiés.</div>`;
        return;
    }

    const completed = new Set(completedIds);
    const statuses = modules.map(module => {
        const lessons = (module.lessons || []).filter(lesson => lesson.type !== 'quiz');
        return lessons.length > 0 && lessons.every(lesson => completed.has(lesson.id));
    });
    const current = completedIds ? statuses.indexOf(false) : -1;
    let html = '';

    modules.forEach((mod, index) => {
        let statusClass = '';
        let iconHtml = index + 1;
        if (statuses[index]) {
            statusClass = 'completed';
            iconHtml = '✓';
        } else if (index === current) {
            statusClass = 'current';
            iconHtml = '📍';
        }

        const name = mod.title || `Chapitre ${index + 1}`;

        html += `
            <div class="step ${statusClass}" ${index === current ? 'aria-current="step"' : ''}>
                <div class="step-circle">${iconHtml}</div>
                <span dir="auto">${escapeDashboardHtml(name)}</span>
            </div>
        `;
    });

    stepperTrack.innerHTML = html;
}

let dashboardPathRequest = 0;
function loadCoursePath() {
    const request = ++dashboardPathRequest;
    fetchDashboardData('/api/courses/user/my-courses', (payload) => {
        if (request !== dashboardPathRequest) return;
        const courses = (Array.isArray(payload) ? payload : [])
            .filter(course => course && course.is_published !== false && course.course_id);

        const continueSection = document.getElementById('continue-content-container');
        const pathSection = document.getElementById('path-section');
        const dashboardContainer = document.querySelector('.dashboard-container');
        const levelSpan = document.querySelector('.level-info span');

        if (courses.length === 0) {
            if (levelSpan) levelSpan.textContent = 'Débutant';
            if (continueSection) renderLockedContinueState(continueSection);
            if (pathSection) pathSection.style.display = 'none';
            return;
        }

        if (dashboardContainer) dashboardContainer.classList.remove('locked-mode');

        const activeCourse = pickActiveCourse(courses);
        if (!activeCourse?.course_id) {
            if (levelSpan) levelSpan.textContent = 'Débutant';
            if (continueSection) renderLockedContinueState(continueSection);
            if (pathSection) pathSection.style.display = 'none';
            return;
        }

        if (levelSpan) levelSpan.textContent = activeCourse.title || 'Apprenti';

        const otherCourses = courses.filter(course => String(course.course_id) !== String(activeCourse.course_id));
        if (continueSection) {
            continueSection.innerHTML = `
                <div class="continue-course-grid">
                    ${renderContinueCourseCard(activeCourse, { featured: true })}
                    ${otherCourses.map(course => renderContinueCourseCard(course)).join('')}
                </div>
            `;
        }

        if (pathSection) {
            pathSection.style.display = '';
            const track = pathSection.querySelector('.stepper-track');
            if (track) track.innerHTML = '<div class="loading-state">Chargement du parcours…</div>';
        }

        const courseId = encodeURIComponent(activeCourse.course_id);
        fetchDashboardData(
            `/api/courses/${courseId}`,
            (courseDetails) => {
                if (!pathSection || request !== dashboardPathRequest) return;
                const modules = courseDetails?.modules || [];
                renderPathStepper(pathSection, activeCourse, modules, null);
                fetchDashboardData(`/api/tracking/course-progress/${courseId}`, progress => {
                    if (request === dashboardPathRequest && Array.isArray(progress.completedIds)) {
                        renderPathStepper(pathSection, activeCourse, modules, progress.completedIds);
                    }
                });
            },
            () => {
                if (!pathSection || request !== dashboardPathRequest) return;
                pathSection.style.display = '';
                const titleEl = pathSection.querySelector('.path-title');
                const progressEl = pathSection.querySelector('.path-progress-text');
                const track = pathSection.querySelector('.stepper-track');
                if (titleEl) titleEl.textContent = activeCourse.title || 'Ton parcours';
                if (progressEl) progressEl.textContent = '';
                if (track) {
                    track.innerHTML = '<div class="path-empty-state path-empty-state-error">Erreur de chargement. <button type="button" onclick="loadCoursePath()">Réessayer</button></div>';
                }
            }
        );
    }, (err) => {
        if (request !== dashboardPathRequest) return;
        const continueSection = document.getElementById('continue-content-container');
        if (continueSection) {
            continueSection.innerHTML = `
                <div style="padding:1rem;text-align:center;color:#ef4444;background:#fef2f2;border-radius:12px;width:100%;">
                    <p style="margin-bottom:.5rem;font-weight:600;">Erreur de chargement: ${escapeDashboardHtml(err)}</p>
                    <button class="btn-primary" style="padding:.4rem .8rem;font-size:.8rem;background:#ef4444;" onclick="loadCoursePath()">Réessayer</button>
                </div>
            `;
        }
    });
}

function loadReplays() {
    const list = document.getElementById('replay-list');
    if (!list) return;
    fetchDashboardData('/api/live/replays', replays => {
        if (!Array.isArray(replays) || !replays.length) {
            list.innerHTML = '<div class="event-item">Les enregistrements publiés par ton enseignant apparaîtront ici.</div>';
            return;
        }
        list.innerHTML = replays.slice(0, 5).map(replay => `
            <article class="replay-dashboard-item"><div><strong>${escapeDashboardHtml(replay.title)}</strong><div style="color:#64748b;font-size:.85rem">${escapeDashboardHtml(replay.course?.title || 'Formation')} · ${new Date(replay.scheduled_at).toLocaleDateString('fr-FR', {timeZone:'Africa/Tunis'})}</div></div>
            <a class="btn-primary dashboard-course-link" href="${replay.course_id ? '/app/course-details?' + new URLSearchParams({id:replay.course_id,replay:replay.id}) : '/app/courses'}">Voir le replay</a></article>`).join('');
    }, () => { list.innerHTML = '<div class="event-item">Impossible de charger les replays.</div>'; });
}

function loadEvents() {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;

    fetchDashboardData('/api/live/upcoming', (events) => {
        if (!Array.isArray(events) || events.length === 0) {
            eventsList.innerHTML = '<div class="event-item">Aucun événement à venir</div>';
            return;
        }
        
        // Sort events chronologically to ensure the closest is first
        events = events.filter(event => Number.isFinite(Date.parse(event.scheduled_at))).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
        if (!events.length) {
            eventsList.innerHTML = '<div class="event-item">Aucun événement à venir</div>';
            return;
        }

        // Find the closest date
        const dateOptions = { timeZone: 'Africa/Tunis' };
        const closestDate = new Date(events[0].scheduled_at).toLocaleDateString('fr-FR', dateOptions);
        
        // Filter to only include events on that closest date
        const nextEvents = events.filter(e => new Date(e.scheduled_at).toLocaleDateString('fr-FR', dateOptions) === closestDate);

        eventsList.innerHTML = nextEvents.map(event => {
            const d = new Date(event.scheduled_at);
            const dateString = d.toLocaleDateString('fr-FR', { ...dateOptions, day: 'numeric', month: 'long' });
            const timeString = d.toLocaleTimeString('fr-FR', { ...dateOptions, hour: '2-digit', minute: '2-digit' });
            const isLive = event.status === 'live';

            return `
                <a class="event-item dashboard-event-link" href="/app/calendar">
                    <div class="event-item-info">
                        <span class="event-tag">📅 ${escapeDashboardHtml(event.course?.title || event.course_title || 'Session')}</span>
                        <h4 class="event-title">${escapeDashboardHtml(event.title)}</h4>
                        <div class="event-time">🗓 ${dateString} - ${timeString}</div>
                        ${isLive ? '<div class="event-live">Session live</div>' : ''}
                    </div>
                    <span class="event-action">Voir &rarr;</span>
                </a>
            `;
        }).join('');
    }, (errorMsg) => {
        eventsList.innerHTML = `
            <div class="event-item" style="border: 1px solid #fecaca; background: #fef2f2;">
                <div class="event-item-info">
                    <h4 class="event-title" style="color: #ef4444;">Connexion impossible</h4>
                    <div class="event-time" style="color: #b91c1c;">Veuillez vérifier votre connexion internet et réessayer.</div>
                </div>
                <button class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: #ef4444;" onclick="loadEvents()">Réessayer</button>
            </div>`;
    });
}



function navigateTo(page) {
    window.location.href = `/app/${page}`;
}

function navigateToCalendar(eventDate) {
    window.location.href = `/app/calendar?date=${eventDate}`;
}

function showContact() {
    if (window.parent && window.parent.loadPage) {
        window.parent.loadPage('contact');
    } else {
        window.location.href = '../contact/contact.html';
    }
}

// Utility function for showing messages
function showMessage(message, type = 'info') {
    // Create a simple message display
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 2rem;
        border-radius: 10px;
        color: white;
        font-family: 'Tajawal', sans-serif;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;

    if (type === 'error') {
        messageDiv.style.background = '#dc3545';
    } else if (type === 'success') {
        messageDiv.style.background = '#28a745';
    } else {
        messageDiv.style.background = '#ff7b1a';
    }

    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes pulseLive {
        0%, 100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.6;
            transform: scale(1.1);
        }
    }
    
    .live-indicator {
        display: inline-block;
        width: 8px;
        height: 8px;
        background: #ff0000;
        border-radius: 50%;
        animation: pulseLive 1.5s ease-in-out infinite;
        box-shadow: 0 0 8px rgba(255, 0, 0, 0.6);
        flex-shrink: 0;
    }
    
    .live-indicator::before {
        content: '';
        position: absolute;
        top: -3px;
        left: -3px;
        right: -3px;
        bottom: -3px;
        border: 2px solid rgba(255, 0, 0, 0.3);
        border-radius: 50%;
        animation: pulseLive 1.5s ease-in-out infinite;
    }
`;
document.head.appendChild(style); 
