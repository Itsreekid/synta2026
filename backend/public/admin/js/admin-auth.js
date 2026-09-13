/**
 * Admin Authentication & Authorization
 */

async function checkAdminAccess() {
    try {
        // 1. Wait for auth system
        let attempts = 0;
        while (!window.auth && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (!window.auth) {
            console.error('Auth system not found');
            window.location.href = 'login.html';
            return;
        }

        // 2. Check if logged in
        const result = await window.auth.getCurrentUser();
        if (!result.success || !result.user) {
            console.log('Not logged in, redirecting to login');
            window.location.href = 'login.html';
            return;
        }

        // 3. Verify admin role
        const role = result.user.role || 'student';
        if (role !== 'admin') {
            console.warn('Access denied: User is not an admin');
            // Redirect to main site
            window.location.href = '../user.html';
            return;
        }

        console.log('Admin access verified');
        return result.user;

    } catch (error) {
        console.error('Error verifying admin access:', error);
        window.location.href = 'login.html';
    }
}

// Global logout for admin
async function adminLogout() {
    if (window.auth) {
        await window.auth.signOut();
        window.location.href = 'login.html';
    }
}
