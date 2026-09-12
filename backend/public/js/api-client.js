// =====================================================
// API CLIENT - Supabase Direct Integration
// =====================================================

// Note: SUPABASE_URL, SUPABASE_ANON_KEY, and supabaseClient are defined in authentication.js
// No need to redeclare them here

// Backend API Configuration
// Detect if running locally or in production
const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://syntaacademy-1.onrender.com';

// R2 Public URL (optional alternative - requires public bucket in Cloudflare)
const R2_PUBLIC_URL = null;

/**
 * Get or create Supabase client
 * Supports both direct access and iframe context
 */
function getSupabase() {
    // Check if we're in an iframe
    const isInIframe = window.self !== window.top;
    
    // Try to get supabaseClient from current window or parent window
    const client = isInIframe && window.parent.supabaseClient 
        ? window.parent.supabaseClient 
        : window.supabaseClient;
    
    if (!client) {
        throw new Error('Supabase client not initialized. Make sure authentication.js is loaded first.');
    }
    
    return client;
}

/**
 * Safely wait for Supabase client to be initialized
 */
async function waitForSupabase() {
    const isInIframe = window.self !== window.top;
    const getClient = () => {
        try {
            return isInIframe && window.parent && window.parent.supabaseClient 
                ? window.parent.supabaseClient 
                : window.supabaseClient;
        } catch (e) {
            // Fallback if cross-origin access is blocked
            return window.supabaseClient;
        }
    };

    if (getClient()) {
        return getClient();
    }

    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 100; // 5 seconds max
        const interval = setInterval(() => {
            attempts++;
            const client = getClient();
            if (client) {
                clearInterval(interval);
                resolve(client);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                reject(new Error('Supabase client initialization timed out.'));
            }
        }, 50);
    });
}

/**
 * Get current user session
 */
async function getCurrentUser() {
    try {
        const supabase = getSupabase();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}


// =====================================================
// COURSES API
// =====================================================

/**
 * Fetch all published courses
 * @param {Object} filters - Optional filters (category, level, search)
 */
async function fetchCourses(filters = {}) {
    try {
        const supabase = getSupabase();
        let query = supabase
            .from('courses')
            .select('*')
            .eq('is_published', true);
        
        if (filters.category) {
            query = query.eq('category', filters.category);
        }
        
        if (filters.level) {
            query = query.eq('level', filters.level);
        }
        
        if (filters.search) {
            query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
        }
        
        query = query.order('created_at', { ascending: false });
        
        const { data, error } = await query;
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching courses:', error);
        throw error;
    }
}

/**
 * Fetch course details with modules and lessons
 * @param {string} courseId - Course UUID
 */
async function fetchCourseDetails(courseId) {
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('courses')
            .select(`
                *,
                modules (
                    id,
                    title,
                    description,
                    order_index,
                    lessons (
                        id,
                        title,
                        description,
                        type,
                        duration,
                        order_index,
                        is_preview
                    )
                )
            `)
            .eq('id', courseId)
            .eq('is_published', true)
            .single();
        
        if (error) throw error;
        
        // Sort modules and lessons by order_index
        if (data && data.modules) {
            data.modules.sort((a, b) => a.order_index - b.order_index);
            data.modules.forEach(module => {
                if (module.lessons) {
                    module.lessons.sort((a, b) => a.order_index - b.order_index);
                }
            });
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching course details:', error);
        throw error;
    }
}

/**
 * Get user's enrolled courses
 */
async function fetchMyEnrollments() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('User not authenticated');
        }
        
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('enrollments')
            .select(`
                *,
                course:courses (
                    id,
                    title,
                    description,
                    thumbnail_url,
                    level,
                    category
                )
            `)
            .eq('user_id', user.id)
            .order('enrolled_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching enrollments:', error);
        throw error;
    }
}

/**
 * Get user's progress for a specific course
 * @param {string} courseId - Course UUID
 */
async function fetchCourseProgress(courseId) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('User not authenticated');
        }
        
        const supabase = getSupabase();
        
        // Get enrollment
        const { data: enrollment, error: enrollError } = await supabase
            .from('enrollments')
            .select('*')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .single();
        
        if (enrollError) throw enrollError;
        
        // Get lesson progress
        const { data: lessonProgress, error: progressError } = await supabase
            .from('lesson_progress')
            .select('*')
            .eq('user_id', user.id)
            .eq('course_id', courseId);
        
        if (progressError) throw progressError;
        
        return {
            enrollment,
            lessonProgress: lessonProgress || []
        };
    } catch (error) {
        console.error('Error fetching course progress:', error);
        throw error;
    }
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
    try {
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('يجب تسجيل الدخول أولاً');
        }
        
        const supabase = getSupabase();
        
        // Get course details
        const { data: course, error: courseError } = await supabase
            .from('courses')
            .select('id, title, price, is_free')
            .eq('id', courseId)
            .eq('is_published', true)
            .single();
        
        if (courseError || !course) {
            throw new Error('الدورة غير موجودة');
        }
        
        // Check if already enrolled
        const { data: existing } = await supabase
            .from('enrollments')
            .select('id')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .single();
        
        if (existing) {
            throw new Error('أنت مسجل بالفعل في هذه الدورة');
        }
        
        // Create enrollment
        const { data: enrollment, error: enrollError } = await supabase
            .from('enrollments')
            .insert({
                user_id: user.id,
                course_id: courseId,
                payment_id: paymentInfo.paymentId || null,
                amount_paid: paymentInfo.amount || course.price,
                progress: 0,
                enrolled_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (enrollError) throw enrollError;
        
        return enrollment;
    } catch (error) {
        console.error('Error purchasing course:', error);
        throw error;
    }
}

/**
 * Enroll in a free course
 * @param {string} courseId - Course UUID
 */
async function enrollFreeCourse(courseId) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('يجب تسجيل الدخول أولاً');
        }
        
        const supabase = getSupabase();
        
        // Get course details
        const { data: course, error: courseError } = await supabase
            .from('courses')
            .select('id, title, is_free, price')
            .eq('id', courseId)
            .eq('is_published', true)
            .single();
        
        if (courseError || !course) {
            throw new Error('الدورة غير موجودة');
        }
        
        if (!course.is_free && course.price > 0) {
            throw new Error('هذه الدورة ليست مجانية');
        }
        
        // Check if already enrolled
        const { data: existing } = await supabase
            .from('enrollments')
            .select('id')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .single();
        
        if (existing) {
            throw new Error('أنت مسجل بالفعل في هذه الدورة');
        }
        
        // Create enrollment
        const { data: enrollment, error: enrollError } = await supabase
            .from('enrollments')
            .insert({
                user_id: user.id,
                course_id: courseId,
                amount_paid: 0,
                progress: 0,
                enrolled_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (enrollError) throw enrollError;
        
        return enrollment;
    } catch (error) {
        console.error('Error enrolling in free course:', error);
        throw error;
    }
}

/**
 * Check if user has access to a course
 * @param {string} courseId - Course UUID
 */
async function checkCourseAccess(courseId) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return false;
        }
        
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('enrollments')
            .select('id')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .single();
        
        if (error) {
            return false;
        }
        
        return !!data;
    } catch (error) {
        console.error('Error checking course access:', error);
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
    try {
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('يجب تسجيل الدخول أولاً');
        }
        
        const supabase = getSupabase();
        
        // Get lesson details
        const { data: lesson, error: lessonError } = await supabase
            .from('lessons')
            .select(`
                id,
                video_url,
                is_preview,
                module:modules (
                    course_id
                )
            `)
            .eq('id', lessonId)
            .single();
        
        if (lessonError || !lesson) {
            throw new Error('الدرس غير موجود');
        }
        
        // Check access if not preview
        if (!lesson.is_preview) {
            const hasAccess = await checkCourseAccess(lesson.module.course_id);
            if (!hasAccess) {
                throw new Error('ليس لديك صلاحية للوصول إلى هذا الدرس');
            }
        }
        
        return { videoUrl: lesson.video_url };
    } catch (error) {
        console.error('Error getting lesson video:', error);
        throw error;
    }
}

/**
 * Get signed URL for lesson PDF
 * @param {string} lessonId - Lesson UUID
 */
async function getLessonPDF(lessonId) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('يجب تسجيل الدخول أولاً');
        }
        
        const supabase = getSupabase();
        
        // Get lesson details
        const { data: lesson, error: lessonError } = await supabase
            .from('lessons')
            .select(`
                id,
                pdf_url,
                is_preview,
                module:modules (
                    course_id
                )
            `)
            .eq('id', lessonId)
            .single();
        
        if (lessonError || !lesson) {
            throw new Error('الدرس غير موجود');
        }
        
        // Check access if not preview
        if (!lesson.is_preview) {
            const hasAccess = await checkCourseAccess(lesson.module.course_id);
            if (!hasAccess) {
                throw new Error('ليس لديك صلاحية للوصول إلى هذا الدرس');
            }
        }
        
        return { pdfUrl: lesson.pdf_url };
    } catch (error) {
        console.error('Error getting lesson PDF:', error);
        throw error;
    }
}

/**
 * Mark lesson as completed
 * @param {string} lessonId - Lesson UUID
 * @param {number} progress - Progress percentage (0-100)
 */
async function markLessonComplete(lessonId, progress = 100) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('يجب تسجيل الدخول أولاً');
        }
        
        const supabase = getSupabase();
        
        // Get lesson and course info
        const { data: lesson, error: lessonError } = await supabase
            .from('lessons')
            .select(`
                id,
                module:modules (
                    course_id
                )
            `)
            .eq('id', lessonId)
            .single();
        
        if (lessonError || !lesson) {
            throw new Error('الدرس غير موجود');
        }
        
        // Upsert lesson progress
        const { data, error } = await supabase
            .from('lesson_progress')
            .upsert({
                user_id: user.id,
                lesson_id: lessonId,
                course_id: lesson.module.course_id,
                completed: progress >= 100,
                progress_percentage: progress,
                last_accessed_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,lesson_id'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Update enrollment progress
        await updateEnrollmentProgress(lesson.module.course_id);
        
        return data;
    } catch (error) {
        console.error('Error marking lesson complete:', error);
        throw error;
    }
}

/**
 * Update video watch position
 * @param {string} lessonId - Lesson UUID
 * @param {number} position - Current position in seconds
 */
async function updateVideoPosition(lessonId, position) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('يجب تسجيل الدخول أولاً');
        }
        
        const supabase = getSupabase();
        
        // Get lesson and course info
        const { data: lesson, error: lessonError } = await supabase
            .from('lessons')
            .select(`
                id,
                module:modules (
                    course_id
                )
            `)
            .eq('id', lessonId)
            .single();
        
        if (lessonError || !lesson) {
            throw new Error('الدرس غير موجود');
        }
        
        // Upsert lesson progress with last position
        const { data, error } = await supabase
            .from('lesson_progress')
            .upsert({
                user_id: user.id,
                lesson_id: lessonId,
                course_id: lesson.module.course_id,
                last_position: Math.floor(position),
                last_accessed_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,lesson_id'
            })
            .select()
            .single();
        
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error updating video position:', error);
        throw error;
    }
}

/**
 * Update enrollment progress based on completed lessons
 * @param {string} courseId - Course UUID
 */
async function updateEnrollmentProgress(courseId) {
    try {
        const user = await getCurrentUser();
        if (!user) return;
        
        const supabase = getSupabase();
        
        // Get total lessons count
        const { count: totalLessons } = await supabase
            .from('lessons')
            .select('id', { count: 'exact', head: true })
            .eq('modules.course_id', courseId);
        
        // Get completed lessons count
        const { count: completedLessons } = await supabase
            .from('lesson_progress')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .eq('completed', true);
        
        // Calculate progress percentage
        const progress = totalLessons > 0 
            ? Math.round((completedLessons / totalLessons) * 100) 
            : 0;
        
        // Update enrollment
        await supabase
            .from('enrollments')
            .update({ 
                progress,
                last_accessed_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .eq('course_id', courseId);
    } catch (error) {
        console.error('Error updating enrollment progress:', error);
    }
}


// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Check if user is authenticated
 */
async function isAuthenticated() {
    try {
        const supabase = getSupabase();
        const { data: { session }, error } = await supabase.auth.getSession();
        return !!session && !error;
    } catch (error) {
        return false;
    }
}

/**
 * Show error message to user
 */
function showError(message) {
    console.error(message);
    // Create error toast
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f44336;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: 'Tajawal', sans-serif;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (document.body.contains(toast)) {
            document.body.removeChild(toast);
        }
    }, 5000);
}

/**
 * Show success message to user
 */
function showSuccess(message) {
    console.log(message);
    // Create success toast
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: 'Tajawal', sans-serif;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (document.body.contains(toast)) {
            document.body.removeChild(toast);
        }
    }, 3000);
}

/**
 * Get auth token for API requests
 */
async function getAuthToken() {
    try {
        const supabase = getSupabase();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        return session?.access_token || null;
    } catch (error) {
        console.error('Error getting auth token:', error);
        return null;
    }
}

/**
 * Get content URL from backend (signed URL for R2)
 * @param {string} lessonId - Lesson UUID
 */
async function getContentUrl(lessonId) {
    // Check if backend is available
    if (!BACKEND_URL) {
        throw new Error('Backend URL not configured. Please set BACKEND_URL in api-client.js or configure R2_PUBLIC_URL for direct access.');
    }
    
    try {
        const token = await getAuthToken();
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // Only add auth header if token exists
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(`${BACKEND_URL}/api/content/lesson/${lessonId}`, {
            method: 'GET',
            headers
        });
        
        if (!response.ok) {
            let errorMessage = 'Failed to get content URL';
            try {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            } catch (e) {
                // Response is not JSON
                errorMessage = `Server error: ${response.status}`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error getting content URL:', error);
        throw error;
    }
}

/**
 * Get direct video URL from video_key (fallback when backend is unavailable)
 * @param {string} videoKey - R2 video key (e.g., "synta-content/video.mp4")
 */
function getDirectVideoUrl(videoKey) {
    if (R2_PUBLIC_URL) {
        // If you have a public R2 URL configured, use it
        return `${R2_PUBLIC_URL}/${videoKey}`;
    }
    
    // Otherwise return null - backend is required for signed URLs
    return null;
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.SyntaAPI = {
        // Configuration
        BACKEND_URL,
        // Supabase client
        get supabase() {
            return getSupabase();
        },
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
        waitForSupabase
    };
    
    console.log('✅ Synta API initialized (Supabase direct mode)');
}
