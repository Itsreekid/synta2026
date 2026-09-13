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
        // Load stats
        await loadStats();

        // Load recent activity
        await loadRecentActivity();

        // Load progress
        await loadProgress();

        // Load events
        await loadEvents();

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

async function loadStats() {
    try {
        // Simulate loading stats from database
        const stats = {
            completedCourses: 0,
            overallProgress: 0,
            achievements: 0,
            activeDays: 0
        };

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

        const activeDaysEl = document.getElementById('active-days');
        if (activeDaysEl) {
            activeDaysEl.textContent = stats.activeDays;
        }

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadRecentActivity() {
    try {
        const activityList = document.getElementById('activity-list');

        // Simulate activity data
        const activities = [
            {
                icon: '🎮',
                title: 'Leçon complétée dans le jeu Python',
                description: 'Il y a 2 heures',
                color: '#ff7b1a'
            },
            {
                icon: '📚',
                title: 'Inscrit à un nouveau cours',
                description: 'Hier',
                color: '#28a745'
            },
            {
                icon: '🏆',
                title: 'Nouvelle réalisation obtenue',
                description: 'Il y a 2 jours',
                color: '#ffc107'
            },
            {
                icon: '📝',
                title: 'Test complété',
                description: 'Il y a 3 jours',
                color: '#007bff'
            }
        ];

        activityList.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon" style="background: ${activity.color}">
                    ${activity.icon}
                </div>
                <div class="activity-content">
                    <h4>${activity.title}</h4>
                    <p>${activity.description}</p>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading activity:', error);
        document.getElementById('activity-list').innerHTML = '<div class="loading">Erreur de chargement de l\'activité</div>';
    }
}

async function loadProgress() {
    try {
        const progressList = document.getElementById('progress-list');

        // Simulate progress data
        const progressData = [
            { title: 'Cours Python de base', percentage: 0 },
            { title: 'Cours Excel avancé', percentage: 0 },
            { title: 'Cours Algorithmes', percentage: 0 },
            { title: 'Cours Bases de données', percentage: 0 }
        ];

        progressList.innerHTML = progressData.map(progress => `
            <div class="progress-item">
                <div class="progress-header">
                    <span class="progress-title">${progress.title}</span>
                    <span class="progress-percentage">${progress.percentage}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress.percentage}%"></div>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading progress:', error);
        document.getElementById('progress-list').innerHTML = '<div class="loading">Erreur de chargement du progrès</div>';
    }
}

async function loadEvents() {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;

    try {
        eventsList.innerHTML = '<div class="loading">Chargement des événements...</div>';

        const res = await fetch('/api/live/upcoming', { credentials: 'include' });

        if (!res.ok) {
            eventsList.innerHTML = '<div class="event-item">Aucun événement à venir</div>';
            return;
        }

        const events = await res.json();

        if (!Array.isArray(events) || events.length === 0) {
            eventsList.innerHTML = '<div class="event-item">Aucun événement à venir</div>';
            return;
        }

        const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                            'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

        eventsList.innerHTML = events.map(event => {
            const d = new Date(event.scheduled_at);
            const dateString = `${d.getDate()} ${monthNames[d.getMonth()]}`;
            const timeString = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const isLive = event.status === 'live';

            return `
                <div class="event-item" style="border-right: 3px solid #6c63ff; cursor: pointer;"
                     onclick="window.location.href='/app/calendar'">
                    <div class="event-date">📅 ${dateString} - ${timeString}</div>
                    <div class="event-title" style="display: flex; align-items: center; gap: 12px;">
                        ${event.title}
                        ${isLive ? '<span class="live-indicator">🔴 En direct</span>' : ''}
                    </div>
                    <div class="event-description">${event.course_title || ''}</div>
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
