// =====================================================
// API CLIENT - Backend Communication
// =====================================================

const API_BASE_URL = 'http://localhost:3000/api';

/**
 * Get auth token from session storage
 */
function getAuthToken() {
    return sessionStorage.getItem('supabase.auth.token') || 
           localStorage.getItem('supabase.auth.token');
}

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return response.json();
}

// =====================================================
// COURSES API
// =====================================================

/**
 * Fetch all published courses
 * @param {Object} filters - Optional filters (category, level, search)
 */
async function fetchCourses(filters = {}) {
    const params = new URLSearchParams();
    if (filters.category) params.append('category', filters.category);
    if (filters.level) params.append('level', filters.level);
    if (filters.search) params.append('search', filters.search);
    
    const query = params.toString() ? `?${params}` : '';
    return apiRequest(`/courses${query}`);
}

/**
 * Fetch course details with modules and lessons
 * @param {string} courseId - Course UUID
 */
async function fetchCourseDetails(courseId) {
    return apiRequest(`/courses/${courseId}`);
}

/**
 * Get user's enrolled courses
 */
async function fetchMyEnrollments() {
    return apiRequest('/courses/my-enrollments');
}

/**
 * Get user's progress for a specific course
 * @param {string} courseId - Course UUID
 */
async function fetchCourseProgress(courseId) {
    return apiRequest(`/courses/${courseId}/progress`);
}

// =====================================================
// ENROLLMENT API
// =====================================================

/**
 * Purchase a course
 * @param {string} courseId - Course UUID
 * @param {Object} paymentInfo - Payment details
 */
async function purchaseCourse(courseId, paymentInfo = {}) {
    return apiRequest('/enrollment/purchase', {
        method: 'POST',
        body: JSON.stringify({
            courseId,
            paymentMethod: paymentInfo.method || 'cash',
            ...paymentInfo
        })
    });
}

/**
 * Enroll in a free course
 * @param {string} courseId - Course UUID
 */
async function enrollFreeCourse(courseId) {
    return apiRequest('/enrollment/free', {
        method: 'POST',
        body: JSON.stringify({ courseId })
    });
}

/**
 * Check if user has access to a course
 * @param {string} courseId - Course UUID
 */
async function checkCourseAccess(courseId) {
    try {
        const result = await apiRequest(`/enrollment/check/${courseId}`);
        return result.hasAccess;
    } catch (error) {
        console.error('Error checking access:', error);
        return false;
    }
}

// =====================================================
// CONTENT API (Protected)
// =====================================================

/**
 * Get signed URL for lesson video
 * @param {string} lessonId - Lesson UUID
 */
async function getLessonVideo(lessonId) {
    return apiRequest(`/content/lesson/${lessonId}/video`);
}

/**
 * Get signed URL for lesson PDF
 * @param {string} lessonId - Lesson UUID
 */
async function getLessonPDF(lessonId) {
    return apiRequest(`/content/lesson/${lessonId}/pdf`);
}

/**
 * Mark lesson as completed
 * @param {string} lessonId - Lesson UUID
 * @param {number} progress - Progress percentage (0-100)
 */
async function markLessonComplete(lessonId, progress = 100) {
    return apiRequest(`/content/lesson/${lessonId}/progress`, {
        method: 'POST',
        body: JSON.stringify({
            completed: progress >= 100,
            progressPercentage: progress
        })
    });
}

/**
 * Update video watch position
 * @param {string} lessonId - Lesson UUID
 * @param {number} position - Current position in seconds
 */
async function updateVideoPosition(lessonId, position) {
    return apiRequest(`/content/lesson/${lessonId}/progress`, {
        method: 'POST',
        body: JSON.stringify({
            lastPosition: Math.floor(position)
        })
    });
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
    return !!getAuthToken();
}

/**
 * Show error message to user
 */
function showError(message) {
    console.error(message);
    // You can customize this to show a toast/notification
    alert(message);
}

/**
 * Show success message to user
 */
function showSuccess(message) {
    console.log(message);
    // You can customize this to show a toast/notification
}

// Export for use in other files
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
        // Utils
        isAuthenticated,
        showError,
        showSuccess
    };
}
