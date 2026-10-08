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
            if (!hasReturnedCached && errorCallback) errorCallback(`HTTP Error: ${res.status}`);
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

function loadCoursePath() {
    fetchWithSWR(`/api/courses/user/my-courses?t=${Date.now()}`, 'swr_courses', async (courses) => {
        if (!courses || courses.length === 0) {
            document.querySelector('.level-info span').textContent = "Débutant";
            
            const continueSection = document.getElementById('continue-content-container');
            if (continueSection) {
                document.querySelector('.dashboard-container').classList.add('locked-mode');
                
                continueSection.innerHTML = `
                    <div class="locked-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 1.5rem; background: #fff7ed; padding: 2rem; border-radius: var(--radius-lg); border: 2px dashed #fdba74; cursor: pointer; transition: all 0.3s ease; flex: 1; height: 100%; min-height: 250px;" onclick="window.location.href='/app/offers'" onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 25px rgba(249, 115, 22, 0.15)';" onmouseout="this.style.transform='none'; this.style.boxShadow='none';">
                        <div style="width: 80px; height: 80px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: var(--orange-primary); box-shadow: 0 4px 15px rgba(249, 115, 22, 0.15);">
                            🔒
                        </div>
                        <div>
                            <h4 style="margin: 0 0 0.5rem; color: #1e293b; font-size: 1.3rem; font-weight: 800;">Programme Verrouillé</h4>
                            <p style="margin: 0; color: var(--text-muted); font-size: 1rem; max-width: 300px;">Tu n'as pas encore d'offre active. Débloque ton plein potentiel dès maintenant !</p>
                        </div>
                        <button class="btn-primary" style="padding: 0.75rem 1.5rem; font-size: 1rem; margin-top: 0.5rem;">Découvrir les offres &rarr;</button>
                    </div>
                `;
            }
            
            const pathSection = document.getElementById('path-section');
            if (pathSection) pathSection.style.display = 'none';
            
            return;
        }
        
        const activeCourse = courses.find(c => c.progress < 100) || courses[0];
        document.querySelector('.level-info span').textContent = activeCourse.title || "Apprenti";
        
        const continueSection = document.getElementById('continue-content-container');
        const emojiMap = { 'informatique': '💻', 'algorithmique': '🧭', 'python': '🐍', 'math': '📐' };
        const cat = (activeCourse.category || '').toLowerCase();
        let icon = '📚';
        for (const key in emojiMap) {
            if (cat.includes(key) || (activeCourse.title && activeCourse.title.toLowerCase().includes(key))) icon = emojiMap[key];
        }

        continueSection.innerHTML = `
            <div class="course-logo">${icon}</div>
            <div class="course-details">
                <h4>${activeCourse.title}</h4>
                <p>${activeCourse.category || 'Formation'}</p>
                <span class="chapter-badge">Progression globale</span>
                <div class="course-progress-container">
                    <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${activeCourse.progress}%;"></div></div>
                    <span class="course-progress-text">${activeCourse.progress}%</span>
                </div>
            </div>
            <button class="btn-primary" onclick="window.location.href='/app/course-details?id=${activeCourse.course_id}'">Continuer &rarr;</button>
        `;

        fetchWithSWR(`/api/courses/${activeCourse.course_id}?t=${Date.now()}`, `swr_course_${activeCourse.course_id}`, (courseDetails) => {
            const pathSection = document.getElementById('path-section');
            pathSection.querySelector('.path-title').textContent = activeCourse.title;
            pathSection.querySelector('.path-progress-text').textContent = `${activeCourse.progress}% complété`;
            
            const modules = courseDetails.modules || [];
            if (modules.length === 0) return;
            
            const totalModules = modules.length;
            const completedIndex = Math.floor((activeCourse.progress / 100) * totalModules);
            
            const stepperTrack = pathSection.querySelector('.stepper-track');
            let html = `<div class="stepper-line"><div class="stepper-line-fill" style="width: ${activeCourse.progress}%;"></div></div>`;
            
            modules.forEach((mod, index) => {
                let statusClass = '';
                let iconHtml = index < completedIndex ? '✓' : index === completedIndex ? '📍' : (index + 1);
                if (index < completedIndex) statusClass = 'completed';
                else if (index === completedIndex) statusClass = 'current';
                
                let shortName = mod.title;
                if (shortName.length > 15) shortName = shortName.substring(0, 12) + '...';
                
                html += `
                    <div class="step ${statusClass}">
                        <div class="step-circle">${iconHtml}</div>
                        <span>${shortName}</span>
                    </div>
                `;
            });
            
            stepperTrack.innerHTML = html;
        }, (err) => {
            document.querySelector('.stepper-track').innerHTML = `<div style="color:#ef4444; font-size:0.8rem;">Erreur de chargement. <a href="#" onclick="loadCoursePath(); return false;">Réessayer</a></div>`;
        });
    }, (err) => {
        const continueSection = document.getElementById('continue-content-container');
        continueSection.innerHTML = `
            <div style="padding:1rem; text-align:center; color:#ef4444; background:#fef2f2; border-radius:12px; width:100%;">
                <p style="margin-bottom:0.5rem; font-weight:600;">Connexion impossible</p>
                <button class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; background: #ef4444;" onclick="loadCoursePath()">Réessayer</button>
            </div>
        `;
    });
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
