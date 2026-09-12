// =====================================================
// PROFILE PAGE JAVASCRIPT
//
// The profile form fields are pre-populated server-side
// via EJS + the attachUserProfile middleware. This script:
//  1. Handles save (PATCH) operations via window.auth.updateProfile
//  2. Loads real stats from GET /api/user/stats
//  3. Updates the profile initial letter if needed
//
// The setTimeout polling loop and hardcoded-zero stats
// have been removed. All data flows from the server.
// =====================================================

document.addEventListener('DOMContentLoaded', function () {
    // Load real stats from the API
    loadUserStats();

    // Update the profile initial from the server-injected profile
    // (the EJS template already pre-populates #profile-initial, but
    // we re-check here in case the client resolves a fresher name)
    if (window.__SYNTA_PROFILE__) {
        updateProfileInitialFromState(window.__SYNTA_PROFILE__);
    }

    // Listen for auth hydration in case authentication.js fires late
    // (e.g. on a hard refresh where __SYNTA_PROFILE__ might be missing)
    document.addEventListener('appStateHydrated', function (e) {
        if (e.detail && !window.__SYNTA_PROFILE__) {
            updateProfileInitialFromState(e.detail);
            populateProfileFormFromState(e.detail);
        }
    }, { once: true });

    setupFormListeners();
});

// --------------------------------------------------
// Profile Initial
// --------------------------------------------------
function updateProfileInitialFromState(profileState) {
    const profileInitial = document.getElementById('profile-initial');
    if (!profileInitial) return;
    const displayName = profileState?.full_name || profileState?.email?.split('@')[0] || 'Utilisateur';
    profileInitial.textContent = displayName.charAt(0).toUpperCase();
}

// --------------------------------------------------
// Fallback Form Population
// Used only when the server-side profile was unavailable
// (edge case). Normally EJS handles this.
// --------------------------------------------------
function populateProfileFormFromState(profileState) {
    if (!profileState) return;

    const fullNameInput   = document.getElementById('full-name');
    const emailInput      = document.getElementById('email');
    const phoneInput      = document.getElementById('phone');
    const userClassSelect = document.getElementById('user-class');
    const userBranchSelect = document.getElementById('user-branch');

    if (fullNameInput   && !fullNameInput.value)   fullNameInput.value   = profileState.full_name   || profileState.user_metadata?.full_name   || '';
    if (emailInput      && !emailInput.value)       emailInput.value      = profileState.email       || '';
    if (phoneInput      && !phoneInput.value)       phoneInput.value      = profileState.phone       || profileState.user_metadata?.phone       || '';
    if (userClassSelect && !userClassSelect.value)  userClassSelect.value = profileState.user_class  || profileState.user_metadata?.user_class  || '';
    if (userBranchSelect && !userBranchSelect.value) userBranchSelect.value = profileState.user_branch || profileState.user_metadata?.user_branch || '';
}

// --------------------------------------------------
// Stats — Connected to real API
// --------------------------------------------------
async function loadUserStats() {
    try {
        const response = await fetch('/api/user/stats', { credentials: 'same-origin' });

        if (!response.ok) return; // Leave the EJS default "0" values in place

        const stats = await response.json();

        const completedEl = document.getElementById('completed-courses');
        const activeEl    = document.getElementById('active-courses');
        const achievEl    = document.getElementById('achievements');

        if (completedEl) completedEl.textContent = stats.completedCourses ?? 0;
        if (activeEl)    activeEl.textContent    = stats.activeCourses    ?? 0;
        if (achievEl)    achievEl.textContent    = stats.achievements     ?? 0;

        // learning-hours, earned-points, active-days are not returned
        // by the current API — they remain at their EJS default values.

    } catch (err) {
        // Non-fatal — stats remain at "0"
        console.warn('[Profile] Could not load stats:', err.message);
    }
}

// --------------------------------------------------
// Save Profile
// --------------------------------------------------
async function saveProfile() {
    const fullName  = document.getElementById('full-name')?.value.trim()  || '';
    const phone     = document.getElementById('phone')?.value.trim()      || '';
    const userClass = document.getElementById('user-class')?.value        || '';
    const userBranch = document.getElementById('user-branch')?.value      || '';

    if (!fullName) {
        showMessage('Le nom complet est requis', 'error');
        return;
    }

    const saveBtn = document.querySelector('.save-btn');
    const originalText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) {
        saveBtn.textContent = 'Enregistrement...';
        saveBtn.disabled = true;
    }

    try {
        if (!window.auth) {
            showMessage("Système d'authentification non disponible", 'error');
            return;
        }

        const updates = {
            full_name:   fullName,
            phone:       phone,
            user_class:  userClass,
            user_branch: userBranch
        };

        const result = await window.auth.updateProfile(updates);

        if (result.success) {
            showMessage('Modifications enregistrées avec succès!', 'success');
            updateProfileInitialFromState({ full_name: fullName });
        } else {
            showMessage("Erreur lors de l'enregistrement des modifications", 'error');
        }
    } catch (error) {
        console.error('[Profile] Error saving profile:', error);
        showMessage("Erreur lors de l'enregistrement des modifications", 'error');
    } finally {
        if (saveBtn) {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    }
}

// --------------------------------------------------
// Form Listeners
// --------------------------------------------------
function setupFormListeners() {
    const formInputs = document.querySelectorAll('.profile-form input, .profile-form select, .profile-form textarea');
    formInputs.forEach(input => {
        input.addEventListener('change', function () {
            // Reserved for future auto-save
        });
    });
}

// --------------------------------------------------
// Show Message (shared toast)
// Reuses the global showMessage from user.js if available,
// otherwise falls back to a local implementation.
// --------------------------------------------------
function showMessage(message, type = 'info') {
    if (window.showMessage && window.showMessage !== showMessage) {
        window.showMessage(message, type);
        return;
    }

    const existingMessages = document.querySelectorAll('.profile-message');
    existingMessages.forEach(msg => msg.remove());

    const messageDiv = document.createElement('div');
    messageDiv.className = `profile-message ${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        padding: 15px 20px; border-radius: 8px; color: white;
        font-family: 'Tajawal', sans-serif; z-index: 10000;
        max-width: 300px; animation: slideInRight 0.3s ease-out;
    `;

    switch (type) {
        case 'success': messageDiv.style.background = '#28a745'; break;
        case 'error':   messageDiv.style.background = '#dc3545'; break;
        default:        messageDiv.style.background = '#17a2b8'; break;
    }

    document.body.appendChild(messageDiv);

    setTimeout(() => {
        if (document.body.contains(messageDiv)) messageDiv.remove();
    }, 5000);
}

// Expose for inline onclick handlers
window.saveProfile = saveProfile;