// Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
});

async function initializeDashboard() {
    try {
        // Wait for authentication to initialize
        let attempts = 0;
        const maxAttempts = 20; // Increased attempts for slower connections
        
        while (!window.auth && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.auth) {
            console.error('Authentication not initialized');
            showMessage('Erreur de chargement du système d\'authentification. Veuillez actualiser la page.', 'error');
            return;
        }
        
        // Check authentication
        const authResult = await window.auth.getCurrentUser();
        if (!authResult.success || !authResult.user) {
            showMessage('Veuillez vous connecter pour accéder au tableau de bord', 'error');
            setTimeout(() => {
                window.location.href = '../auth/login.html';
            }, 2000);
            return;
        }

        // Load user data
        await loadUserData(authResult.user);
        
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
    try {
        const eventsList = document.getElementById('events-list');
        
        // Check if events data is available from events.js
        if (typeof upcomingEvents === 'undefined' || !Array.isArray(upcomingEvents)) {
            console.error('upcomingEvents not found. Make sure events.js is loaded.');
            eventsList.innerHTML = '<div class="loading">Erreur de chargement des événements</div>';
            return;
        }
        
        // Filter events that haven't passed yet
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const activeEvents = upcomingEvents.filter(event => {
            const eventDate = new Date(event.date);
            return eventDate >= today;
        });
        
        if (activeEvents.length === 0) {
            eventsList.innerHTML = '<div class="event-item">Aucun événement à venir</div>';
            return;
        }
        
        eventsList.innerHTML = activeEvents.map(event => {
            // Format date to French
            const eventDate = new Date(event.date);
            const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
            const dateString = `${eventDate.getDate()} ${monthNames[eventDate.getMonth()]}`;
            
            return `
                <div class="event-item" style="border-right: 3px solid ${event.color}; cursor: pointer;" onclick="navigateToCalendar('${event.date}')">
                    <div class="event-date">${event.icon} ${dateString} - ${event.time}</div>
                    <div class="event-title">${event.title}</div>
                    <div class="event-description">${event.description}</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading events:', error);
        document.getElementById('events-list').innerHTML = '<div class="loading">Erreur de chargement des événements</div>';
    }
}

function navigateTo(page) {
    // This function will be called from the parent iframe
    if (window.parent && window.parent.loadPage) {
        window.parent.loadPage(page);
    } else {
        // Fallback for direct navigation
        window.location.href = `../${page}/${page}.html`;
    }
}

function navigateToCalendar(eventDate) {
    // Navigate to calendar page with the event date
    if (window.parent && window.parent.loadPageWithDate) {
        // If in iframe, use special function for calendar with date
        window.parent.loadPageWithDate('calendar', eventDate);
    } else if (window.parent && window.parent.loadPage) {
        // If function doesn't exist yet, load calendar normally and store date
        sessionStorage.setItem('calendarDate', eventDate);
        window.parent.loadPage('calendar');
    } else {
        // Direct navigation fallback
        window.location.href = `../calendar/calendar.html?date=${eventDate}`;
    }
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
`;
document.head.appendChild(style); 
