// =====================================================
// Courses Page - Backend Integration (French)
// =====================================================

document.addEventListener('DOMContentLoaded', function() {
    // Check if API client is loaded
    if (!window.SyntaAPI) {
        console.error('Client API non chargé. Veuillez inclure api-client.js avant courses.js');
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
        coursesList.innerHTML = '<div class="loading">Chargement des cours...</div>';
        
        // Fetch courses from backend
        const courses = await window.SyntaAPI.fetchCourses(filters);
        
        if (!courses || courses.length === 0) {
            coursesList.innerHTML = '<div class="no-courses">Aucun cours disponible pour le moment</div>';
            return;
        }
        
        // Check user enrollments if authenticated
        let enrollments = [];
        const authenticated = await window.SyntaAPI.isAuthenticated();
        if (authenticated) {
            try {
                enrollments = await window.SyntaAPI.fetchMyEnrollments();
            } catch (error) {
                console.error('Erreur lors de la récupération des inscriptions:', error);
            }
        }
        
        // Fetch thumbnail signed URLs for courses that have R2 keys
        const coursesWithThumbnails = await Promise.all(
            courses.map(async (course) => {
                if (course.thumbnail_url && !course.thumbnail_url.startsWith('http')) {
                    // It's an R2 key, get signed URL from backend
                    try {
                        console.log('Fetching thumbnail for course:', course.title, 'Key:', course.thumbnail_url);
                        const url = `${window.SyntaAPI.BACKEND_URL}/api/content/thumbnail/${encodeURIComponent(course.thumbnail_url)}`;
                        console.log('Fetch URL:', url);
                        const response = await fetch(url);
                        console.log('Response status:', response.status);
                        if (response.ok) {
                            const data = await response.json();
                            console.log('Signed URL received:', data.url);
                            course.thumbnail_url = data.url; // Replace the R2 key with signed URL
                        } else {
                            const errorText = await response.text();
                            console.error('Failed to get thumbnail for course:', course.id, 'Status:', response.status, 'Error:', errorText);
                            course.thumbnail_url = null; // Clear invalid URL
                        }
                    } catch (err) {
                        console.error('Exception fetching thumbnail for course:', course.id, err);
                        course.thumbnail_url = null; // Clear invalid URL
                    }
                }
                return course;
            })
        );
        
        // Render courses
        coursesList.innerHTML = coursesWithThumbnails.map(course => {
            const enrollment = enrollments.find(e => e.course_id === course.id);
            const isEnrolled = !!enrollment;
            const progress = enrollment ? enrollment.progress : 0;
            
            return `
                <div class="course-card" data-course-id="${course.id}">
                    ${course.thumbnail_url ? `
                        <div class="course-thumbnail">
                            <img src="${course.thumbnail_url}" alt="${course.title}">
                        </div>
                    ` : `
                        <div class="course-thumbnail">
                            <img src="https://via.placeholder.com/400x200/667eea/ffffff?text=${encodeURIComponent(course.title)}" alt="${course.title}">
                        </div>
                    `}
                    <div class="course-info">
                        <h3 class="course-title">${course.title}</h3>
                        <p class="course-description">${course.description || 'Description du cours'}</p>
                        
                        <div class="course-meta">
                            <span class="course-category">${formatCategory(course.category)}</span>
                            <span class="course-level">${formatLevel(course.level)}</span>
                        </div>
                        
                        ${isEnrolled ? `
                            <div class="course-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${progress}%"></div>
                                </div>
                                <span class="progress-text">${progress}% complété</span>
                            </div>
                        ` : ''}
                        
                        <button class="preview-btn" onclick="viewCourse('${course.id}')">
                            Aperçu du cours
                        </button>
                        
                        <div class="course-footer">
                            ${course.is_free ? 
                                '<span class="course-price free">Gratuit</span>' : 
                                `<span class="course-price">${course.price} DT</span>`
                            }
                            
                            ${isEnrolled ? `
                                <button class="course-btn enrolled" onclick="viewCourse('${course.id}')">
                                    Continuer
                                </button>
                            ` : `
                                <button class="course-btn" onclick="enrollCourse('${course.id}', ${course.is_free})">
                                    ${course.is_free ? 'S\'inscrire' : 'Acheter'}
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erreur lors du chargement des cours:', error);
        coursesList.innerHTML = `
            <div class="error-message">
                Une erreur s'est produite lors du chargement des cours. Veuillez réessayer plus tard.
                <button onclick="loadCourses()">Réessayer</button>
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
    const authenticated = await window.SyntaAPI.isAuthenticated();
    if (!authenticated) {
        window.SyntaAPI.showError('Vous devez vous connecter d\'abord');
        setTimeout(() => {
            window.location.href = '../auth/login.html';
        }, 1500);
        return;
    }
    
    try {
        if (isFree) {
            await window.SyntaAPI.enrollFreeCourse(courseId);
            window.SyntaAPI.showSuccess('Inscription réussie au cours !');
        } else {
            // Redirect to payment page
            window.location.href = `../paiement/paiement.html?course=${courseId}`;
            return;
        }
        
        // Reload courses to show enrollment
        loadCourses();
        
    } catch (error) {
        console.error('Erreur d\'inscription:', error);
        window.SyntaAPI.showError('Une erreur s\'est produite lors de l\'inscription : ' + error.message);
    }
}

/**
 * View course details
 */
function viewCourse(courseId) {
    window.location.href = `course-details.html?id=${courseId}`;
}

/**
 * Format category for display
 */
function formatCategory(category) {
    const categories = {
        'bac-info': 'Bac Informatique',
        'bac-math': 'Bac Mathématiques',
        'web-dev': 'Développement Web',
        'general': 'Général'
    };
    return categories[category] || category;
}

/**
 * Format level for display
 */
function formatLevel(level) {
    const levels = {
        'beginner': 'Débutant',
        'intermediate': 'Intermédiaire',
        'advanced': 'Avancé'
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
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    if (type === 'error') {
        messageDiv.style.background = '#dc3545';
    } else if (type === 'success') {
        messageDiv.style.background = '#28a745';
    } else {
        messageDiv.style.background = '#667eea';
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