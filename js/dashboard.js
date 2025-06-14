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
            showMessage('خطأ في تحميل نظام المصادقة. يرجى تحديث الصفحة.', 'error');
            return;
        }
        
        // Check authentication
        const authResult = await window.auth.getCurrentUser();
        if (!authResult.success || !authResult.user) {
            showMessage('يرجى تسجيل الدخول للوصول إلى لوحة التحكم', 'error');
            setTimeout(() => {
                window.location.href = '../auth/login.html';
            }, 2000);
            return;
        }

        // Load user data
        await loadUserData(authResult.user);
        
        // Load dashboard data
        await loadDashboardData();
        
        // Update time
        updateTime();
        setInterval(updateTime, 1000);
        
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showMessage('حدث خطأ في تحميل البيانات', 'error');
    }
}

async function loadUserData(user) {
    try {
        // Update user info
        const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'المستخدم';
        const userEmail = user.email || 'غير متوفر';
        
        document.getElementById('user-name').textContent = userName;
        document.getElementById('user-email').textContent = userEmail;
        
        // Update avatar
        const avatar = document.getElementById('user-avatar');
        if (userName && userName.length > 0) {
            avatar.textContent = userName.charAt(0).toUpperCase();
        }
        
        // Update date
        updateDate();
        
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
        
        document.getElementById('completed-courses').textContent = stats.completedCourses;
        document.getElementById('overall-progress').textContent = stats.overallProgress + '%';
        document.getElementById('achievements').textContent = stats.achievements;
        document.getElementById('active-days').textContent = stats.activeDays;
        
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
                title: 'أكملت درس في لعبة البايثون',
                description: 'قبل ساعتين',
                color: '#ff7b1a'
            },
            {
                icon: '📚',
                title: 'سجلت في دورة جديدة',
                description: 'أمس',
                color: '#28a745'
            },
            {
                icon: '🏆',
                title: 'حصلت على إنجاز جديد',
                description: 'قبل يومين',
                color: '#ffc107'
            },
            {
                icon: '📝',
                title: 'أكملت اختبار',
                description: 'قبل 3 أيام',
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
        document.getElementById('activity-list').innerHTML = '<div class="loading">خطأ في تحميل النشاط</div>';
    }
}

async function loadProgress() {
    try {
        const progressList = document.getElementById('progress-list');
        
        // Simulate progress data
        const progressData = [
            { title: 'دورة البايثون الأساسية', percentage: 0 },
            { title: 'دورة Excel المتقدمة', percentage: 0 },
            { title: 'دورة الخوارزميات', percentage: 0 },
            { title: 'دورة قواعد البيانات', percentage: 0 }
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
        document.getElementById('progress-list').innerHTML = '<div class="loading">خطأ في تحميل التقدم</div>';
    }
}

async function loadEvents() {
    try {
        const eventsList = document.getElementById('events-list');
        
        // Simulate events data
        const events = [
            {
                date: '15 يناير',
                title: 'ورشة عمل البايثون',
                description: 'ورشة تفاعلية لتعلم أساسيات البايثون'
            },
            {
                date: '20 يناير',
                title: 'مسابقة البرمجة',
                description: 'مسابقة شهرية لحل المشاكل البرمجية'
            },
            {
                date: '25 يناير',
                title: 'محاضرة Excel',
                description: 'محاضرة مجانية عن Excel المتقدم'
            }
        ];
        
        eventsList.innerHTML = events.map(event => `
            <div class="event-item">
                <div class="event-date">${event.date}</div>
                <div class="event-title">${event.title}</div>
                <div class="event-description">${event.description}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading events:', error);
        document.getElementById('events-list').innerHTML = '<div class="loading">خطأ في تحميل الأحداث</div>';
    }
}

function updateTime() {
    // Set specific time: 6:20 PM in Arabic format with regular numerals
    const timeString = '6:20 م';
    document.getElementById('current-time').textContent = timeString;
}

function updateDate() {
    // Set specific date: 16 ذو الحجة 1446 هـ (6/12/2025) in Arabic format with regular numerals
    const dateString = '16 ذو الحجة 1446 هـ';
    document.getElementById('current-date').textContent = dateString;
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
