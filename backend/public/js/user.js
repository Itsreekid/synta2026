// User Page JavaScript

document.addEventListener('DOMContentLoaded', function () {
    // Note: Authentication is handled server-side. 
    // User balance is pre-rendered in HTML by EJS.
    
    // Update notification badge with event count
    updateNotificationBadge();

    // Set up iframe resize listener
    setupIframeResize();

    // Close mobile menu when clicking outside
    document.addEventListener('click', function (event) {
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.querySelector('.mobile-menu-toggle');
        const profileDropdown = document.getElementById('profileDropdown');
        const profilePicture = document.querySelector('.profile-picture');
        const notificationDropdown = document.getElementById('notificationDropdown');
        const notificationIcon = document.querySelector('.notification-icon');

        // Close sidebar if clicking outside
        if (sidebar && menuToggle &&
            !sidebar.contains(event.target) &&
            !menuToggle.contains(event.target) &&
            sidebar.classList.contains('active')) {
            closeMobileMenu();
        }

        // Close profile dropdown if clicking outside
        if (profileDropdown && profilePicture &&
            !profileDropdown.contains(event.target) &&
            !profilePicture.contains(event.target) &&
            profileDropdown.classList.contains('active')) {
            profileDropdown.classList.remove('active');
        }

        // Close notification dropdown if clicking outside
        if (notificationDropdown && notificationIcon &&
            !notificationDropdown.contains(event.target) &&
            !notificationIcon.contains(event.target) &&
            notificationDropdown.classList.contains('active')) {
            notificationDropdown.classList.remove('active');
        }
    });
});



// Toggle profile dropdown
function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Toggle notifications
function toggleNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');

        // Load events if dropdown is being opened
        if (dropdown.classList.contains('active')) {
            loadUserNotifications();
        }
    }
}

// Fetch and update unread notification badge
async function updateNotificationBadge() {
    const badge = document.getElementById('notificationCount');
    if (!badge) return;

    try {
        const res = await fetch('/api/user/notifications', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const unreadCount = data.notifications.filter(n => !n.is_read).length;
        
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    } catch (error) {
        console.error('Error fetching unread notifications:', error);
    }
}

// Load notifications into dropdown
async function loadUserNotifications() {
    const eventsList = document.getElementById('notificationEventsList');
    if (!eventsList) return;

    eventsList.innerHTML = '<div class="loading" style="padding: 1rem; text-align: center;">Chargement...</div>';

    try {
        const res = await fetch('/api/user/notifications', { credentials: 'include' });
        if (!res.ok) throw new Error('Network error');
        const data = await res.json();
        const notifications = data.notifications;

        if (notifications.length === 0) {
            eventsList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #64748b;">Aucune notification</div>';
            return;
        }

        eventsList.innerHTML = notifications.map(notif => {
            const date = new Date(notif.created_at);
            const timeStr = date.toLocaleDateString() + ' à ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const isUnread = !notif.is_read;
            const bgClass = isUnread ? 'style="background: #fff7ed;"' : '';
            
            return `
                <div class="notification-event-item" ${bgClass} onclick="markNotificationRead('${notif.id}', '${notif.link || ''}')">
                    <div class="event-icon">${notif.type === 'success' ? '🎉' : notif.type === 'warning' ? '⚠️' : '💡'}</div>
                    <div class="event-info">
                        <div class="event-title" style="font-weight: ${isUnread ? '700' : '500'}; color: #1e293b;">${notif.title}</div>
                        <div class="event-time" style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">${notif.message}</div>
                        <div class="event-time" style="font-size: 0.7rem; color: #94a3b8; margin-top: 4px;">${timeStr}</div>
                    </div>
                    ${isUnread ? '<div style="width:8px;height:8px;border-radius:50%;background:#f97316;"></div>' : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        eventsList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #ef4444;">Erreur de chargement</div>';
    }
}

async function markNotificationRead(id, link) {
    try {
        await fetch(`/api/user/notifications/${id}/read`, { method: 'POST', credentials: 'include' });
        updateNotificationBadge();
        if (link && link !== 'null' && link !== '') {
            window.location.href = link;
        } else {
            loadUserNotifications();
        }
    } catch (err) {
        console.error(err);
    }
}

// Toggle mobile menu
function toggleMobileMenu() {
    const sidebar = document.getElementById('app-sidebar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const overlay = document.getElementById('sidebar-overlay');

    if(sidebar) sidebar.classList.toggle('active');
    if(menuToggle) menuToggle.classList.toggle('active');
    if(overlay) overlay.classList.toggle('active');
}

// Close mobile menu
function closeMobileMenu() {
    const sidebar = document.getElementById('app-sidebar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        if(menuToggle) menuToggle.classList.remove('active');
        if(overlay) overlay.classList.remove('active');
    }
}

// Load page and close sidebar on mobile
function loadPageAndCloseSidebar(pageName) {
    loadPage(pageName);
    closeMobileMenu();
}


// Page navigation function
function loadPage(pageName) {
    const iframe = document.querySelector('iframe[name="Principal"]');
    if (!iframe) return;

    // Show loading state
    iframe.classList.add('loading');

    // Update navigation active state
    updateActiveNavigation(pageName);

    // Load the page in iframe
    const pagePath = `pages/${pageName}/${pageName}.html`;
    iframe.src = pagePath;

    // Remove loading state after iframe loads
    iframe.onload = function () {
        iframe.classList.remove('loading');
    };
}

// Page navigation function with date parameter
function loadPageWithDate(pageName, date) {
    const iframe = document.querySelector('iframe[name="Principal"]');
    if (!iframe) return;

    // Show loading state
    iframe.classList.add('loading');

    // Update navigation active state
    updateActiveNavigation(pageName);

    // Load the page in iframe with date parameter
    const pagePath = `pages/${pageName}/${pageName}.html?date=${date}`;
    iframe.src = pagePath;

    // Remove loading state after iframe loads
    iframe.onload = function () {
        iframe.classList.remove('loading');
    };
}

// Update active navigation link
function updateActiveNavigation(pageName) {
    // Remove active class from all links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });

    // Add active class to clicked link - updated to match new onclick pattern
    const activeLink = document.querySelector(`[onclick*="'${pageName}'"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}



// Logout function
async function logout() {
    try {
        if (window.auth) {
            const result = await window.auth.signOut();
            if (result.success) {
                showAuthMessage('تم تسجيل الخروج بنجاح...');
                setTimeout(() => {
                    redirectToLogin();
                }, 2000);
            } else {
                console.error('Logout failed:', result.error);
                showAuthMessage('حدث خطأ أثناء تسجيل الخروج. يرجى المحاولة مرة أخرى.');
            }
        } else {
            // If auth is not available, just redirect
            redirectToLogin();
        }
    } catch (error) {
        console.error('Logout error:', error);
        showAuthMessage('حدث خطأ أثناء تسجيل الخروج. يرجى المحاولة مرة أخرى.');
    }
}

// Redirect to login page
function redirectToLogin() {
    window.location.href = '/login';
}

// Show authentication message
function showAuthMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 123, 26, 0.9);
        color: white;
        padding: 20px 30px;
        border-radius: 10px;
        font-family: 'Tajawal', sans-serif;
        font-size: 16px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        text-align: center;
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    // Auto remove after 3 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 3000);
}

// Setup iframe resize functionality
function setupIframeResize() {
    const iframe = document.querySelector('iframe[name="Principal"]');
    if (!iframe) return;

    let resizeObserver = null;

    // Resize iframe on load and setup ResizeObserver
    iframe.addEventListener('load', function () {
        resizeIframe();

        // Dynamically monitor height changes inside the iframe content document body
        try {
            if (iframe.contentWindow && iframe.contentWindow.document && iframe.contentWindow.document.body) {
                if (resizeObserver) {
                    resizeObserver.disconnect();
                }

                resizeObserver = new ResizeObserver(() => {
                    resizeIframe();
                });

                resizeObserver.observe(iframe.contentWindow.document.body);
            }
        } catch (e) {
            console.log('Cannot observe iframe body (cross-origin restriction or page loading):', e);
        }
    });

    // Resize iframe when parent window resizes
    window.addEventListener('resize', function () {
        resizeIframe();
    });
}

// Resize iframe to fit content
function resizeIframe() {
    const iframe = document.querySelector('iframe[name="Principal"]');
    if (!iframe || !iframe.contentWindow) return;

    try {
        // Get the height of the content inside the iframe
        const height = iframe.contentWindow.document.body.scrollHeight;
        if (height > 0) {
            iframe.style.height = height + 'px';
        }
    } catch (e) {
        // Cross-origin restriction or other error
        console.log('Cannot access iframe content (cross-origin restriction)');
    }
}

// Global functions for iframe communication (called from iframe content)
window.loadPage = loadPage;
window.loadPageWithDate = loadPageWithDate;
window.logout = logout;
window.resizeIframe = resizeIframe; 
