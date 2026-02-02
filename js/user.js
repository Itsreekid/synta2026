// User Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Check authentication on page load
    checkAuthentication();
    
    // Load user balance from database
    loadUserBalance();
    
    // Set up iframe resize listener
    setupIframeResize();

    // Close mobile menu when clicking outside
    document.addEventListener('click', function(event) {
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

// Load user balance from Supabase
async function loadUserBalance() {
    try {
        // Wait for Supabase client to be initialized
        let attempts = 0;
        const maxAttempts = 20;
        
        while (!window.supabaseClient && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.supabaseClient) {
            console.error('Supabase client not initialized after waiting');
            return;
        }
        
        // Get current user
        const { data: { user }, error: userError } = await window.supabaseClient.auth.getUser();
        
        if (userError || !user) {
            console.error('Error getting user:', userError);
            return;
        }
        
        console.log('Fetching balance for user:', user.id);
        
        // Fetch user balance from Users table (note: capital U)
        const { data, error } = await window.supabaseClient
            .from('Users')
            .select('balance')
            .eq('id', user.id)
            .single();
        
        if (error) {
            console.error('Error fetching balance:', error);
            console.error('Error details:', error.message, error.code, error.hint);
            console.error('Full error:', JSON.stringify(error, null, 2));
            
            // Show helpful message if it's a permission error
            if (error.code === 'PGRST116' || error.message?.includes('policy')) {
                console.error('⚠️ PERMISSION ERROR: RLS policy may be blocking access to Users table.');
                console.error('Please run the fix-users-rls.sql file in your Supabase SQL Editor.');
            }
            return;
        }
        
        console.log('Balance data received:', data);
        
        // Update the balance display
        const balanceElement = document.getElementById('userBalance');
        if (balanceElement) {
            if (data && typeof data.balance !== 'undefined') {
                const balance = data.balance || 0;
                balanceElement.textContent = balance.toFixed(2);
                console.log('✅ Balance loaded successfully:', balance);
            } else {
                console.warn('No balance data found, keeping default 0.00');
            }
        } else {
            console.error('Balance element not found in DOM');
        }
        
    } catch (error) {
        console.error('Error loading user balance:', error);
    }
}

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

// Load events into notification dropdown
function loadNotificationEvents() {
    const eventsList = document.getElementById('notificationEventsList');
    if (!eventsList) return;
    
    // Check if events are available
    if (typeof upcomingEvents === 'undefined' || upcomingEvents.length === 0) {
        eventsList.innerHTML = '<div class="no-events">Aucun événement à venir</div>';
        return;
    }
    
    // Generate event items
    eventsList.innerHTML = upcomingEvents.map(event => {
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
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    
    sidebar.classList.toggle('active');
    menuToggle.classList.toggle('active');
}

// Close mobile menu
function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    
    if (sidebar && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        menuToggle.classList.remove('active');
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
    iframe.onload = function() {
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
    iframe.onload = function() {
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

// Authentication check
async function checkAuthentication() {
    try {
        // Wait for authentication to initialize
        let attempts = 0;
        const maxAttempts = 10;
        
        while (!window.auth && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.auth) {
            console.error('Authentication not initialized');
            redirectToLogin();
            return;
        }
        
        // Check if user is authenticated
        const isAuth = await window.auth.isAuthenticated();
        console.log('Authentication status:', isAuth);
        
        if (!isAuth) {
            console.log('User not authenticated, redirecting to login...');
            showAuthMessage('يرجى تسجيل الدخول للوصول إلى هذه الصفحة...');
            setTimeout(() => {
                redirectToLogin();
            }, 2000);
            return;
        }
        
        // User is authenticated, load user data
        try {
            const authResult = await window.auth.getCurrentUser();
            if (authResult.success && authResult.user) {
                console.log('User authenticated:', authResult.user.email);
                // Update welcome message with user's name if needed
                updateUserInfo(authResult.user);
            }
        } catch (error) {
            console.error('Error getting user data:', error);
        }
        
    } catch (error) {
        console.error('Authentication check error:', error);
        redirectToLogin();
    }
}

// Update user information
function updateUserInfo(user) {
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'المستخدم';
    
    // Update any user-specific elements on the page
    const welcomeElements = document.querySelectorAll('.welcome-name, .user-name');
    welcomeElements.forEach(element => {
        element.textContent = displayName;
    });
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
    window.location.href = '../index.html';
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
    
    // Resize iframe on load
    iframe.addEventListener('load', function() {
        resizeIframe();
    });
    
    // Resize iframe when window resizes
    window.addEventListener('resize', function() {
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

// Global function for iframe navigation (called from iframe content)
window.loadPage = loadPage;
window.loadPageWithDate = loadPageWithDate;

// Global function for logout (called from iframe content)
window.logout = logout; 
