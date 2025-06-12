// User Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Check authentication on page load
    checkAuthentication();
    
    // Set up iframe resize listener
    setupIframeResize();
});

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

// Update active navigation link
function updateActiveNavigation(pageName) {
    // Remove active class from all links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });
    
    // Add active class to clicked link
    const activeLink = document.querySelector(`[onclick="loadPage('${pageName}')"]`);
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

// Global function for logout (called from iframe content)
window.logout = logout; 
