// Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function () {
    initializeDashboard();
});

async function initializeDashboard() {
    try {
        // NOTE: Server-side requireAuth already guards this page.
        // If the user is not logged in, Express redirects to /login
        // before this JS ever runs. No client-side auth check needed.

        // Load dashboard data
        await loadDashboardData();

    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showMessage('Une erreur est survenue lors du chargement des données', 'error');
    }
}

async function loadUserData(user) {
    try {
        // Update user info
        const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Utilisateur';
        const userEmail = user.email || 'Non disponible';

        const userNameEl = document.getElementById('user-name');
        if (userNameEl) {
            userNameEl.textContent = userName;
        }

        const userEmailEl = document.getElementById('user-email');
        if (userEmailEl) {
            userEmailEl.textContent = userEmail;
        }

        // Update avatar
        const avatar = document.getElementById('user-avatar');
        if (avatar && userName && userName.length > 0) {
            avatar.textContent = userName.charAt(0).toUpperCase();
        }

    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

async function loadDashboardData() {
    try {
        await Promise.all([
            loadStats(),
            loadEvents(),
            loadCoursePath()
        ]);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

async function loadStats() {
    try {
        const res = await fetch(`/api/user/stats?t=${Date.now()}`, { credentials: 'include' });
        if (!res.ok) return;
        const stats = await res.json();

        const completedEl = document.getElementById('completed-courses');
        if (completedEl) {
            completedEl.textContent = stats.completedCourses;
        }

        const progressEl = document.getElementById('overall-progress');
        if (progressEl) {
            progressEl.textContent = stats.overallProgress + '%';
        }

        const achievementsEl = document.getElementById('achievements');
        if (achievementsEl) {
            achievementsEl.textContent = stats.achievements;
        }

        // Calculate XP (10 XP per completed lesson/quiz/code practice)
        // 100 XP = 1 Level
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

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadCoursePath() {
    try {
        const res = await fetch(`/api/courses/user/my-courses?t=${Date.now()}`, { credentials: 'include' });
        if (!res.ok) return;
        const courses = await res.json();
        
        if (!courses || courses.length === 0) {
            document.getElementById('continue-section').style.display = 'none';
            document.getElementById('path-section').style.display = 'none';
            document.querySelector('.level-info span').textContent = "Débutant";
            return;
        }
        
        // Get most recent active course
        const activeCourse = courses.find(c => c.progress < 100) || courses[0];
        document.querySelector('.level-info span').textContent = activeCourse.title || "Apprenti";
        
        // UPDATE CONTINUE CARD
        const continueSection = document.getElementById('continue-section');
        continueSection.querySelector('h4').textContent = activeCourse.title;
        continueSection.querySelector('p').textContent = activeCourse.category || 'Formation';
        continueSection.querySelector('.chapter-badge').textContent = 'Progression globale';
        continueSection.querySelector('.course-progress-text').textContent = `${activeCourse.progress}%`;
        continueSection.querySelector('.progress-bar-fill').style.width = `${activeCourse.progress}%`;
        continueSection.querySelector('.btn-primary').onclick = () => window.location.href = `/app/courses/${activeCourse.course_id}`;
        
        const emojiMap = { 'informatique': '💻', 'algorithmique': '🧭', 'python': '🐍', 'math': '📐' };
        const cat = (activeCourse.category || '').toLowerCase();
        let icon = '📚';
        for (const key in emojiMap) {
            if (cat.includes(key) || (activeCourse.title && activeCourse.title.toLowerCase().includes(key))) icon = emojiMap[key];
        }
        continueSection.querySelector('.course-logo').textContent = icon;

        // FETCH MODULES FOR PATH
        const modRes = await fetch(`/api/courses/${activeCourse.course_id}?t=${Date.now()}`);
        if (!modRes.ok) return;
        const courseDetails = await modRes.json();
        
        const pathSection = document.getElementById('path-section');
        pathSection.querySelector('.path-title').textContent = activeCourse.title;
        pathSection.querySelector('.path-progress-text').textContent = `${activeCourse.progress}% complété`;
        
        // Calculate module completions based on progress ratio
        const modules = courseDetails.modules || [];
        if (modules.length === 0) return;
        
        const totalModules = modules.length;
        const completedIndex = Math.floor((activeCourse.progress / 100) * totalModules);
        
        const stepperTrack = pathSection.querySelector('.stepper-track');
        let html = `<div class="stepper-line"><div class="stepper-line-fill" style="width: ${activeCourse.progress}%;"></div></div>`;
        
        modules.forEach((mod, index) => {
            let statusClass = '';
            let iconHtml = '';
            if (index < completedIndex) {
                statusClass = 'completed';
                iconHtml = '✓';
            } else if (index === completedIndex) {
                statusClass = 'current';
                iconHtml = '📍';
            } else {
                iconHtml = index + 1;
            }
            
            // Extract a short name for the step
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

    } catch (error) {
        console.error('Error loading course path:', error);
    }
}

async function loadEvents() {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;

    try {
        eventsList.innerHTML = '<div class="loading">Chargement des événements...</div>';

        const res = await fetch(`/api/live/upcoming?t=${Date.now()}`, { credentials: 'include' });

        if (!res.ok) {
            eventsList.innerHTML = '<div class="event-item">Aucun événement à venir</div>';
            return;
        }

        const events = await res.json();

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

    } catch (error) {
        console.error('Error loading events:', error);
        eventsList.innerHTML = '<div class="event-item">Aucun événement à venir</div>';
    }
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
