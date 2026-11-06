// Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function () {
    initializeDashboard();
});

async function fetchWithSWR(url, cacheKey, callback, errorCallback) {
    const cached = sessionStorage.getItem(cacheKey);
    let hasReturnedCached = false;
    
    if (cached) {
        try { 
            callback(JSON.parse(cached)); 
            hasReturnedCached = true;
        } catch(e){}
    }
    
    try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
            try {
                const errBody = await res.json();
                const errMsg = errBody.message || errBody.error || `HTTP Error: ${res.status}`;
                if (!hasReturnedCached && errorCallback) errorCallback(errMsg);
            } catch (e) {
                if (!hasReturnedCached && errorCallback) errorCallback(`HTTP Error: ${res.status}`);
            }
            return;
        }
        const fresh = await res.json();
        
        const freshStr = JSON.stringify(fresh);
        if (freshStr !== cached) {
            sessionStorage.setItem(cacheKey, freshStr);
            callback(fresh);
        }
    } catch (e) {
        console.error("SWR Error for", url, e);
        if (!hasReturnedCached && errorCallback) errorCallback(e.message);
    }
}

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
    fetchWithSWR('/api/user/me', 'swr_user', (data) => {
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
    fetchWithSWR(`/api/user/stats?t=${Date.now()}`, 'swr_stats', (stats) => {
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
        <div class="locked-state" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:1.5rem;background:#fff7ed;padding:2rem;border-radius:var(--radius-lg);border:2px dashed #fdba74;cursor:pointer;transition:all .3s ease;flex:1;height:100%;min-height:250px;" onclick="window.location.href='/app/offers'">
            <div style="width:80px;height:80px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:var(--orange-primary);box-shadow:0 4px 15px rgba(249,115,22,.15);">🔒</div>
            <div>
                <h4 style="margin:0 0 .5rem;color:#1e293b;font-size:1.3rem;font-weight:800;">Aucune formation pour le moment</h4>
                <p style="margin:0;color:var(--text-muted);font-size:1rem;max-width:300px;">Choisis une offre pour débloquer tes cours. Rien n’apparaît ici tant que tu n’as pas commencé.</p>
            </div>
            <button class="btn-primary" style="padding:.75rem 1.5rem;font-size:1rem;margin-top:.5rem;">Découvrir les offres &rarr;</button>
        </div>
    `;
}

function renderContinueCourseCard(course, { featured = false } = {}) {
    const progress = Number(course.progress) || 0;
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
        <button class="btn-primary" type="button" onclick="window.location.href='/app/course-details?id=${encodeURIComponent(course.course_id)}'">${cta} &rarr;</button>
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

function renderPathStepper(pathSection, activeCourse, modules) {
    const progress = Number(activeCourse.progress) || 0;
    pathSection.style.display = '';
    pathSection.querySelector('.path-title').textContent = activeCourse.title || 'Ton parcours';
    pathSection.querySelector('.path-progress-text').textContent = `${progress}% complété`;

    const stepperTrack = pathSection.querySelector('.stepper-track');
    if (!modules.length) {
        stepperTrack.innerHTML = `<div class="path-empty-state">Les chapitres de cette formation apparaîtront ici dès qu’ils seront publiés.</div>`;
        return;
    }

    const totalModules = modules.length;
    const completedIndex = Math.min(totalModules - 1, Math.floor((progress / 100) * totalModules));
    let html = `<div class="stepper-line"><div class="stepper-line-fill" style="width:${progress}%;"></div></div>`;

    modules.forEach((mod, index) => {
        let statusClass = '';
        let iconHtml = index + 1;
        if (progress >= 100 || index < completedIndex) {
            statusClass = 'completed';
            iconHtml = '✓';
        } else if (index === completedIndex) {
            statusClass = 'current';
            iconHtml = '📍';
        }

        let shortName = mod.title || `Chapitre ${index + 1}`;
        if (shortName.length > 15) shortName = `${shortName.substring(0, 12)}...`;

        html += `
            <div class="step ${statusClass}">
                <div class="step-circle">${iconHtml}</div>
                <span>${escapeDashboardHtml(shortName)}</span>
            </div>
        `;
    });

    stepperTrack.innerHTML = html;
}

function loadCoursePath() {
    fetchWithSWR(`/api/courses/user/my-courses?t=${Date.now()}`, 'swr_courses', (courses) => {
        const continueSection = document.getElementById('continue-content-container');
        const pathSection = document.getElementById('path-section');
        const dashboardContainer = document.querySelector('.dashboard-container');
        const levelSpan = document.querySelector('.level-info span');

        if (!courses || !Array.isArray(courses) || courses.length === 0) {
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

        fetchWithSWR(
            `/api/courses/${encodeURIComponent(activeCourse.course_id)}?t=${Date.now()}`,
            `swr_course_${activeCourse.course_id}`,
            (courseDetails) => {
                if (!pathSection) return;
                renderPathStepper(pathSection, activeCourse, courseDetails?.modules || []);
            },
            () => {
                if (!pathSection) return;
                pathSection.style.display = '';
                const titleEl = pathSection.querySelector('.path-title');
                const progressEl = pathSection.querySelector('.path-progress-text');
                const track = pathSection.querySelector('.stepper-track');
                if (titleEl) titleEl.textContent = activeCourse.title || 'Ton parcours';
                if (progressEl) progressEl.textContent = '';
                if (track) {
                    track.innerHTML = `<div class="path-empty-state path-empty-state-error">Erreur de chargement. <a href="#" onclick="sessionStorage.removeItem('swr_course_${activeCourse.course_id}'); loadCoursePath(); return false;">Réessayer</a></div>`;
                }
            }
        );
    }, (err) => {
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
    fetchWithSWR(`/api/live/replays?t=${Date.now()}`, 'swr_replays', replays => {
        if (!Array.isArray(replays) || !replays.length) {
            list.innerHTML = '<div class="event-item">Les enregistrements publiés par ton enseignant apparaîtront ici.</div>';
            return;
        }
        const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        list.innerHTML = replays.slice(0, 5).map(replay => `
            <article class="replay-dashboard-item"><div><strong>${escapeHtml(replay.title)}</strong><div style="color:#64748b;font-size:.85rem">${escapeHtml(replay.course?.title || 'Formation')} · ${new Date(replay.scheduled_at).toLocaleDateString('fr-FR')}</div></div>
            <a class="btn-primary" href="${escapeHtml(replay.replay_url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;white-space:nowrap">Voir le replay</a></article>`).join('');
    }, () => { list.innerHTML = '<div class="event-item">Impossible de charger les replays.</div>'; });
}

function loadEvents() {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;

    fetchWithSWR(`/api/live/upcoming?t=${Date.now()}`, 'swr_events', (events) => {
        if (!Array.isArray(events) || events.length === 0) {
            eventsList.innerHTML = '<div class="event-item">Aucun événement à venir</div>';
            return;
        }
        
        // Sort events chronologically to ensure the closest is first
        events.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

        // Find the closest date
        const closestDate = new Date(events[0].scheduled_at).toDateString();
        
        // Filter to only include events on that closest date
        const nextEvents = events.filter(e => new Date(e.scheduled_at).toDateString() === closestDate);

        const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                            'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

        eventsList.innerHTML = nextEvents.map(event => {
            const d = new Date(event.scheduled_at);
            const dateString = `${d.getDate()} ${monthNames[d.getMonth()]}`;
            const timeString = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const isLive = event.status === 'live';

            return `
                <div class="event-item" onclick="window.location.href='/app/calendar'">
                    <div class="event-item-info">
                        <span class="event-tag">📅 ${event.course_title || 'Session'}</span>
                        <h4 class="event-title">${event.title}</h4>
                        <div class="event-time">🗓 ${dateString} - ${timeString}</div>
                        ${isLive ? '<div class="event-live">Session live</div>' : ''}
                    </div>
                    <div class="event-action">Rejoindre &rarr;</div>
                </div>
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
