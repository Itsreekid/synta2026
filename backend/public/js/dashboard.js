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
        // Small label above the greeting: "Bac · Sciences".
        const track = document.getElementById('greeting-track');
        if (track && academicLabel) {
            track.innerHTML = '<i class="fas fa-graduation-cap" aria-hidden="true"></i> ';
            track.append(academicLabel);
            track.hidden = false;
        }
    });
}

function loadStats() {
    fetchDashboardData('/api/user/stats', (stats) => {
        // Totals only: the % of the course being followed is already in the greeting.
        const set = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.textContent = Number(value) || 0;
        };
        set('completed-courses', stats.totalCompletedLessons);
        set('active-courses', stats.activeCourses);
        set('finished-courses', stats.completedCourses);
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

/** Course icon (Font Awesome, same style as the rest of the dashboard) from its category or title. */
function courseIconFor(course) {
    const iconMap = {
        python: 'fa-brands fa-python', algorithmique: 'fas fa-diagram-project', informatique: 'fas fa-laptop-code',
        programmation: 'fas fa-code', math: 'fas fa-square-root-variable',
    };
    const haystack = `${course?.category || ''} ${course?.title || ''}`.toLowerCase();
    const icon = Object.keys(iconMap).find(key => haystack.includes(key));
    return `<i class="${icon ? iconMap[icon] : 'fas fa-book'}" aria-hidden="true"></i>`;
}

/** Greeting card: where the student stands in the course to resume, with its progress and Continuer. */
function renderGreetingResume(course) {
    const message = document.getElementById('greeting-message');
    const resume = document.getElementById('greeting-resume');
    if (!message || !resume) return;
    const progress = Math.round(Math.max(0, Math.min(100, Number(course.progress) || 0)));
    const started = courseActivityDate(course) > 0 || progress > 0 || (Number(course.completed_lessons) || 0) > 0;
    const title = course.title || 'ta formation';
    message.textContent = '';
    if (!started) {
        message.append('Ta formation ', Object.assign(document.createElement('strong'), { textContent: title }), ' t’attend. Lance ta première leçon !');
    } else if (progress >= 100) {
        message.append('Bravo, tu as terminé ', Object.assign(document.createElement('strong'), { textContent: title }), ' ! Tu peux revoir les leçons quand tu veux.');
    } else {
        message.append('Tu en es à ', Object.assign(document.createElement('strong'), { textContent: progress + ' %' }),
            ' de ', Object.assign(document.createElement('strong'), { textContent: title }), '. Continue là où tu t’es arrêté.');
    }
    const cta = !started ? 'Commencer' : progress >= 100 ? 'Revoir' : 'Continuer';
    resume.innerHTML = `
        <div class="greeting-progress" role="progressbar" aria-label="Progression de la formation" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
            <span style="width:${progress}%"></span>
        </div>
        <a class="btn-primary dashboard-course-link greeting-cta" href="/app/course-details?id=${encodeURIComponent(course.course_id)}">
            <i class="fas fa-play" aria-hidden="true"></i> ${cta}
        </a>`;
    resume.hidden = false;
}

/** Greeting card for a student without a course yet. */
function renderGreetingStart() {
    const message = document.getElementById('greeting-message');
    const resume = document.getElementById('greeting-resume');
    if (message) message.textContent = 'Commence ton parcours en informatique avec la séance gratuite.';
    if (!resume) return;
    resume.innerHTML = '<a class="btn-primary dashboard-course-link greeting-cta" href="/session"><i class="fas fa-play" aria-hidden="true"></i> Séance gratuite</a>';
    resume.hidden = false;
}

function renderLockedContinueState(continueSection) {
    const dashboardContainer = document.querySelector('.dashboard-container');
    if (dashboardContainer) dashboardContainer.classList.add('locked-mode');

    // The greeting already holds « Séance gratuite »; this card offers the other first steps.
    const card = document.getElementById('continue-section');
    const heading = document.getElementById('continue-heading');
    if (heading) heading.textContent = 'Pour commencer';
    if (card) card.hidden = false;
    continueSection.innerHTML = `
        <div class="dashboard-first-steps">
            <div class="dashboard-first-actions">
                <a href="/app/courses">Explorer les cours et les aperçus &rarr;</a>
                <a href="/app/offers">Découvrir les offres &rarr;</a>
            </div>
            <p data-dashboard-recommendation hidden></p>
        </div>
    `;
    const recommendation = continueSection.querySelector('[data-dashboard-recommendation]');
    fetchDashboardData('/api/offers', payload => {
        const offers = Array.isArray(payload?.offers) ? payload.offers : [];
        const featured = offers.find(offer => offer.is_best_seller && !offer.is_purchased &&
            (!offer.access_mode || offer.timed_sales_enabled) && offer.title);
        if (featured && recommendation?.isConnected) {
            recommendation.textContent = 'Offre mise en avant pour ton parcours · ' + featured.title;
            recommendation.hidden = false;
        }
    });
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


// =====================================================
// Continuer l'apprentissage: the next lessons of the course being followed
// =====================================================

const LEARN_CARD_COUNT = 3;
const DASH_TZ = 'Africa/Tunis';

function lessonCourseUrl(courseId, lessonId = null) {
    const params = new URLSearchParams({ id: courseId });
    if (lessonId) params.set('lesson', lessonId);
    return '/app/course-details?' + params.toString();
}

/** Lesson durations are stored in seconds (same as the course page). */
function formatLessonDuration(seconds) {
    const total = Number(seconds) || 0;
    if (total <= 0) return '';
    const value = Math.max(1, Math.round(total / 60));
    if (value < 60) return value + ' min';
    const hours = Math.floor(value / 60), rest = value % 60;
    return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}

/** Lessons (no mini-défis) in course order with their chapter, position and chapter totals. */
function courseLessonList(modules) {
    return modules.flatMap((module, chapterIndex) => {
        const lessons = (module.lessons || []).filter(lesson => lesson.type !== 'quiz');
        return lessons.map((lesson, index) => ({
            ...lesson, chapterIndex, chapterTitle: module.title || `Chapitre ${chapterIndex + 1}`,
            numberInChapter: index + 1, chapterTotal: lessons.length,
        }));
    });
}

function renderLearnMessage(html) {
    const grid = document.getElementById('learn-grid');
    if (grid) grid.innerHTML = `<div class="dash-empty learn-empty">${html}</div>`;
}

/** Chapter strip: one segment per chapter, filled with its progress, and the current chapter named. */
function renderChapterStrip(modules, chapterProgress, currentChapter) {
    const strip = document.getElementById('chapter-strip');
    if (!strip) return;
    const counted = chapterProgress.filter(value => value !== null).length;
    if (!counted) { strip.hidden = true; return; }
    const allDone = chapterProgress.every(value => value === null || value === 1);
    const label = allDone ? 'Tous les chapitres terminés'
        : `Chapitre ${currentChapter + 1} / ${modules.length} · ${modules[currentChapter]?.title || ''}`;
    strip.innerHTML = `
        <span class="chapter-strip-label" dir="auto"></span>
        <div class="chapter-strip-bars" role="list" aria-label="Progression par chapitre">
            ${modules.map((module, index) => {
                const value = chapterProgress[index];
                const percent = Math.round((value || 0) * 100);
                const state = value === 1 ? ' is-done' : index === currentChapter ? ' is-current' : '';
                return `<span class="chapter-seg${state}" role="listitem" title="${escapeDashboardHtml(module.title || 'Chapitre ' + (index + 1))} · ${percent} %" style="--fill:${percent}%"></span>`;
            }).join('')}
        </div>`;
    strip.querySelector('.chapter-strip-label').textContent = label;
    strip.hidden = false;
}

function renderLearn(course, modules, completedIds) {
    const grid = document.getElementById('learn-grid');
    if (!grid) return;
    const viewAll = document.getElementById('learn-view-all');
    if (viewAll) viewAll.href = lessonCourseUrl(course.course_id);

    const lessons = courseLessonList(modules);
    if (!lessons.length) {
        document.getElementById('chapter-strip').hidden = true;
        renderLearnMessage('Les leçons de cette formation apparaîtront ici dès qu’elles seront publiées.');
        return;
    }
    const done = new Set(completedIds || []);
    const chapterProgress = modules.map((_, index) => {
        const inChapter = lessons.filter(lesson => lesson.chapterIndex === index);
        return inChapter.length ? inChapter.filter(lesson => done.has(lesson.id)).length / inChapter.length : null;
    });
    const upNext = lessons.filter(lesson => !done.has(lesson.id)).slice(0, LEARN_CARD_COUNT);
    const currentChapter = upNext.length ? upNext[0].chapterIndex : modules.length - 1;
    renderChapterStrip(modules, chapterProgress, currentChapter);

    // The greeting's Continuer opens the exact next lesson.
    const cta = document.querySelector('.greeting-cta');
    if (cta && upNext[0]) cta.href = lessonCourseUrl(course.course_id, upNext[0].id);

    if (!upNext.length) {
        renderLearnMessage(`Bravo, toutes les leçons sont terminées. <a href="${lessonCourseUrl(course.course_id)}">Revoir le cours &rarr;</a>`);
        return;
    }
    grid.innerHTML = upNext.map((lesson, index) => {
        const chapterPercent = Math.round((chapterProgress[lesson.chapterIndex] || 0) * 100);
        const duration = formatLessonDuration(lesson.duration);
        const isPdf = lesson.type === 'pdf';
        return `
        <a class="learn-item" href="${lessonCourseUrl(course.course_id, lesson.id)}">
            <div class="learn-thumb tone-${lesson.chapterIndex % 4}" data-thumb-lesson="${escapeDashboardHtml(lesson.id)}">
                <span class="learn-badge${index === 0 ? ' is-next' : ''}">${index === 0 ? 'Prochaine leçon' : 'Ensuite'}</span>
                <span class="learn-thumb-icon" aria-hidden="true"><i class="fas ${isPdf ? 'fa-file-lines' : 'fa-play'}"></i></span>
                ${duration ? `<span class="learn-duration"><i class="far fa-clock" aria-hidden="true"></i> ${duration}</span>` : ''}
            </div>
            <div class="learn-body">
                <span class="learn-chapter" dir="auto">Chapitre ${lesson.chapterIndex + 1} · ${escapeDashboardHtml(lesson.chapterTitle)}</span>
                <h4 dir="auto">${escapeDashboardHtml(lesson.title)}</h4>
                <div class="learn-progress" aria-hidden="true"><span style="width:${chapterPercent}%"></span></div>
                <div class="learn-meta"><span>Leçon ${lesson.numberInChapter} / ${lesson.chapterTotal}</span><span>Chapitre ${chapterPercent} %</span></div>
            </div>
        </a>`;
    }).join('');
    applyLessonThumbnails(grid, course, upNext.map(lesson => lesson.id));
}

/** Shows an image on a card only once it has really loaded (a broken image never leaves a grey box). */
function setCardImage(thumb, url) {
    return new Promise(resolve => {
        if (!url || !thumb.isConnected) return resolve(false);
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
            if (thumb.isConnected) {
                thumb.style.setProperty('--thumb', `url("${url.replace(/["\\\n]/g, encodeURIComponent)}")`);
                thumb.classList.add('has-image');
            }
            resolve(true);
        };
        image.onerror = () => resolve(false);
        image.src = url;
    });
}

/** Lesson cards: the frame saved from each lesson video, else the course image, else the illustrated placeholder. */
function applyLessonThumbnails(grid, course, lessonIds) {
    const courseImage = typeof resolveCourseImage === 'function' ? resolveCourseImage(course.thumbnail_url) : null;
    const fallBack = thumbs => thumbs.forEach(thumb => setCardImage(thumb, courseImage));
    const thumbs = () => [...grid.querySelectorAll('[data-thumb-lesson]')];
    fetchDashboardData('/api/content/lesson-thumbnails?' + new URLSearchParams({ ids: lessonIds.join(',') }), data => {
        const urls = data?.thumbnails || {};
        thumbs().forEach(async thumb => {
            if (!await setCardImage(thumb, urls[thumb.dataset.thumbLesson])) setCardImage(thumb, courseImage);
        });
    }, () => fallBack(thumbs()));
}

let dashboardPathRequest = 0;
function loadCoursePath() {
    const request = ++dashboardPathRequest;
    fetchDashboardData('/api/courses/user/my-courses', (payload) => {
        if (request !== dashboardPathRequest) return;
        const courses = (Array.isArray(payload) ? payload : [])
            .filter(course => course && course.is_published !== false && course.course_id);
        const continueSection = document.getElementById('continue-content-container');
        const dashboardContainer = document.querySelector('.dashboard-container');
        const activeCourse = pickActiveCourse(courses);

        if (!activeCourse?.course_id) {
            renderGreetingStart();
            if (continueSection) renderLockedContinueState(continueSection);
            document.getElementById('learn-section')?.setAttribute('hidden', '');
            return;
        }
        if (dashboardContainer) dashboardContainer.classList.remove('locked-mode');
        document.getElementById('learn-section')?.removeAttribute('hidden');
        renderGreetingResume(activeCourse);

        // The greeting shows the course being followed; this card lists only the student's other courses.
        const otherCourses = courses.filter(course => String(course.course_id) !== String(activeCourse.course_id));
        const continueCard = document.getElementById('continue-section');
        const continueHeading = document.getElementById('continue-heading');
        if (continueHeading) continueHeading.textContent = 'Autres formations';
        if (continueCard) continueCard.hidden = otherCourses.length === 0;
        if (continueSection) {
            continueSection.innerHTML = otherCourses.length
                ? `<div class="continue-course-grid">${otherCourses.map(course => renderContinueCourseCard(course)).join('')}</div>` : '';
        }

        const courseId = encodeURIComponent(activeCourse.course_id);
        fetchDashboardData(`/api/courses/${courseId}`, (courseDetails) => {
            if (request !== dashboardPathRequest) return;
            const modules = courseDetails?.modules || [];
            fetchDashboardData(`/api/tracking/course-progress/${courseId}`, progress => {
                if (request === dashboardPathRequest) renderLearn(activeCourse, modules, Array.isArray(progress.completedIds) ? progress.completedIds : []);
            }, () => {
                if (request === dashboardPathRequest) renderLearn(activeCourse, modules, []);
            });
        }, () => {
            if (request !== dashboardPathRequest) return;
            renderLearnMessage('Erreur de chargement. <button type="button" class="dash-retry" onclick="loadCoursePath()">Réessayer</button>');
        });
    }, (err) => {
        if (request !== dashboardPathRequest) return;
        renderLearnMessage('Erreur de chargement. <button type="button" class="dash-retry" onclick="loadCoursePath()">Réessayer</button>');
        console.warn('Dashboard courses:', err);
    });
}

// =====================================================
// Calendrier + À venir + Replays (same session data, shown three ways)
// =====================================================

const dashboardSessions = { upcoming: null, replays: null, month: null };

/** YYYY-MM-DD of a date in Tunisia time (the school's calendar). */
function tunisDayKey(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DASH_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function renderMiniCalendar() {
    const grid = document.getElementById('mini-cal');
    const label = document.getElementById('mini-cal-month');
    if (!grid) return;
    const todayKey = tunisDayKey(new Date());
    if (!dashboardSessions.month) {
        const [year, month] = todayKey.split('-').map(Number);
        dashboardSessions.month = { year, month: month - 1 };
    }
    const { year, month } = dashboardSessions.month;
    const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
    if (label) label.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    // Sessions by day: live (upcoming) and replays (past, recorded).
    const days = new Map();
    const add = (session, kind) => {
        const time = Date.parse(session?.scheduled_at);
        if (!Number.isFinite(time)) return;
        const key = tunisDayKey(new Date(time));
        if (!days.has(key)) days.set(key, { live: false, replay: false, titles: [] });
        const entry = days.get(key);
        entry[kind] = true;
        entry.titles.push((kind === 'live' ? 'Séance : ' : 'Replay : ') + (session.title || 'Séance'));
    };
    (dashboardSessions.upcoming || []).forEach(session => add(session, 'live'));
    (dashboardSessions.replays || []).forEach(session => add(session, 'replay'));

    const first = new Date(Date.UTC(year, month, 1));
    const offset = (first.getUTCDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
    const head = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(day => `<span class="mini-cal-head" role="columnheader">${day}</span>`).join('');
    let body = '';
    for (let index = 0; index < cells; index++) {
        const date = new Date(Date.UTC(year, month, index - offset + 1));
        const key = date.toISOString().slice(0, 10);
        const inMonth = date.getUTCMonth() === month;
        const entry = days.get(key);
        const classes = ['mini-cal-day', inMonth ? '' : 'is-outside', key === todayKey ? 'is-today' : '', entry ? 'has-event' : ''].filter(Boolean).join(' ');
        const dots = entry ? `<span class="mini-cal-dots">${entry.live ? '<i class="dot dot-live"></i>' : ''}${entry.replay ? '<i class="dot dot-replay"></i>' : ''}</span>` : '';
        const dayLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
        body += entry
            ? `<a class="${classes}" role="gridcell" href="/app/calendar?date=${key}" title="${escapeDashboardHtml(entry.titles.join(' · '))}" aria-label="${escapeDashboardHtml(dayLabel + ' : ' + entry.titles.join(', '))}">${date.getUTCDate()}${dots}</a>`
            : `<span class="${classes}" role="gridcell"${key === todayKey ? ' aria-current="date"' : ''}>${date.getUTCDate()}</span>`;
    }
    grid.innerHTML = head + body;
}

document.addEventListener('click', event => {
    const arrow = event.target.closest('[data-cal-step]');
    if (!arrow || !dashboardSessions.month) return;
    const step = Number(arrow.dataset.calStep) || 0;
    const date = new Date(dashboardSessions.month.year, dashboardSessions.month.month + step, 1);
    dashboardSessions.month = { year: date.getFullYear(), month: date.getMonth() };
    renderMiniCalendar();
});

function renderUpcomingList(events) {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;
    if (!events.length) {
        eventsList.innerHTML = '<div class="dash-empty">Aucune séance prévue pour le moment.</div>';
        return;
    }
    const now = Date.now();
    const todayKey = tunisDayKey(new Date());
    const tomorrowKey = tunisDayKey(new Date(now + 86400000));
    eventsList.innerHTML = events.slice(0, 4).map(event => {
        const start = new Date(event.scheduled_at);
        const end = Date.parse(event.ends_at) || start.getTime() + (Number(event.duration_minutes) || 60) * 60000;
        const live = event.status === 'live' || (start.getTime() <= now && now < end);
        const key = tunisDayKey(start);
        const day = key === todayKey ? 'Aujourd’hui' : key === tomorrowKey ? 'Demain'
            : start.toLocaleDateString('fr-FR', { timeZone: DASH_TZ, weekday: 'short', day: 'numeric', month: 'short' });
        const time = start.toLocaleTimeString('fr-FR', { timeZone: DASH_TZ, hour: '2-digit', minute: '2-digit' });
        return `
            <a class="up-item dashboard-event-link${live ? ' is-live' : ''}" href="/app/calendar?date=${key}">
                <span class="up-time"><strong>${time}</strong><small>${escapeDashboardHtml(day)}</small></span>
                <span class="up-info">
                    <strong dir="auto">${escapeDashboardHtml(event.title || 'Séance')}</strong>
                    <small dir="auto">${escapeDashboardHtml(event.course?.title || event.course_title || 'Séance live')}</small>
                </span>
                ${live ? '<span class="up-live">En direct</span>' : '<span class="up-icon" aria-hidden="true"><i class="fas fa-video"></i></span>'}
            </a>`;
    }).join('');
}

function loadReplays() {
    const list = document.getElementById('replay-list');
    if (!list) return;
    fetchDashboardData('/api/live/replays', replays => {
        dashboardSessions.replays = Array.isArray(replays) ? replays : [];
        renderMiniCalendar();
        if (!dashboardSessions.replays.length) {
            list.innerHTML = '<div class="dash-empty">Les enregistrements publiés par ton enseignant apparaîtront ici.</div>';
            return;
        }
        list.innerHTML = dashboardSessions.replays.slice(0, 3).map(replay => {
            const href = replay.course_id ? '/app/course-details?' + new URLSearchParams({ id: replay.course_id, replay: replay.id })
                : '/app/calendar?' + new URLSearchParams({ replay: replay.id });
            const date = new Date(replay.scheduled_at).toLocaleDateString('fr-FR', { timeZone: DASH_TZ, day: 'numeric', month: 'short' });
            return `
            <a class="up-item replay-item dashboard-course-link" href="${href}">
                <span class="replay-play" aria-hidden="true"><i class="fas fa-play"></i></span>
                <span class="up-info">
                    <strong dir="auto">${escapeDashboardHtml(replay.title || 'Replay')}</strong>
                    <small dir="auto">${escapeDashboardHtml(replay.course?.title || 'Formation')} · ${escapeDashboardHtml(date)}</small>
                </span>
            </a>`;
        }).join('');
    }, () => {
        dashboardSessions.replays = [];
        renderMiniCalendar();
        list.innerHTML = '<div class="dash-empty">Impossible de charger les replays.</div>';
    });
}

// The live-session reminder already loads /api/live/upcoming on every page: reuse its data
// and fall back to a direct request only when it is unavailable.
async function fetchUpcomingSessions(callback, errorCallback) {
    if (window.syntaLiveReminders?.upcoming) {
        try {
            return callback(await window.syntaLiveReminders.upcoming());
        } catch { /* fall through to a direct request */ }
    }
    return fetchDashboardData('/api/live/upcoming', callback, errorCallback);
}

function loadEvents() {
    renderMiniCalendar();
    fetchUpcomingSessions((events) => {
        const sorted = (Array.isArray(events) ? events : [])
            .filter(event => Number.isFinite(Date.parse(event.scheduled_at)))
            .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
        dashboardSessions.upcoming = sorted;
        renderMiniCalendar();
        renderUpcomingList(sorted);
    }, () => {
        const eventsList = document.getElementById('events-list');
        if (eventsList) eventsList.innerHTML = '<div class="dash-empty">Connexion impossible. <button type="button" class="dash-retry" onclick="loadEvents()">Réessayer</button></div>';
    });
}

function navigateTo(page) {
    window.location.href = `/app/${page}`;
}

function navigateToCalendar(eventDate) {
    window.location.href = `/app/calendar?date=${eventDate}`;
}

function showContact() {
    window.location.href = '/#contact';
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
