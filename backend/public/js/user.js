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
            loadNotificationEvents();
        }
    }
}

// Update notification badge with event count
async function updateNotificationBadge() {
    const badge = document.getElementById('notificationCount');
    if (!badge) return;

    const events = await getFilteredEvents();
    const eventCount = events.length;
    badge.textContent = eventCount;
    badge.style.display = eventCount > 0 ? 'flex' : 'none';
}

// Helper to filter events based on user targeting
async function getFilteredEvents() {
    if (typeof upcomingEvents === 'undefined' || !Array.isArray(upcomingEvents)) return [];

    // Get user from auth if available
    let userClass = null;
    let userBranch = null;

    if (window.auth) {
        try {
            const result = await window.auth.getCurrentUser();
            if (result.success && result.user) {
                userClass = result.user.user_metadata?.user_class;
                userBranch = result.user.user_metadata?.user_branch;
            }
        } catch (error) {
            console.error('Error getting user for filtering:', error);
        }
    }

    return upcomingEvents.filter(event => {
        const matchesClass = !event.target_classes ||
            event.target_classes.length === 0 ||
            event.target_classes.includes('all') ||
            (userClass && event.target_classes.includes(userClass));

        const matchesBranch = !event.target_branches ||
            event.target_branches.length === 0 ||
            event.target_branches.includes('all') ||
            (userBranch && event.target_branches.includes(userBranch));

        return matchesClass && matchesBranch;
    });
}

// Load events into notification dropdown
async function loadNotificationEvents() {
    const eventsList = document.getElementById('notificationEventsList');
    if (!eventsList) return;

    const events = await getFilteredEvents();

    // Check if events are available
    if (events.length === 0) {
        eventsList.innerHTML = '<div class="no-events">Aucun événement à venir</div>';
        return;
    }

    // Generate event items
    eventsList.innerHTML = events.map(event => {
        return `
            <div class="notification-event-item">
                <div class="event-icon">${event.icon || '📅'}</div>
                <div class="event-info">
                    <div class="event-title">${event.title}</div>
                    <div class="event-time">${event.time}</div>
                </div>
            </div>
        `;
    }).join('');
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
