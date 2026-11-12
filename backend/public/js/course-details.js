// =====================================================
// Course Details Page - Backend Integration (French)
// =====================================================

let currentCourse = null;
let currentEnrollment = null;
let currentLiveSessions = [];

async function initCourseDetailsPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');
    // Simple check to ensure we are actually on the course details page
    if (!document.querySelector('.course-details-page-marker') && !window.location.pathname.includes('course-details')) {
        return;
    }

    if (!courseId) {
        showError('ID du cours manquant');
        setTimeout(() => {
            window.location.href = 'courses.html';
        }, 2000);
        return;
    }

    await loadCourseDetails(courseId);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCourseDetailsPage);
} else {
    initCourseDetailsPage();
}

document.addEventListener('click', (event) => {
    const replayButton = event.target.closest('[data-replay-url]');
    if (replayButton) {
        openReplayPlayer(replayButton.dataset.replayUrl, replayButton.dataset.replayTitle, JSON.parse(replayButton.dataset.replayResources || '[]'), replayButton.dataset.sessionId);
        return;
    }
    if (event.target.closest('#buy-button') && currentCourse) {
        if (event.target.closest('#buy-button').dataset.hasAccess === 'true') {
            setCourseContentTab('chapters');
            document.getElementById('chapters-tab')?.focus();
            document.querySelector('.course-content-tabs')?.scrollIntoView({ block: 'start' });
        } else {
            window.location.href = '/app/offers';
        }
        return;
    }
    const tab = event.target.closest('[data-course-tab]');
    if (!tab) return;
    setCourseContentTab(tab.dataset.courseTab);
});

document.addEventListener('keydown', event => {
    if (!event.target.matches('[data-course-tab]')) return;
    const tabs = [...document.querySelectorAll('[data-course-tab]')];
    const index = tabs.indexOf(event.target);
    const next = { ArrowLeft: (index + tabs.length - 1) % tabs.length,
        ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setCourseContentTab(tabs[next].dataset.courseTab);
    tabs[next].focus();
});

function setCourseContentTab(selected) {
    document.querySelectorAll('[data-course-tab]').forEach(button => {
        const active = button.dataset.courseTab === selected;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('.course-content-panel').forEach(panel => {
        const active = panel.id === `${selected}-panel`;
        panel.hidden = !active;
        panel.classList.toggle('is-active', active);
    });
}

async function switchCoursePlayerTo(panelName) {
    document.querySelector('video.course-replay-player')?.pause();
    const video = document.getElementById('current-lesson-video');
    if (video && Number.isFinite(video.currentTime) && video.dataset.lessonId) {
        video.pause();
        await persistLessonVideoPosition(video, true);
    }
    restoreCourseContent();
    setCourseContentTab(panelName);
    document.getElementById(panelName === 'live' ? 'live-tab' : 'chapters-tab')?.focus({ preventScroll: true });
    document.querySelector('.course-content-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function persistLessonVideoPosition(video, force = false) {
    if (!video?.dataset.lessonId || !Number.isFinite(video.currentTime)) return;
    const position = Math.floor(video.currentTime);
    const lastSaved = Number(video.dataset.lastSavedPosition) || 0;
    if (!force && Math.abs(position - lastSaved) < 10) return;
    if (video.positionSavePromise) return video.positionSavePromise;

    video.positionSavePromise = window.SyntaAPI.updateVideoPosition(video.dataset.lessonId, position)
        .then(() => { video.dataset.lastSavedPosition = String(position); })
        .catch(error => console.warn('Could not save lesson position:', error.message))
        .finally(() => { video.positionSavePromise = null; });
    return video.positionSavePromise;
}

/**
 * Load course details with modules and lessons
 */
async function loadCourseDetails(courseId) {
    try {
        // Course structure and access status do not depend on one another.
        const [course, hasAccess] = await Promise.all([
            window.SyntaAPI.fetchCourseDetails(courseId),
            checkUserAccess(courseId)
        ]);

        if (!course) {
            showError('Cours non trouvé');
            setTimeout(() => window.location.href = '/app/courses', 2000);
            return;
        }

        currentCourse = course;

        let liveSessions = [];
        currentLiveSessions = [];
        let liveSessionsLoaded = false;
        let courseResources = [];
        let courseProgress = null;
        if (hasAccess) {
            const [liveResult, resourceResult, progressResult] = await Promise.allSettled([
                fetch(`/api/live/course/${encodeURIComponent(courseId)}`, { credentials: 'include' })
                    .then(response => {
                        if (!response.ok) throw new Error(`Live sessions request failed (${response.status})`);
                        return response.json();
                    }),
                fetch(`/api/courses/${encodeURIComponent(courseId)}/resources`, { credentials: 'include' })
                    .then(response => response.ok ? response.json() : { resources: [] }),
                fetch(`/api/tracking/course-progress/${encodeURIComponent(courseId)}`, { credentials: 'include' })
                    .then(response => response.ok ? response.json() : null)
            ]);

            if (liveResult.status === 'fulfilled') {
                liveSessions = liveResult.value;
                currentLiveSessions = liveSessions;
                liveSessionsLoaded = true;
            } else console.error('Live sessions fetch error:', liveResult.reason);
            if (resourceResult.status === 'fulfilled') courseResources = resourceResult.value.resources || [];
            else console.error('Course documents fetch error:', resourceResult.reason);
            if (progressResult.status === 'fulfilled') courseProgress = progressResult.value;
            else console.error('Progress fetch error:', progressResult.reason);
        }

        // Modules & lessons are already nested in the course response
        const modulesWithLessons = course.modules || [];

        // Count total lessons
        const totalLessons = modulesWithLessons.reduce((sum, module) =>
            sum + (module.lessons || []).filter(lesson => lesson.type !== 'quiz').length, 0);

        // Render course information
        await renderCourseInfo(course, totalLessons, hasAccess, courseProgress, liveSessionsLoaded ? liveSessions.length : null);
        renderCourseLiveSessions(liveSessions, hasAccess, liveSessionsLoaded);
        renderCourseResources(courseResources, hasAccess);

        // Render modules and lessons
        renderModulesAndLessons(modulesWithLessons, hasAccess, courseProgress);

    } catch (error) {
        console.error('Erreur lors du chargement du cours:', error);
        showError('Une erreur s\'est produite lors du chargement des détails du cours');
    }
}

function renderCourseResources(resources, hasAccess) {
    const container = document.getElementById('course-resources-list');
    if (!container) return;
    if (!hasAccess) {
        container.innerHTML = '<p style="color:#64748b;font-size:.9rem">Inscrivez-vous au cours pour accéder aux documents.</p>';
        return;
    }
    if (!resources.length) {
        container.innerHTML = '<p style="color:#64748b;font-size:.9rem">Aucun document ajouté pour le moment.</p>';
        return;
    }
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    container.innerHTML = resources.map(resource => `
        <a class="resource-item" href="${escape(resource.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit">
            <span style="color:#ef4444;font-size:1.2rem"><i class="fas fa-file-alt"></i></span>
            <span style="flex:1;font-size:.9rem;font-weight:600;color:#334155">${escape(resource.title)}<small style="display:block;color:#64748b;font-weight:400">${escape(resource.chapter)}</small></span>
            <i class="fas fa-arrow-up-right-from-square" style="color:#94a3b8;font-size:.8rem"></i>
        </a>`).join('');
}

/**
 * Fetch modules and lessons via REST API
 * Note: loadCourseDetails already receives modules nested in the course object.
 * This function is kept for any direct callers but delegates to the API.
 */
async function fetchModulesAndLessons(courseId) {
    try {
        const course = await window.SyntaAPI.fetchCourseDetails(courseId);
        return course?.modules || [];
    } catch (error) {
        console.error('Erreur lors de la récupération des modules et leçons:', error);
        return [];
    }
}

/**
 * Check if user has access to course (via enrollment) — uses REST API
 */
async function checkUserAccess(courseId) {
    try {
        return await window.SyntaAPI.checkCourseAccess(courseId);
    } catch (error) {
        console.error('Error checking access:', error);
        return false;
    }
}

/**
 * Render course information
 */
async function renderCourseInfo(course, totalLessons, hasAccess, courseProgress, liveCount) {
    // Update thumbnail in sidebar AND hero
    const thumbnailSidebar = document.getElementById('course-thumbnail');
    const thumbnailHero = document.getElementById('course-thumbnail-hero');
    if (course.thumbnail_url) {
        let thumbnailUrl = resolveCourseImage(course.thumbnail_url);
        // Other historical object keys use the existing signed URL endpoint.
        if (!thumbnailUrl && !/^[a-z][a-z0-9+.-]*:/i.test(course.thumbnail_url.trim())) {
            try {
                const response = await fetch('/api/content/signed-url?key=' + encodeURIComponent(course.thumbnail_url));
                if (response.ok) thumbnailUrl = resolveCourseImage((await response.json()).url);
            } catch (err) {
                console.warn('Failed to get thumbnail signed URL:', err);
            }
        }
        if (thumbnailUrl) {
            for (const container of [thumbnailSidebar, thumbnailHero]) {
                if (!container) continue;
                const image = document.createElement('img');
                image.src = thumbnailUrl;
                image.alt = course.title || '';
                image.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                container.replaceChildren(image);
            }
        }
    }

    // Update title
    const titleEl = document.getElementById('course-title');
    if (titleEl) {
        titleEl.textContent = course.title;
    }

    // Update description
    const descSection = document.getElementById('course-description');
    if (descSection) {
        descSection.textContent = course.description || 'Aucune description disponible';
    }
    
    // Update category badge
    const catBadge = document.getElementById('course-category-badge');
    if (catBadge) {
        catBadge.textContent = course.category || '';
        catBadge.hidden = !course.category;
    }

    // Update Progress Area
    const progressContainer = document.getElementById('progress-container');
    const progressText = document.getElementById('progress-percentage-text');
    const progressFill = document.getElementById('progress-bar-fill');
    const progressCompletedText = document.getElementById('progress-completed-text');
    
    if (hasAccess && courseProgress) {
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressText) progressText.textContent = `${courseProgress.percentage}%`;
        if (progressFill) progressFill.style.width = `${courseProgress.percentage}%`;
        if (progressCompletedText) progressCompletedText.textContent = `${courseProgress.completed} / ${courseProgress.total} leçons`;
    } else {
        if (progressContainer) progressContainer.style.display = 'none'; // Hide if not enrolled or no progress
    }

    // Update lessons count
    const lessonsCount = document.getElementById('lessons-count');
    if (lessonsCount) lessonsCount.textContent = totalLessons;
    
    // Update quizzes and lives count
    const quizzesCount = document.getElementById('quizzes-count');
    if (quizzesCount) quizzesCount.textContent = Number(course.quizzes_count) || 0;
    
    const livesCount = document.getElementById('lives-count');
    if (livesCount) livesCount.textContent = liveCount === null ? '—' : liveCount;

    // Update language (default to Arabe)
    const courseLang = document.getElementById('course-language');
    if (courseLang) courseLang.textContent = 'Arabe';

    // Update buy button
    const buyButton = document.getElementById('buy-button');
    if (buyButton) {
        buyButton.dataset.hasAccess = String(Boolean(hasAccess));
        buyButton.hidden = false;
        if (hasAccess) {
            buyButton.textContent = 'Voir les leçons';
            buyButton.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            buyButton.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.3)';
        } else {
            buyButton.textContent = 'Découvrir les offres';
        }
    }
}

function renderCourseLiveSessions(sessions, hasAccess, loaded) {
    const tab = document.getElementById('live-tab');
    const count = document.getElementById('live-tab-count');
    const container = document.getElementById('course-live-list');
    if (!tab || !container) return;

    if (count) count.textContent = String(sessions.length);
    if (!hasAccess) {
        container.innerHTML = '<p style="color:#64748b">Inscrivez-vous à ce cours pour voir ses séances en direct et leurs replays.</p>';
        return;
    }
    if (!loaded) {
        container.innerHTML = '<p style="color:#b45309">Impossible de charger les séances pour le moment. Actualisez la page pour réessayer.</p>';
        return;
    }
    if (!sessions.length) {
        container.innerHTML = '<div class="course-live-empty"><i class="far fa-calendar-times" aria-hidden="true"></i><strong>Aucune séance pour le moment</strong><span>Les prochains directs et leurs replays apparaîtront ici.</span></div>';
        return;
    }

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
    const now = Date.now();
    const monthGroups = new Map();
    sessions.forEach(session => {
        const start = new Date(session.scheduled_at);
        const monthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
        if (!monthGroups.has(monthKey)) monthGroups.set(monthKey, []);
        monthGroups.get(monthKey).push(session);
    });

    container.innerHTML = [...monthGroups.entries()].map(([monthKey, monthSessions], monthIndex) => {
        const [year, month] = monthKey.split('-').map(Number);
        const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
        const monthContent = monthSessions.map(session => {
        const start = new Date(session.scheduled_at);
        const end = start.getTime() + (Number(session.duration_minutes) || 60) * 60000;
        const isUpcoming = start.getTime() > now;
        const isLive = now >= start.getTime() && now <= end;
        const dateLabel = start.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
        let action = '<span style="color:#64748b">Replay bientôt disponible</span>';
        if (session.replay_url) {
            action = `<button type="button" class="course-replay-button" data-session-id="${escapeHtml(session.id)}" data-replay-url="${escapeHtml(session.replay_url)}" data-replay-title="${escapeHtml(session.title)}" data-replay-resources="${escapeHtml(JSON.stringify(session.resources || []))}"><i class="fas fa-play-circle" aria-hidden="true"></i> Regarder le replay</button>`;
        } else if ((isUpcoming || isLive) && session.zoom_join_url) {
            action = `<a href="${escapeHtml(session.zoom_join_url)}" target="_blank" rel="noopener noreferrer" style="color:#e11d48;font-weight:700">${isLive ? 'Rejoindre le direct' : 'Ouvrir le lien du direct'}</a>`;
        }

        const status = isLive ? 'En direct' : isUpcoming ? 'À venir' : session.replay_url ? 'Replay disponible' : 'Terminée';
        const statusClass = isLive ? 'is-live' : isUpcoming ? 'is-upcoming' : session.replay_url ? 'has-replay' : '';
        return `<article class="course-live-session">
            <div class="course-live-session-main"><span class="course-live-status ${statusClass}">${isLive ? '<span></span>' : ''}${status}</span><strong>${escapeHtml(session.title)}</strong><div class="course-live-session-date"><i class="far fa-clock" aria-hidden="true"></i> ${escapeHtml(dateLabel)}</div>${session.description ? `<p>${escapeHtml(session.description)}</p>` : ''}</div>
            <div class="course-live-session-action">${action}</div>
        </article>`;
        }).join('');
        return `<details class="course-live-month" ${monthIndex === 0 ? 'open' : ''}>
            <summary><span class="course-live-month-label"><i class="far fa-calendar" aria-hidden="true"></i><span>${escapeHtml(monthLabel)}</span></span><span class="course-live-month-count">${monthSessions.length} séance${monthSessions.length > 1 ? 's' : ''}<i class="fas fa-chevron-down" aria-hidden="true"></i></span></summary>
            <div class="course-live-month-content">${monthContent}</div>
        </details>`;
    }).join('');
}

function renderReplaySidebar(sidebar, sessions, selectedSessionId = '') {
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
    const replays = (sessions || []).filter(session => session.replay_url);
    const monthGroups = new Map();
    replays.forEach(session => {
        const date = new Date(session.scheduled_at);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthGroups.has(key)) monthGroups.set(key, []);
        monthGroups.get(key).push(session);
    });

    const monthsHtml = [...monthGroups.entries()].map(([key, monthSessions], index) => {
        const [year, month] = key.split('-').map(Number);
        const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
            .format(new Date(year, month - 1, 1));
        const isSelectedMonth = monthSessions.some(session => String(session.id) === String(selectedSessionId));
        const entries = monthSessions.map(session => {
            const selected = String(session.id) === String(selectedSessionId);
            const dateLabel = new Date(session.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
            return `<button type="button" class="replay-sidebar-item${selected ? ' is-active' : ''}" data-session-id="${escapeHtml(session.id)}" data-replay-url="${escapeHtml(session.replay_url)}" data-replay-title="${escapeHtml(session.title)}" data-replay-resources="${escapeHtml(JSON.stringify(session.resources || []))}" ${selected ? 'aria-current="true"' : ''}>
                <span class="replay-sidebar-item-icon"><i class="fas fa-play" aria-hidden="true"></i></span>
                <span class="replay-sidebar-item-text"><strong>${escapeHtml(session.title)}</strong><small>${escapeHtml(dateLabel)}</small></span>
            </button>`;
        }).join('');
        return `<details class="course-live-month" ${isSelectedMonth || (!selectedSessionId && index === 0) ? 'open' : ''}>
            <summary><span class="course-live-month-label"><i class="far fa-calendar" aria-hidden="true"></i><span>${escapeHtml(monthLabel)}</span></span><span class="course-live-month-count">${monthSessions.length}<i class="fas fa-chevron-down" aria-hidden="true"></i></span></summary>
            <div class="replay-sidebar-month-content">${entries}</div>
        </details>`;
    }).join('');

    sidebar.innerHTML = `<section class="replay-sidebar-card" aria-label="Replays disponibles">
        <div class="replay-sidebar-heading"><i class="fas fa-video" aria-hidden="true"></i><div><strong>Replays</strong><span>Choisir une séance</span></div></div>
        ${monthsHtml || '<p class="replay-sidebar-empty">Aucun replay disponible pour le moment.</p>'}
    </section>`;
}

function driveReplayPreview(url) {
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.username || url.password) return null;
    const fileId = url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/)?.[1]
        || (url.pathname === '/open' ? url.searchParams.get('id') : null);
    if (!fileId || !/^[\w-]+$/.test(fileId)) return null;
    const preview = new URL(`https://drive.google.com/file/d/${fileId}/preview`);
    const resourceKey = url.searchParams.get('resourcekey');
    if (resourceKey) preview.searchParams.set('resourcekey', resourceKey);
    return preview.href;
}

function openReplayPlayer(replayUrl, title, resources = [], sessionId = '') {
    document.querySelector('video.course-replay-player')?.pause();
    let parsed;
    try { parsed = new URL(replayUrl, window.location.href); } catch { return showError('Lien du replay invalide'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return showError('Lien du replay invalide');
    const drivePreview = driveReplayPreview(parsed);
    const youtubeId = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v');
    const vimeoId = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(parsed.hostname) ? parsed.pathname.split('/').filter(Boolean).pop() : null;
    let player;
    if (drivePreview) {
        player = document.createElement('iframe');
        player.src = drivePreview;
        player.title = title || 'Replay Google Drive';
        player.allowFullscreen = true;
    } else if (youtubeId && ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname)) {
        player = document.createElement('iframe');
        player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1`;
        player.allow = 'autoplay; encrypted-media; picture-in-picture';
        player.allowFullscreen = true;
        player.title = title || 'Replay de la séance';
    } else if (vimeoId && /^\d+$/.test(vimeoId)) {
        player = document.createElement('iframe');
        player.src = `https://player.vimeo.com/video/${encodeURIComponent(vimeoId)}?autoplay=1`;
        player.allow = 'autoplay; fullscreen; picture-in-picture';
        player.allowFullscreen = true;
        player.title = title || 'Replay de la séance';
    } else {
        player = document.createElement('video');
        player.controls = true;
        player.autoplay = true;
        player.playsInline = true;
        player.src = parsed.href;
    }
    player.className = 'course-replay-player';
    if (player instanceof HTMLVideoElement) player.setAttribute('controlsList', 'nodownload');

    const courseMain = document.querySelector('.course-main');
    const courseSidebar = document.querySelector('.course-sidebar');
    if (!courseMain || !courseSidebar) return;
    if (courseMain.dataset.originalContent) restoreCourseContent();
    courseMain.dataset.originalContent = courseMain.innerHTML;
    courseSidebar.dataset.originalContent = courseSidebar.innerHTML;

    const wrapper = document.createElement('div');
    wrapper.className = 'video-section-wrapper course-replay-view';
    const heading = document.createElement('div');
    heading.className = 'course-player-heading';
    const titleElement = document.createElement('h1');
    titleElement.textContent = title || 'Replay de la séance';
    const switchButton = document.createElement('button');
    switchButton.type = 'button';
    switchButton.className = 'course-player-switch';
    switchButton.innerHTML = '<i class="fas fa-book-open" aria-hidden="true"></i> Retour aux chapitres';
    switchButton.addEventListener('click', () => switchCoursePlayerTo('chapters'));
    const actions = document.createElement('div');
    actions.className = 'course-player-actions';
    const replayListButton = document.createElement('button');
    replayListButton.type = 'button';
    replayListButton.className = 'course-player-switch';
    replayListButton.textContent = 'Directs et replays';
    replayListButton.addEventListener('click', () => switchCoursePlayerTo('live'));
    actions.append(switchButton, replayListButton);
    heading.append(titleElement, actions);
    const frame = document.createElement('div');
    frame.className = 'video-container course-player-frame';
    frame.appendChild(player);
    const details = document.createElement('div');
    details.className = 'lesson-details-content';
    details.innerHTML = '<p>Replay de votre séance en direct.</p>';
    if (drivePreview) {
        const link = document.createElement('a');
        link.className = 'course-replay-external';
        link.href = parsed.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Ouvrir dans Google Drive';
        details.appendChild(link);
    }
    wrapper.append(heading, frame, details);
    courseMain.replaceChildren(wrapper);

    if (resources.length) details.appendChild(createResourceSection(resources, 'Fichiers utilisés pendant la séance'));
    renderReplaySidebar(courseSidebar, currentLiveSessions, sessionId);
    if (window.matchMedia('(max-width: 768px)').matches) {
        document.getElementById('app-sidebar')?.classList.remove('active');
        document.getElementById('sidebar-overlay')?.classList.remove('active');
        document.querySelector('.mobile-menu-toggle')?.classList.remove('active');
    }
    courseMain.style.order = '-2';
    courseMain.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Render modules and lessons
 */
function renderModulesAndLessons(modules, hasAccess, courseProgress) {
    const container = document.getElementById('modules-container');
    const completedIds = courseProgress ? courseProgress.completedIds : [];
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

    if (!modules || modules.length === 0) {
        container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 2rem;">Aucun module disponible pour ce cours.</p>';
        return;
    }

    container.innerHTML = modules.map((module, moduleIndex) => {
        const lessons = module.lessons || [];

        return `
            <div class="module-card">
                <div class="module-header" onclick="toggleModule(${moduleIndex})">
                    <h3>${escapeHtml(module.title)}</h3>
                    <span class="module-toggle" id="toggle-${moduleIndex}">▼</span>
                </div>
                <div class="lessons-list" id="lessons-${moduleIndex}">
                    ${lessons.length > 0 ? lessons.map(lesson => {
            const isLocked = !hasAccess && !lesson.is_preview;
            const isCompleted = completedIds.includes(lesson.id);
            const duration = formatDuration(lesson.duration);
            
            let iconClass = 'active';
            let iconHtml = lesson.type === 'quiz'
                ? '<i class="fas fa-bolt"></i>'
                : '<i class="fas fa-play" style="margin-left: 2px;"></i>';
            if (lesson.type === 'quiz') iconClass = 'quiz';
            
            if (isLocked) {
                iconClass = 'locked';
                iconHtml = '<i class="fas fa-lock"></i>';
            } else if (isCompleted) {
                iconClass = 'completed';
                iconHtml = '<i class="fas fa-check"></i>';
            }

            return `
                            <div class="lesson-item ${lesson.type === 'quiz' ? 'quiz-item' : ''} ${isLocked ? 'locked' : ''}" ${!isLocked ? `onclick="playLesson('${lesson.id}')"` : ''} style="${!isLocked ? 'cursor: pointer;' : ''}">
                                <div class="lesson-info">
                                    <div class="lesson-icon ${iconClass}">
                                        ${iconHtml}
                                    </div>
                                    <div class="lesson-details">
                                        <div class="lesson-title">${escapeHtml(lesson.title)}</div>
                                        ${lesson.type === 'quiz' ? '<span class="quiz-checkpoint-badge"><i class="fas fa-bolt" aria-hidden="true"></i> Mini-défi · 3 questions</span>' : ''}
                                        ${lesson.duration && lesson.duration > 0 ? `<div class="lesson-duration"><i class="far fa-clock"></i> ${duration}</div>` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
        }).join('') : '<p style="padding: 1rem; color: #94a3b8; text-align: center;">Aucune leçon dans ce module</p>'}
                </div>
            </div>
        `;
    }).join('');
    
    // Open first module by default
    if (modules.length > 0) {
        setTimeout(() => toggleModule(0), 100);
    }
}

/**
 * Toggle module visibility
 */
function toggleModule(index) {
    const card = document.getElementById(`lessons-${index}`).closest('.module-card');

    if (card.classList.contains('open')) {
        card.classList.remove('open');
    } else {
        card.classList.add('open');
    }
}

/**
 * Format duration from seconds to MM:SS
 */
function formatDuration(seconds) {
    if (!seconds) return '00:00';

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Play lesson (open video player)
 */
async function playLesson(lessonId) {
    try {
        // Fetch lesson details + signed video URL via REST API
        let contentData;
        try {
            contentData = await window.SyntaAPI.getContentUrl(lessonId);
        } catch (fetchErr) {
            // 403 = not enrolled
            if (fetchErr.message && fetchErr.message.includes('Access denied')) {
                showError('Vous devez être inscrit à ce cours pour accéder à cette leçon.');
                return;
            }
            throw fetchErr;
        }

        const videoUrl = contentData.videoUrl;
        const lesson = contentData.lesson || { id: lessonId, title: 'Leçon', video_key: true };

        // Quiz checkpoints have no video URL; send them to the interactive quiz player.
        if (lesson.type === 'quiz' || contentData.type === 'quiz') {
            await openQuizLesson(lessonId, contentData);
            return;
        }

        // Server signalled video is unavailable (R2 error) but returned 200
        if (contentData.videoError) {
            showError(contentData.videoError);
            return;
        }

        let practiceFiles = [];
        try {
            const resourceResponse = await fetch(`/api/content/lesson/${encodeURIComponent(lessonId)}/resources`, { credentials: 'include' });
            if (resourceResponse.ok) {
                const resourceData = await resourceResponse.json();
                practiceFiles = resourceData.resources || [];
            } else {
                console.warn('Could not load lesson practice files:', resourceResponse.status);
            }
        } catch (resourceError) {
            console.warn('Could not load lesson practice files:', resourceError.message);
        }
        if (contentData.pdfUrl && !practiceFiles.some(resource => String(resource.id).startsWith('legacy-'))) {
            practiceFiles.unshift({
                id: 'legacy-fallback-' + lessonId,
                title: 'Document de la leçon',
                file_name: 'document.pdf',
                url: contentData.pdfUrl,
                preview_url: contentData.pdfUrl
            });
        }

        if (videoUrl) {
            // Mark lesson progress (best-effort)
            markLessonProgress(lessonId);
            // Show video in main content area
            await showLessonInMainArea(lesson, videoUrl, contentData.pdfUrl, practiceFiles);
        } else if (practiceFiles.length || contentData.pdfUrl) {
            // A lesson can be a useful downloadable resource even without a video.
            await showLessonInMainArea(lesson, null, contentData.pdfUrl, practiceFiles);
        } else {
            showError('Vidéo non disponible pour cette leçon.');
        }

    } catch (error) {
        console.error('Erreur lors de la lecture de la leçon:', error);
        showError('Impossible de lire la vidéo: ' + (error.message || 'Erreur inconnue'));
    }
}

/**
 * Mark lesson progress via REST API
 */
async function markLessonProgress(lessonId) {
    try {
        await window.SyntaAPI.markLessonComplete(lessonId, 100);
    } catch (error) {
        console.error('Error marking progress:', error);
    }
}

/**
 * Update overall course progress via REST API
 */
async function updateCourseProgress(userId, courseId) {
    try {
        await fetch(`/api/tracking/progress`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId })
        });
    } catch (error) {
        console.error('Error in updateCourseProgress:', error);
    }
}

/**
 * Show lesson video and attached resources in the course main area
 */
async function showLessonInMainArea(lesson, videoUrl, pdfUrl, practiceFiles = []) {
    const courseMain = document.querySelector('.course-main');
    const courseSidebar = document.querySelector('.course-sidebar');
    const modulesContainer = document.getElementById('modules-container');

    // Store original content to restore later
    if (!courseMain.dataset.originalContent) {
        courseMain.dataset.originalContent = courseMain.innerHTML;
    }
    if (!courseSidebar.dataset.originalContent) {
        courseSidebar.dataset.originalContent = courseSidebar.innerHTML;
    }

    // Legacy PDFs and newly uploaded files are presented in one resource section.

    // Replace main content with the video (when present), lesson resources, and actions.
    courseMain.innerHTML = `
        <div class="video-section-wrapper" style="width: 100%; display: flex; flex-direction: column; gap: 1rem;">
            <div class="course-player-heading"><span class="course-player-mode">Leçon</span><button class="course-player-switch" type="button" onclick="switchCoursePlayerTo('live')"><i class="fas fa-video" aria-hidden="true"></i> Directs et replays</button></div>
            ${videoUrl ? `<div class="video-container" style="background: #000; border-radius: 12px; overflow: hidden; position: relative; aspect-ratio: 16/9; width: 100%; box-shadow: 0 15px 35px rgba(0,0,0,0.2);">
                <video 
                    id="current-lesson-video"
                    data-lesson-id="${lesson.id}"
                    data-resume-position="${Number(lesson.last_position) || 0}"
                    data-last-saved-position="${Number(lesson.last_position) || 0}"
                    controls 
                    controlsList="nodownload"
                    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;"
                    src="${videoUrl}"
                >
                    Votre navigateur ne supporte pas la lecture de vidéos.
                </video>
            </div>` : `<div class="lesson-files-only" style="display:flex;align-items:center;gap:.75rem;padding:1.25rem 1.5rem;border:1px solid #dbeafe;border-radius:14px;background:#eff6ff;color:#1e40af"><i class="fas fa-folder-open" aria-hidden="true"></i><span>Les fichiers de cette leçon sont disponibles ci-dessous.</span></div>`}
            
            <div class="lesson-actions" style="display: flex; gap: 1rem; width: 100%;">
                <button class="btn-complete-next" onclick="completeLessonAndNext('${lesson.id}')" style="flex: 1; padding: 1rem; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    <span class="icon">✅</span> Terminer & Suivante
                </button>
                <button class="btn-feedback" onclick="openFeedbackModal('${lesson.id}')" style="padding: 1rem; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    <span class="icon">🤔</span> Aide
                </button>
            </div>
            
            <div class="lesson-details-content" style="padding: 1.5rem; background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <h2 style="margin-top: 0; font-size: 1.5rem; color: #1e293b; font-weight: 700;">${lesson.title}</h2>
                <div style="color: #64748b; line-height: 1.6; font-size: 1.05rem;">
                    ${lesson.description || 'Aucune description pour cette leçon.'}
                </div>
            </div>
        </div>
    `;

    if (practiceFiles.length) {
        const details = courseMain.querySelector('.lesson-details-content');
        details?.appendChild(createResourceSection(practiceFiles, 'Ressources de la leçon'));
    }

    // Replace sidebar with modules section
    if (modulesContainer && courseSidebar) {
        const modulesClone = modulesContainer.cloneNode(true);
        modulesClone.style.cssText = '';
        courseSidebar.innerHTML = '';
        courseSidebar.appendChild(modulesClone);

        // Highlight the current lesson
        setTimeout(() => {
            const allLessons = courseSidebar.querySelectorAll('.lesson-item');
            allLessons.forEach(lessonItem => {
                // Remove previous active state
                lessonItem.style.background = '';
                lessonItem.style.borderLeft = '';

                // Check if this is the current lesson by comparing onclick attribute
                const onclickAttr = lessonItem.getAttribute('onclick');
                if (onclickAttr && onclickAttr.includes(`'${lesson.id}'`)) {
                    lessonItem.style.background = '#fff7ed';
                    lessonItem.style.borderLeft = '4px solid #f97316';
                }
            });
        }, 100);
    }

    // Disable right-click on video
    setTimeout(() => {
        const video = document.getElementById('current-lesson-video');
        if (video) {
            video.addEventListener('contextmenu', (e) => e.preventDefault());
            video.addEventListener('loadedmetadata', () => {
                const resumeAt = Number(video.dataset.resumePosition) || 0;
                if (resumeAt > 0 && resumeAt < video.duration) video.currentTime = resumeAt;
            }, { once: true });
            video.addEventListener('timeupdate', () => persistLessonVideoPosition(video));
            video.addEventListener('pause', () => persistLessonVideoPosition(video, true));
        }
    }, 100);

    // Ensure video player is ALWAYS on top on mobile layout
    if (courseMain) {
        courseMain.style.order = '-2';
    }

    // Smooth scroll directly to the video player
    setTimeout(() => {
        if (courseMain) {
            courseMain.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 150);
}

/**
 * Restore course content
 */
function restoreCourseContent() {
    const courseMain = document.querySelector('.course-main');
    const courseSidebar = document.querySelector('.course-sidebar');

    if (courseMain.dataset.originalContent) {
        courseMain.innerHTML = courseMain.dataset.originalContent;
        courseMain.style.order = ''; // Reset layout order
        delete courseMain.dataset.originalContent;
    }

    if (courseSidebar.dataset.originalContent) {
        courseSidebar.innerHTML = courseSidebar.dataset.originalContent;
        delete courseSidebar.dataset.originalContent;
    }
}

/**
 * Open video modal (legacy function - now redirects to inline player)
 */
function openVideoModal(title, videoUrl) {
    // This function is kept for compatibility but redirects to inline player
    showLessonInMainArea({ title, description: '' }, videoUrl, null);
}

/**
 * Enroll in course
 */
async function enrollInCourse(courseId, isFree, hasAccess) {
    if (hasAccess) {
        // Already enrolled, just scroll to modules
        document.getElementById('modules-container').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    const authenticated = await window.SyntaAPI.isAuthenticated();
    if (!authenticated) {
        showError('Vous devez vous connecter d\'abord');
        setTimeout(() => {
            window.location.href = '../auth/login.html';
        }, 1500);
        return;
    }

    try {
        const user = await window.SyntaAPI.getCurrentUser();
        if (!user) {
            showError('Utilisateur non trouvé');
            return;
        }

        if (isFree) {
            // Free enrollment via REST API
            await window.SyntaAPI.enrollFreeCourse(courseId);
            showSuccess('Inscription réussie au cours !');
            setTimeout(() => { location.reload(); }, 1500);
        } else {
            // Get user balance via REST API
            let balance = 0;
            try {
                const res = await fetch('/api/user/balance', { credentials: 'same-origin' });
                if (res.ok) { const d = await res.json(); balance = d.balance || 0; }
            } catch (_) {}

            const price = currentCourse?.price || 0;

            // Check if balance is sufficient
            if (balance < price) {
                showError('Solde insuffisant. Redirection vers la page de paiement...');
                setTimeout(() => { window.location.href = '/app/paiement'; }, 1500);
                return;
            }

            // Show confirmation popup
            showPurchaseConfirmationDetails(courseId, currentCourse.title, price, balance);
        }
    } catch (error) {
        console.error('Erreur d\'inscription:', error);
        showError('Une erreur s\'est produite lors de l\'inscription: ' + (error.message || ''));
    }
}

/**
 * Show purchase confirmation popup
 */
function showPurchaseConfirmationDetails(courseId, courseTitle, price, currentBalance) {
    const popup = document.createElement('div');
    popup.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
        padding: 1rem;
        overflow-y: auto;
    `;

    popup.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 2rem;
            max-width: 450px;
            width: 100%;
            margin: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s ease;
        ">
            <h2 style="
                color: #1e293b;
                font-size: 1.5rem;
                margin-bottom: 1rem;
                font-weight: 700;
            ">Confirmer l'achat</h2>
            
            <p style="
                color: #64748b;
                margin-bottom: 1.5rem;
                line-height: 1.6;
            ">Voulez-vous acheter ce cours?</p>
            
            <div style="
                background: #f8fafc;
                border-radius: 12px;
                padding: 1rem;
                margin-bottom: 1.5rem;
            ">
                <div style="margin-bottom: 0.5rem; word-wrap: break-word;"><strong>Cours:</strong> ${courseTitle}</div>
                <div style="margin-bottom: 0.5rem;"><strong>Prix:</strong> <img src="../../source/dt.png" alt="DT" style="width: 14px; height: 14px; display: inline; margin-right: 4px;"> ${price}</div>
                <div style="margin-bottom: 0.5rem;"><strong>Solde actuel:</strong> <img src="../../source/dt.png" alt="DT" style="width: 14px; height: 14px; display: inline; margin-right: 4px;"> ${currentBalance.toFixed(2)}</div>
                <div><strong>Nouveau solde:</strong> <img src="../../source/dt.png" alt="DT" style="width: 14px; height: 14px; display: inline; margin-right: 4px;"> ${(currentBalance - price).toFixed(2)}</div>
            </div>
            
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button id="confirmBuyBtn" style="
                    flex: 1;
                    min-width: 120px;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    padding: 0.875rem;
                    font-family: 'Inter', sans-serif;
                    font-weight: 600;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: transform 0.2s;
                ">Confirmer</button>
                
                <button id="cancelBuyBtn" style="
                    flex: 1;
                    min-width: 120px;
                    background: #e5e7eb;
                    color: #1e293b;
                    border: none;
                    border-radius: 10px;
                    padding: 0.875rem;
                    font-family: 'Inter', sans-serif;
                    font-weight: 600;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: transform 0.2s;
                ">Annuler</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // Add event listeners
    document.getElementById('confirmBuyBtn').onclick = async () => {
        popup.remove();
        await completePurchaseDetails(courseId, price);
    };

    document.getElementById('cancelBuyBtn').onclick = () => {
        popup.remove();
    };

    // Close on background click
    popup.onclick = (e) => {
        if (e.target === popup) {
            popup.remove();
        }
    };
}

/**
 * Complete the purchase after confirmation
 */
async function completePurchaseDetails(courseId, price) {
    try {
        // Call backend API to purchase course
        const response = await fetch(`${window.SyntaAPI.BACKEND_URL}/api/purchase/course`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                courseId: courseId
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Erreur lors de l\'achat du cours');
        }

        console.log('Purchase successful:', result);
        showSuccess('Cours acheté avec succès!');
        setTimeout(() => {
            location.reload();
        }, 1500);

    } catch (error) {
        console.error('Error completing purchase:', error);
        showError(error.message || 'Erreur lors de l\'achat du cours');
    }
}

/**
 * Show error message
 */
function showErrorLegacy(message) {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 2rem;
        border-radius: 10px;
        color: white;
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        z-index: 10001;
        animation: slideIn 0.3s ease;
        background: #dc3545;
        max-width: 400px;
        line-height: 1.6;
    `;

    messageDiv.innerHTML = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.remove();
    }, 8000); // Longer timeout for error messages with instructions
}

/**
 * Show success message
 */
function showSuccess(message) {
    showMessage(message, 'success');
}

/**
 * Show message
 */
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 2rem;
        border-radius: 10px;
        color: white;
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        z-index: 10001;
        animation: slideIn 0.3s ease;
    `;

    if (type === 'error') {
        messageDiv.style.background = '#dc3545';
    } else if (type === 'success') {
        messageDiv.style.background = '#10b981';
    } else {
        messageDiv.style.background = '#667eea';
    }

    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// Add animation styles
if (!document.getElementById('message-animations')) {
    const style = document.createElement('style');
    style.id = 'message-animations';
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
        
        @keyframes fadeIn {
            from {
                opacity: 0;
            }
            to {
                opacity: 1;
            }
        }
        
        @keyframes slideUp {
            from {
                transform: translateY(20px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Render course modules and lessons
 */
function renderCourseContent(course, hasAccess, progress) {
    const contentContainer = document.getElementById('course-content');
    if (!contentContainer) return;

    const completedLessons = progress?.completed_lessons || [];
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

    contentContainer.innerHTML = course.modules.map(module => `
        <div class="module-card">
            <div class="module-header">
                <h3>${escapeHtml(module.title)}</h3>
                ${module.description ? `<p>${escapeHtml(module.description)}</p>` : ''}
            </div>
            
            <div class="lessons-list">
                ${module.lessons.map(lesson => {
        const isCompleted = completedLessons.includes(lesson.id);
        const canAccess = hasAccess || lesson.is_preview;

        return `
                        <div class="lesson-item ${canAccess ? 'accessible' : 'locked'} ${isCompleted ? 'completed' : ''}">
                            <div class="lesson-info">
                                <span class="lesson-icon">
                                    ${lesson.type === 'video' ? '🎥' : lesson.type === 'pdf' ? '📄' : '📝'}
                                </span>
                                <div class="lesson-details">
                                    <h4>${escapeHtml(lesson.title)}</h4>
                                    ${lesson.description ? `<p>${escapeHtml(lesson.description)}</p>` : ''}
                                    ${lesson.duration ? `<span class="duration">${formatDuration(lesson.duration)}</span>` : ''}
                                </div>
                            </div>
                            
                            <div class="lesson-actions">
                                ${isCompleted ? '<span class="completed-badge"><i class="fas fa-check"></i> مكتمل</span>' : ''}
                                ${lesson.is_preview ? '<span class="preview-badge"><i class="fas fa-eye"></i> معاينة مجانية</span>' : ''}
                                ${canAccess ? `
                                    <button class="lesson-btn" onclick="openLesson('${lesson.id}', '${lesson.type}')">
                                        ${lesson.type === 'video' ? 'مشاهدة' : 'فتح'}
                                    </button>
                                ` : `
                                    <button class="lesson-btn locked" disabled>
                                        <i class="fas fa-lock"></i> مقفل
                                    </button>
                                `}
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `).join('');
}

/**
 * Enroll in course
 */
async function legacyEnrollInCourse(courseId, isFree) {
    const authenticated = await window.SyntaAPI.isAuthenticated();
    if (!authenticated) {
        window.SyntaAPI.showError('يجب تسجيل الدخول أولاً');
        setTimeout(() => {
            window.location.href = '../auth/login.html';
        }, 1500);
        return;
    }

    try {
        if (isFree) {
            await window.SyntaAPI.enrollFreeCourse(courseId);
            window.SyntaAPI.showSuccess('تم التسجيل بنجاح! جاري تحديث الصفحة...');
            setTimeout(() => location.reload(), 1500);
        } else {
            // Redirect to payment
            window.location.href = `../paiement/paiement.html?course=${courseId}`;
        }
    } catch (error) {
        console.error('Enrollment error:', error);
        window.SyntaAPI.showError('حدث خطأ: ' + error.message);
    }
}

/**
 * Open lesson content
 */
async function openLesson(lessonId, lessonType) {
    try {
        if (lessonType === 'video') {
            const { videoUrl } = await window.SyntaAPI.getLessonVideo(lessonId);
            let resources = [];
            try {
                const response = await fetch(`/api/content/lesson/${encodeURIComponent(lessonId)}/resources`, { credentials:'include' });
                if (response.ok) resources = (await response.json()).resources || [];
            } catch (error) { console.warn('Could not load lesson files:', error.message); }
            openVideoPlayer(lessonId, videoUrl, resources);
        } else if (lessonType === 'pdf') {
            const { pdfUrl } = await window.SyntaAPI.getLessonPDF(lessonId);
            window.open(pdfUrl, '_blank');
            // Mark as viewed
            await window.SyntaAPI.markLessonComplete(lessonId, 50);
        } else if (lessonType === 'quiz') {
            await openQuizLesson(lessonId);
        }
    } catch (error) {
        console.error('Error opening lesson:', error);
        window.SyntaAPI.showError('حدث خطأ أثناء فتح الدرس');
    }
}

/**
 * Open video player modal
 */
function openVideoPlayer(lessonId, videoUrl, resources = []) {
    const modal = document.createElement('div');
    modal.className = 'video-modal';
    modal.innerHTML = `
        <div class="video-modal-content">
            <button class="close-modal" onclick="this.closest('.video-modal').remove()">✕</button>
            <video id="lesson-video" controls autoplay controlsList="nodownload" oncontextmenu="return false;">
                <source src="${videoUrl}" type="video/mp4">
                متصفحك لا يدعم تشغيل الفيديو
            </video>
        </div>
    `;

    document.body.appendChild(modal);

    if (resources.length) modal.querySelector('.video-modal-content').appendChild(createResourceSection(resources, 'Fichiers pour cette leçon'));

    const video = document.getElementById('lesson-video');

    // Track progress
    let progressInterval;
    video.addEventListener('play', () => {
        progressInterval = setInterval(async () => {
            await window.SyntaAPI.updateVideoPosition(lessonId, video.currentTime);
        }, 10000); // Update every 10 seconds
    });

    video.addEventListener('pause', () => {
        clearInterval(progressInterval);
    });

    video.addEventListener('ended', async () => {
        clearInterval(progressInterval);
        await window.SyntaAPI.markLessonComplete(lessonId, 100);
        window.SyntaAPI.showSuccess('تم إكمال الدرس! 🎉');
        setTimeout(() => location.reload(), 1500);
    });
}

function createResourceSection(resources, headingText) {
    const section = document.createElement('section');
    section.className = 'replay-resource-section';
    const heading = document.createElement('h3');
    heading.textContent = headingText;
    section.appendChild(heading);
    const list = document.createElement('div');
    list.className = 'replay-resource-list';
    resources.forEach(resource => {
        const item = document.createElement('div');
        item.className = 'lesson-resource-item';
        const link = document.createElement('a');
        link.href = resource.url;
        link.className = 'replay-resource-link';
        link.style.flex = '1';
        const icon = document.createElement('i');
        icon.className = 'fas fa-file-alt';
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = resource.title || resource.file_name || 'Fichier';
        if (resource.file_size) label.textContent += ' · ' + formatResourceSize(resource.file_size);
        link.append(icon, label);
        link.addEventListener('click', event => {
            event.preventDefault();
            downloadPracticeResource(resource, link);
        });
        item.appendChild(link);
        const actions = document.createElement('div');
        actions.className = 'lesson-resource-actions';
        const downloadButton = document.createElement('button');
        downloadButton.type = 'button';
        downloadButton.className = 'lesson-resource-action';
        downloadButton.title = 'Télécharger';
        downloadButton.setAttribute('aria-label', 'Télécharger ' + (resource.file_name || resource.title || 'le fichier'));
        const downloadIcon = document.createElement('i');
        downloadIcon.className = 'fas fa-download';
        downloadIcon.setAttribute('aria-hidden', 'true');
        downloadButton.appendChild(downloadIcon);
        downloadButton.addEventListener('click', () => downloadPracticeResource(resource, downloadButton));
        actions.appendChild(downloadButton);
        const fileName = String(resource.file_name || resource.title || '');
        if (/\.pdf$/i.test(fileName) && resource.preview_url) {
            const preview = document.createElement('a');
            preview.href = resource.preview_url;
            preview.target = '_blank';
            preview.rel = 'noopener noreferrer';
            preview.className = 'lesson-resource-action';
            preview.title = 'Ouvrir le PDF';
            preview.setAttribute('aria-label', 'Ouvrir ' + fileName);
            const previewIcon = document.createElement('i');
            previewIcon.className = 'fas fa-eye';
            previewIcon.setAttribute('aria-hidden', 'true');
            preview.appendChild(previewIcon);
            actions.appendChild(preview);
        }
        if (/\.py$/i.test(fileName)) {
            const openButton = document.createElement('button');
            openButton.type = 'button';
            openButton.className = 'lesson-resource-action lesson-resource-code';
            openButton.title = 'Ouvrir dans Code Pratique';
            openButton.setAttribute('aria-label', 'Ouvrir ' + fileName + ' dans Code Pratique');
            const codeIcon = document.createElement('i');
            codeIcon.className = 'fas fa-code';
            codeIcon.setAttribute('aria-hidden', 'true');
            openButton.appendChild(codeIcon);
            openButton.addEventListener('click', () => openPracticeResource(resource, openButton));
            actions.appendChild(openButton);
        }
        item.appendChild(actions);
        list.appendChild(item);
    });
    section.appendChild(list);
    return section;
}

async function openPracticeResource(resource, button) {
    const icon = button.querySelector('i');
    button.disabled = true;
    if (icon) icon.className = 'fas fa-spinner fa-spin';
    try {
        const response = await fetch(resource.code_url || resource.url, { credentials: 'same-origin' });
        if (!response.ok) {
            let message = 'Impossible de charger ce fichier dans Code Pratique.';
            try { message = (await response.json()).error || message; } catch {}
            throw new Error(message);
        }
        const code = await response.text();
        sessionStorage.setItem('synta:practice-starter', JSON.stringify({
            fileName: resource.file_name || resource.title || 'exercice.py',
            code
        }));
        window.location.assign('/app/code-pratique?source=lesson-file');
    } catch (error) {
        console.error('Unable to open practice file in Code Pratique:', error);
        window.SyntaAPI?.showError?.(error.message + ' Vous pouvez toujours le télécharger.');
        button.disabled = false;
        if (icon) icon.className = 'fas fa-code';
    }
}

async function downloadPracticeResource(resource, link) {
    const icon = link.querySelector('i');
    try {
        link.setAttribute('aria-busy', 'true');
        if (icon) icon.className = 'fas fa-spinner fa-spin';
        const response = await fetch(resource.url);
        if (!response.ok) throw new Error('Téléchargement du fichier impossible.');
        const blobUrl = URL.createObjectURL(await response.blob());
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = resource.file_name || resource.title || 'fichier';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
        console.error('Unable to download practice file:', error);
        window.SyntaAPI?.showError?.('Téléchargement impossible. Réessayez ou ouvrez le fichier dans Code Pratique.');
    } finally {
        link.removeAttribute('aria-busy');
        if (icon) icon.className = 'fas fa-download';
    }
}

function formatResourceSize(size) {
    const bytes = Number(size) || 0;
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Format duration in seconds to readable format
 */
function formatDurationReadable(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}س ${minutes}د`;
    }
    return `${minutes}د`;
}

/**
 * Open quiz lesson
 */
async function openQuizLesson(lessonId, loadedContent = null) {
    try {
        const contentData = loadedContent || await window.SyntaAPI.getContentUrl(lessonId);
        const lesson = contentData.lesson || {};
        const questions = lesson.content?.questions;
        if (!Array.isArray(questions) || questions.length !== 3) {
            window.SyntaAPI.showError('Quiz non disponible ou mal configuré');
            return;
        }
        let currentQuestionIndex = 0;
        let score = 0;
        let selectedAnswer = null;
        let renderedQuestionIndex = -1;

        const modal = document.createElement('div');
        modal.className = 'video-modal quiz-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', lesson.title || 'Mini-défi');
        modal.innerHTML = `
            <div class="video-modal-content quiz-modal-content">
                <button class="close-modal" type="button" aria-label="Fermer">✕</button>
                <div id="quiz-content"></div>
            </div>
        `;
        const positionQuizModal = () => {
            const mainArea = document.getElementById('main-section');
            const bounds = mainArea?.getBoundingClientRect();
            if (!bounds) return;
            modal.style.setProperty('--quiz-area-left', `${Math.max(0, bounds.left)}px`);
            modal.style.setProperty('--quiz-area-top', `${Math.max(0, bounds.top)}px`);
            modal.style.setProperty('--quiz-area-width', `${Math.min(window.innerWidth, bounds.right) - Math.max(0, bounds.left)}px`);
            modal.style.setProperty('--quiz-area-height', `${Math.min(window.innerHeight, bounds.bottom) - Math.max(0, bounds.top)}px`);
        };
        const closeQuizModal = () => {
            modal.remove();
            window.removeEventListener('resize', positionQuizModal);
            document.removeEventListener('keydown', handleQuizEscape);
        };
        const handleQuizEscape = event => {
            if (event.key === 'Escape') closeQuizModal();
        };
        if (window.matchMedia('(max-width: 768px)').matches) {
            document.getElementById('app-sidebar')?.classList.remove('active');
            document.getElementById('sidebar-overlay')?.classList.remove('active');
            document.querySelector('.mobile-menu-toggle')?.classList.remove('active');
        }
        positionQuizModal();
        window.addEventListener('resize', positionQuizModal);
        modal.querySelector('.close-modal').addEventListener('click', closeQuizModal);
        modal.addEventListener('click', event => { if (event.target === modal) closeQuizModal(); });
        document.addEventListener('keydown', handleQuizEscape);
        document.body.appendChild(modal);
        renderQuestion();

        function renderQuestion() {
            const question = questions[currentQuestionIndex];
            if (renderedQuestionIndex !== currentQuestionIndex) {
                selectedAnswer = question.type === 'ordering' ? shuffleQuizItems(question.items || []) : question.type === 'matching' ? {} : null;
                renderedQuestionIndex = currentQuestionIndex;
            }
            const quizContent = modal.querySelector('#quiz-content');
            const typeLabels = { multiple_choice:'Choisis la bonne réponse', true_false:'Vrai ou faux ?', code_drag_drop:'Complète le code', ordering:'Remets dans le bon ordre', matching:'Relie chaque élément' };
            let interaction = '';
            if (question.type === 'multiple_choice') {
                interaction = (question.options || []).map(option => `<button class="quiz-choice" data-choice="${escapeQuizHtml(option)}">${escapeQuizHtml(option)}</button>`).join('');
            } else if (question.type === 'true_false') {
                interaction = `<button class="quiz-choice" data-choice="true">Vrai</button><button class="quiz-choice" data-choice="false">Faux</button>`;
            } else if (question.type === 'code_drag_drop') {
                interaction = `<div class="quiz-code-prompt">${escapeQuizHtml(question.text).replace('___','<span class="quiz-drop-zone" data-drop-zone>dépose ici</span>')}</div><div class="quiz-token-tray">${(question.options || []).map((word,index) => `<button class="quiz-token" draggable="true" data-token-index="${index}">${escapeQuizHtml(word)}</button>`).join('')}</div>`;
            } else if (question.type === 'ordering') {
                interaction = `<div class="quiz-order-list">${(selectedAnswer || []).map((item,index) => `<div class="quiz-order-item" draggable="true" data-order-index="${index}"><span><i class="fas fa-grip-lines" aria-hidden="true"></i> ${escapeQuizHtml(item)}</span><span><button type="button" data-move="up" aria-label="Monter">↑</button><button type="button" data-move="down" aria-label="Descendre">↓</button></span></div>`).join('')}</div>`;
            } else if (question.type === 'matching') {
                const options = shuffleQuizItems((question.pairs || []).map(pair => pair.right));
                interaction = (question.pairs || []).map((pair,index) => `<label class="quiz-match-row"><strong>${escapeQuizHtml(pair.left)}</strong><select data-match-index="${index}"><option value="">Choisir…</option>${options.map(option => `<option value="${escapeQuizHtml(option)}">${escapeQuizHtml(option)}</option>`).join('')}</select></label>`).join('');
            }
            quizContent.innerHTML = `
                <div class="quiz-game-header"><span>✨ Mini-défi</span><span>Question ${currentQuestionIndex + 1} sur 3</span></div>
                <div class="quiz-progress"><span style="width:${Math.round((currentQuestionIndex / questions.length) * 100)}%"></span></div>
                <p class="quiz-type-label">${typeLabels[question.type] || 'Question'}</p>
                <h2 class="quiz-prompt">${escapeQuizHtml(question.text).replaceAll('___','<span class="quiz-blank">_____</span>')}</h2>
                <div class="quiz-interaction">${interaction}</div>
                <div class="quiz-feedback" id="quiz-feedback" aria-live="polite"></div>
                <button class="quiz-check-button" id="quiz-check-button">Vérifier</button>`;
            bindQuizInteraction(question, quizContent);
            quizContent.querySelector('#quiz-check-button').onclick = () => submitAnswer(question, quizContent);
        }

        function bindQuizInteraction(question, container) {
            container.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => {
                container.querySelectorAll('[data-choice]').forEach(item => item.classList.remove('is-selected'));
                button.classList.add('is-selected');
                selectedAnswer = question.type === 'true_false' ? button.dataset.choice === 'true' : button.dataset.choice;
            }));
            const dropZone = container.querySelector('[data-drop-zone]');
            if (dropZone) {
                const placeToken = token => { selectedAnswer = token; dropZone.textContent = token; dropZone.classList.add('has-token'); };
                container.querySelectorAll('[data-token-index]').forEach(button => {
                    button.addEventListener('click', () => placeToken(button.textContent));
                    button.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', button.textContent));
                });
                dropZone.addEventListener('dragover', event => event.preventDefault());
                dropZone.addEventListener('drop', event => { event.preventDefault(); placeToken(event.dataTransfer.getData('text/plain')); });
            }
            container.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
                const index = Number(button.closest('[data-order-index]').dataset.orderIndex);
                const offset = button.dataset.move === 'up' ? -1 : 1;
                const target = index + offset;
                if (target < 0 || target >= selectedAnswer.length) return;
                [selectedAnswer[index], selectedAnswer[target]] = [selectedAnswer[target], selectedAnswer[index]];
                renderQuestion();
            }));
            container.querySelectorAll('.quiz-order-item').forEach(row => {
                row.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', row.dataset.orderIndex));
                row.addEventListener('dragover', event => event.preventDefault());
                row.addEventListener('drop', event => {
                    event.preventDefault();
                    const from = Number(event.dataTransfer.getData('text/plain'));
                    const to = Number(row.dataset.orderIndex);
                    selectedAnswer.splice(to, 0, selectedAnswer.splice(from, 1)[0]);
                    renderQuestion();
                });
            });
            container.querySelectorAll('[data-match-index]').forEach(select => select.addEventListener('change', () => {
                selectedAnswer[select.dataset.matchIndex] = select.value;
            }));
        }

        async function submitAnswer(question, container) {
            if (selectedAnswer === null || (question.type === 'matching' && (Object.keys(selectedAnswer).length !== question.pairs.length || Object.values(selectedAnswer).some(value => !value)))) {
                const feedback = container.querySelector('#quiz-feedback');
                feedback.textContent = 'Choisis une réponse avant de continuer.';
                feedback.className = 'quiz-feedback is-warning';
                return;
            }
            let isCorrect = false;
            if (question.type === 'multiple_choice' || question.type === 'code_drag_drop') isCorrect = selectedAnswer === question.answer;
            else if (question.type === 'true_false') isCorrect = selectedAnswer === question.answer;
            else if (question.type === 'ordering') isCorrect = selectedAnswer.every((item,index) => item === question.answer[index]);
            else if (question.type === 'matching') isCorrect = question.pairs.every((pair,index) => selectedAnswer[index] === pair.right);
            if (isCorrect) score++;
            const feedback = container.querySelector('#quiz-feedback');
            feedback.textContent = isCorrect ? 'Bien joué ! Tu as compris 👏' : 'Pas tout à fait — retiens la bonne réponse et continue 💡';
            feedback.className = `quiz-feedback ${isCorrect ? 'is-correct' : 'is-incorrect'}`;
            const checkButton = container.querySelector('#quiz-check-button');
            checkButton.textContent = currentQuestionIndex === questions.length - 1 ? 'Voir mon résultat' : 'Question suivante';
            checkButton.onclick = async () => {
                try {
                    await fetch('/api/tracking/response', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lessonId, questionId:`q${currentQuestionIndex + 1}`, category:question.type, selectedOption:JSON.stringify(selectedAnswer), isCorrect, pointsEarned:isCorrect ? 1 : 0 }) });
                } catch (error) { console.warn('Quiz response tracking failed:', error); }
                currentQuestionIndex++;
                if (currentQuestionIndex < questions.length) renderQuestion();
                else showResults();
            };
            checkButton.classList.add('is-next');
            container.querySelectorAll('button,select').forEach(control => { if (control !== checkButton) control.disabled = true; });
        }

        async function showResults() {
            const passed = score >= 2;
            modal.querySelector('#quiz-content').innerHTML = `<div class="quiz-results"><div class="quiz-result-emoji">${passed ? '🎉' : '🌱'}</div><span class="quiz-type-label">Mini-défi terminé</span><h2>${passed ? 'Bravo, continue comme ça !' : 'Chaque essai te fait progresser !'}</h2><p>Tu as obtenu <strong>${score} / ${questions.length}</strong></p><div class="quiz-result-stars">${'⭐'.repeat(score)}${'☆'.repeat(questions.length - score)}</div><button class="quiz-check-button" id="quiz-finish">Continuer le cours</button></div>`;
            await window.SyntaAPI.markLessonComplete(lessonId, 100);
            modal.querySelector('#quiz-finish').addEventListener('click', () => { modal.remove(); loadCourseDetails(currentCourse.id); });
        }

    } catch (error) {
        console.error('Error opening quiz:', error);
        window.SyntaAPI.showError(error.message || 'Impossible d’ouvrir le quiz');
    }
}

function escapeQuizHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function shuffleQuizItems(items) {
    return [...items].sort(() => Math.random() - 0.5);
}

/**

async function getToken() {
    // Auth is cookie-based — no client-side token needed
    return null;
}

/**
 * Show error message
 */
function showError(message) {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 2rem;
        border-radius: 10px;
        color: white;
        background: #dc3545;
        z-index: 10001;
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 3000);
}

// ==========================================
// PHASE 1: Course Progression Logic
// ==========================================

/**
 * Mark a lesson as complete, and auto-navigate to the next available lesson
 */
async function completeLessonAndNext(lessonId) {
    try {
        // Mark as complete in backend
        await fetch('/api/tracking/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lessonId, progress: 100 })
        });
        
        // Find next lesson and check access
        if (!currentCourse || !currentCourse.modules) return;
        
        const hasAccess = await checkUserAccess(currentCourse.id);
        
        let foundCurrent = false;
        let nextLessonId = null;
        let nextLessonIsLocked = false;
        
        for (const mod of currentCourse.modules) {
            for (const les of mod.lessons) {
                if (foundCurrent) {
                    nextLessonId = les.id;
                    nextLessonIsLocked = !hasAccess && !les.is_preview;
                    break;
                }
                if (les.id === lessonId) {
                    foundCurrent = true;
                }
            }
            if (nextLessonId) break;
        }
        
        // Reload course details to refresh progress bar & icons
        await loadCourseDetails(currentCourse.id);
        
        // Play next lesson if exists and accessible
        if (nextLessonId && !nextLessonIsLocked) {
            playLesson(nextLessonId);
        } else {
            // Reached the end of the course or next lesson is locked
            restoreCourseContent();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
    } catch (err) {
        console.error("Failed to complete lesson", err);
    }
}

/**
 * Open the feedback modal
 */
function openFeedbackModal(lessonId) {
    let overlay = document.getElementById('feedback-modal-overlay');
    if (!overlay) {
        // Create modal if it doesn't exist
        overlay = document.createElement('div');
        overlay.id = 'feedback-modal-overlay';
        overlay.className = 'feedback-modal-overlay';
        overlay.innerHTML = `
            <div class="feedback-modal">
                <h3>Qu'est-ce qui t'a bloqué ? 🤔</h3>
                <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 1.5rem;">Ton retour nous aide à améliorer le cours pour tout le monde.</p>
                
                <div class="feedback-options">
                    <div class="feedback-option" onclick="selectFeedbackOption(this, 'explication')">Je n'ai pas compris l'explication</div>
                    <div class="feedback-option" onclick="selectFeedbackOption(this, 'exercice')">J'ai compris mais l'exercice est difficile</div>
                    <div class="feedback-option" onclick="selectFeedbackOption(this, 'code')">Je ne comprends pas le code</div>
                    <div class="feedback-option" onclick="selectFeedbackOption(this, 'autre')">Autre</div>
                </div>
                
                <textarea id="feedback-notes" class="feedback-textarea" placeholder="Peux-tu nous en dire plus ? (Optionnel)"></textarea>
                
                <div class="feedback-actions">
                    <button class="btn-cancel" onclick="closeFeedbackModal()">Annuler</button>
                    <button class="btn-submit" onclick="submitFeedback()">Envoyer</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    
    // Reset state
    window.currentFeedbackLessonId = lessonId;
    window.selectedFeedbackReason = null;
    document.querySelectorAll('.feedback-option').forEach(el => el.classList.remove('selected'));
    const notes = document.getElementById('feedback-notes');
    if (notes) {
        notes.value = '';
        notes.style.display = 'none';
    }
    
    // Show modal
    setTimeout(() => overlay.classList.add('active'), 10);
}

function closeFeedbackModal() {
    const overlay = document.getElementById('feedback-modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

function selectFeedbackOption(element, reason) {
    document.querySelectorAll('.feedback-option').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    window.selectedFeedbackReason = element.textContent;
    
    const notes = document.getElementById('feedback-notes');
    if (reason === 'autre') {
        notes.style.display = 'block';
        notes.focus();
    } else {
        notes.style.display = 'block';
    }
}

async function submitFeedback() {
    if (!window.selectedFeedbackReason) {
        alert("Choisis une option d'abord");
        return;
    }
    
    const notes = document.getElementById('feedback-notes').value;
    
    try {
        await fetch('/api/tracking/lesson-feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                lessonId: window.currentFeedbackLessonId,
                reason: window.selectedFeedbackReason,
                additionalNotes: notes
            })
        });
        
        closeFeedbackModal();
        
        // Show subtle success toast
        const toast = document.createElement('div');
        toast.textContent = "Merci pour ton retour ! On va améliorer ça.";
        toast.style.cssText = "position: fixed; bottom: 20px; right: 20px; background: #10b981; color: white; padding: 1rem 1.5rem; border-radius: 8px; font-weight: 600; box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 10000; animation: slideUp 0.3s ease-out;";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        
    } catch (err) {
        console.error("Feedback error", err);
    }
}
