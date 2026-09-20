// =====================================================
// API CLIENT - REST API (PostgreSQL backend)
// All data access goes through the server's REST API.
// No Supabase SDK — the server handles everything.
// =====================================================

/**
 * Base fetch helper — always sends cookies, parses JSON.
 */
async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
    });
    if (!res.ok) {
        let msg = `API error ${res.status}`;
        try { const j = await res.json(); msg = j.error || msg; } catch (_) {}
        throw new Error(msg);
    }
    return res.json();
}

// =====================================================
// USER / AUTH
// =====================================================

/**
 * Get current user from server session
 */
async function getCurrentUser() {
    try {
        const data = await apiFetch('/api/user/me');
        return data.user || null;
    } catch (_) {
        return null;
    }
}

/**
 * Check if user is authenticated (cookie session)
 */
async function isAuthenticated() {
    try {
        const user = await getCurrentUser();
        return !!user;
    } catch (_) {
        return false;
    }
}

/**
 * Get auth token — not needed for cookie-based auth.
 * Returns null; kept for legacy call-site compatibility.
 */
async function getAuthToken() {
    return null;
}

/**
 * Kept for backwards compatibility — resolves immediately.
 * The server no longer needs client-side Supabase init.
 */
async function waitForSupabase() {
    return null; // no-op — all queries go through the REST API
}

// =====================================================
// COURSES API
// =====================================================

/**
 * Fetch all published courses
 * @param {Object} filters - { category, level, search }
 */
async function fetchCourses(filters = {}) {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.level)    params.set('level',    filters.level);
    if (filters.search)   params.set('search',   filters.search);
    const qs = params.toString() ? `?${params}` : '';
    return apiFetch(`/api/courses${qs}`);
}

/**
 * Fetch full course details with modules & lessons
 * @param {string} courseId - Course UUID
 */
async function fetchCourseDetails(courseId) {
    return apiFetch(`/api/courses/${courseId}`);
}

/**
 * Get user's enrolled courses
 */
async function fetchMyEnrollments() {
    return apiFetch('/api/enrollment/my-enrollments');
}

/**
 * Get user's progress for a specific course
 * @param {string} courseId - Course UUID
 */
async function fetchCourseProgress(courseId) {
    return apiFetch(`/api/courses/${courseId}/progress`);
}

// =====================================================
// ENROLLMENT API
// =====================================================

/**
 * Purchase a course (paid)
 * @param {string} courseId
 * @param {Object} paymentInfo - { paymentId, amount }
 */
async function purchaseCourse(courseId, paymentInfo = {}) {
    return apiFetch('/api/enrollment/enroll', {
        method: 'POST',
        body: JSON.stringify({
            courseId,
            paymentId:  paymentInfo.paymentId  || null,
            amountPaid: paymentInfo.amount      || null,
        }),
    });
}

/**
 * Enroll in a free course
 * @param {string} courseId
 */
async function enrollFreeCourse(courseId) {
    return apiFetch(`/api/enrollment/free-enroll/${courseId}`, { method: 'POST' });
}

/**
 * Check if user is enrolled in a course
 * @param {string} courseId
 * @returns {boolean}
 */
async function checkCourseAccess(courseId) {
    try {
        const data = await apiFetch(`/api/courses/${courseId}/enrollment`);
        return !!data.enrolled;
    } catch (_) {
        return false;
    }
}

// =====================================================
// CONTENT API
// =====================================================

/**
 * Get signed video URL for a lesson
 * @param {string} lessonId
 */
async function getLessonVideo(lessonId) {
    return apiFetch(`/api/content/lesson/${lessonId}`);
}

/**
 * Get signed PDF URL for a lesson
 * @param {string} lessonId
 */
async function getLessonPDF(lessonId) {
    return apiFetch(`/api/content/lesson/${lessonId}/pdf`);
}

/**
 * Get content URL (video/PDF) from backend
 * @param {string} lessonId
 */
async function getContentUrl(lessonId) {
    return apiFetch(`/api/content/lesson/${lessonId}`);
}

/**
 * Mark lesson as completed
 * @param {string} lessonId
 * @param {number} progress - 0-100
 */
async function markLessonComplete(lessonId, progress = 100) {
    return apiFetch(`/api/tracking/progress`, {
        method: 'POST',
        body: JSON.stringify({ lessonId, progress }),
    });
}

/**
 * Update video watch position
 * @param {string} lessonId
 * @param {number} position - seconds
 */
async function updateVideoPosition(lessonId, position) {
    return apiFetch(`/api/tracking/position`, {
        method: 'POST',
        body: JSON.stringify({ lessonId, position: Math.floor(position) }),
    });
}

/**
 * Get direct video URL from R2 public URL (fallback)
 * @param {string} videoKey
 */
function getDirectVideoUrl(videoKey) {
    return null; // signed URLs are generated server-side
}

// =====================================================
// UI HELPERS
// =====================================================

function showError(message) {
    console.error(message);
    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed;top:20px;right:20px;
        background:#f44336;color:white;
        padding:15px 20px;border-radius:8px;
        box-shadow:0 4px 12px rgba(0,0,0,0.3);
        z-index:10000;font-family:'Tajawal',sans-serif;
        max-width:300px;animation:slideIn .3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 5000);
}

function showSuccess(message) {
    console.log(message);
    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed;top:20px;right:20px;
        background:#4CAF50;color:white;
        padding:15px 20px;border-radius:8px;
        box-shadow:0 4px 12px rgba(0,0,0,0.3);
        z-index:10000;font-family:'Tajawal',sans-serif;
        max-width:300px;animation:slideIn .3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 3000);
}

// =====================================================
// EXPORT
// =====================================================
if (typeof window !== 'undefined') {
    window.SyntaAPI = {
        // Courses
        fetchCourses,
        fetchCourseDetails,
        fetchMyEnrollments,
        fetchCourseProgress,
        // Enrollment
        purchaseCourse,
        enrollFreeCourse,
        checkCourseAccess,
        // Content
        getLessonVideo,
        getLessonPDF,
        markLessonComplete,
        updateVideoPosition,
        getContentUrl,
        getAuthToken,
        getDirectVideoUrl,
        // Utils
        isAuthenticated,
        showError,
        showSuccess,
        getCurrentUser,
        waitForSupabase, // no-op shim for legacy callers
    };

    console.log('✅ Synta API initialized (REST mode — local PostgreSQL)');
}
