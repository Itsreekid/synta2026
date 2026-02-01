// =====================================================
// Courses Page - Backend Integration
// =====================================================

document.addEventListener('DOMContentLoaded', function() {
    // Check if API client is loaded
    if (!window.SyntaAPI) {
        console.error('API client not loaded. Please include api-client.js before courses.js');
        return;
    }
    
    loadCourses();
    setupFilters();
});

/**
 * Load courses from backend
 */
async function loadCourses(filters = {}) {
    const coursesList = document.getElementById('courses-list');
    
    try {
        // Show loading state
        coursesList.innerHTML = '<div class="loading">جاري تحميل الدورات...</div>';
        
        // Fetch courses from backend
        const courses = await window.SyntaAPI.fetchCourses(filters);
        
        if (!courses || courses.length === 0) {
            coursesList.innerHTML = '<div class="no-courses">لا توجد دورات متاحة حالياً</div>';
            return;
        }
        
        // Check user enrollments if authenticated
        let enrollments = [];
        if (window.SyntaAPI.isAuthenticated()) {
            try {
                enrollments = await window.SyntaAPI.fetchMyEnrollments();
            } catch (error) {
                console.error('Error fetching enrollments:', error);
            }
        }
        
        // Render courses
        coursesList.innerHTML = courses.map(course => {
            const enrollment = enrollments.find(e => e.course_id === course.id);
            const isEnrolled = !!enrollment;
            const progress = enrollment ? enrollment.progress : 0;
            
            return `
                <div class="course-card" data-course-id="${course.id}">
                    ${course.thumbnail_url ? `
                        <div class="course-thumbnail">
                            <img src="${course.thumbnail_url}" alt="${course.title}">
                        </div>
                    ` : ''}
                    <div class="course-info">
                        <h3 class="course-title">${course.title}</h3>
                        <p class="course-description">${course.description || ''}</p>
                        
                        <div class="course-meta">
                            <span class="course-category">${formatCategory(course.category)}</span>
                            <span class="course-level">${formatLevel(course.level)}</span>
                        </div>
                        
                        ${isEnrolled ? `
                            <div class="course-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${progress}%"></div>
                                </div>
                                <span class="progress-text">${progress}%</span>
                            </div>
                        ` : ''}
                        
                        <div class="course-footer">
                            ${course.is_free ? 
                                '<span class="course-price free">مجاني</span>' : 
                                `<span class="course-price">${course.price} دت</span>`
                            }
                            
                            ${isEnrolled ? `
                                <button class="course-btn enrolled" onclick="viewCourse('${course.id}')">
                                    متابعة الدورة
                                </button>
                            ` : `
                                <button class="course-btn" onclick="enrollCourse('${course.id}', ${course.is_free})">
                                    ${course.is_free ? 'التسجيل المجاني' : 'شراء الدورة'}
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading courses:', error);
        coursesList.innerHTML = `
            <div class="error-message">
                حدث خطأ أثناء تحميل الدورات. يرجى المحاولة لاحقاً.
                <button onclick="loadCourses()">إعادة المحاولة</button>
            </div>
        `;
    }
}

/**
 * Setup filter functionality
 */
function setupFilters() {
    const categoryFilter = document.getElementById('category-filter');
    const levelFilter = document.getElementById('level-filter');
    const searchInput = document.getElementById('search-courses');
    
    if (categoryFilter) {
        categoryFilter.addEventListener('change', applyFilters);
    }
    
    if (levelFilter) {
        levelFilter.addEventListener('change', applyFilters);
    }
    
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(applyFilters, 500);
        });
    }
}

/**
 * Apply current filters
 */
function applyFilters() {
    const filters = {};
    
    const categoryFilter = document.getElementById('category-filter');
    const levelFilter = document.getElementById('level-filter');
    const searchInput = document.getElementById('search-courses');
    
    if (categoryFilter && categoryFilter.value) {
        filters.category = categoryFilter.value;
    }
    
    if (levelFilter && levelFilter.value) {
        filters.level = levelFilter.value;
    }
    
    if (searchInput && searchInput.value.trim()) {
        filters.search = searchInput.value.trim();
    }
    
    loadCourses(filters);
}

/**
 * Enroll in a course
 */
async function enrollCourse(courseId, isFree) {
    if (!window.SyntaAPI.isAuthenticated()) {
        window.SyntaAPI.showError('يجب تسجيل الدخول أولاً');
        window.location.href = '/pages/auth/login.html';
        return;
    }
    
    try {
        if (isFree) {
            await window.SyntaAPI.enrollFreeCourse(courseId);
            window.SyntaAPI.showSuccess('تم التسجيل في الدورة بنجاح!');
        } else {
            // Redirect to payment page
            window.location.href = `/pages/paiement/paiement.html?course=${courseId}`;
            return;
        }
        
        // Reload courses to show enrollment
        loadCourses();
        
    } catch (error) {
        console.error('Enrollment error:', error);
        window.SyntaAPI.showError('حدث خطأ أثناء التسجيل: ' + error.message);
    }
}

/**
 * View course details
 */
function viewCourse(courseId) {
    window.location.href = `/pages/courses/course-details.html?id=${courseId}`;
}

/**
 * Format category for display
 */
function formatCategory(category) {
    const categories = {
        'bac-info': 'باك معلوماتية',
        'bac-math': 'باك رياضيات',
        'web-dev': 'تطوير الويب',
        'general': 'عام'
    };
    return categories[category] || category;
}

/**
 * Format level for display
 */
function formatLevel(level) {
    const levels = {
        'beginner': 'مبتدئ',
        'intermediate': 'متوسط',
        'advanced': 'متقدم'
    };
    return levels[level] || level;
}

function showMessage(message, type = 'info') {
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