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
                        const url = `${window.SyntaAPI.BACKEND_URL}/api/content/thumbnail/${encodeURIComponent(course.thumbnail_url)}`;
                        const response = await fetch(url);
                        if (response.ok) {
                            const data = await response.json();
                            course.thumbnail_url = data.url; // Replace the R2 key with signed URL
                        } else {
                            course.thumbnail_url = null; // Clear invalid URL
                        }
                    } catch (err) {
                        console.error('Failed to fetch thumbnail for:', course.title, err);
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
                                `<span class="course-price"><img src="../../source/dt.png" alt="DT" class="dt-currency-icon"> ${course.price}</span>`
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
            loadCourses();
        } else {
            // Get user and course details
            const user = await window.SyntaAPI.getCurrentUser();
            if (!user) {
                window.SyntaAPI.showError('Utilisateur non trouvé');
                return;
            }
            
            // Get user balance
            const { data: userData, error: balanceError } = await window.SyntaAPI.supabase
                .from('Users')
                .select('balance')
                .eq('id', user.id)
                .single();
            
            if (balanceError) {
                console.error('Error fetching balance:', balanceError);
                window.SyntaAPI.showError('Erreur lors de la vérification du solde');
                return;
            }
            
            const balance = userData?.balance || 0;
            
            // Get course price
            const { data: course, error: courseError } = await window.SyntaAPI.supabase
                .from('courses')
                .select('price, title')
                .eq('id', courseId)
                .single();
            
            if (courseError) {
                console.error('Error fetching course:', courseError);
                window.SyntaAPI.showError('Erreur lors de la récupération du cours');
                return;
            }
            
            const price = course?.price || 0;
            
            // Check if balance is sufficient
            if (balance < price) {
                // Insufficient balance, redirect to payment page
                window.SyntaAPI.showError('Solde insuffisant. Redirection vers la page de paiement...');
                setTimeout(() => {
                    window.location.href = '../paiement/paiement.html';
                }, 1500);
                return;
            }
            
            // Show confirmation popup
            showPurchaseConfirmation(courseId, course.title, price, balance);
        }
        
    } catch (error) {
        console.error('Erreur d\'inscription:', error);
        window.SyntaAPI.showError('Une erreur s\'est produite lors de l\'inscription : ' + error.message);
    }
}

/**
 * Show purchase confirmation popup
 */
function showPurchaseConfirmation(courseId, courseTitle, price, currentBalance) {
    const popup = document.createElement('div');
    popup.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
    `;
    
    popup.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 2rem;
            max-width: 450px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s ease;
        ">
            <h2 style="
                color: #1e293b;
                font-size: 1.5rem;
                margin-bottom: 1rem;
                font-weight: 700;
            ">Confirmer l'achat</h2>
            
            <p style="
                color: #64748b;
                margin-bottom: 1.5rem;
                line-height: 1.6;
            ">Voulez-vous acheter ce cours?</p>
            
            <div style="
                background: #f8fafc;
                border-radius: 12px;
                padding: 1rem;
                margin-bottom: 1.5rem;
            ">
                <div style="margin-bottom: 0.5rem;"><strong>Cours:</strong> ${courseTitle}</div>
                <div style="margin-bottom: 0.5rem;"><strong>Prix:</strong> <img src="../../source/dt.png" alt="DT" style="width: 14px; height: 14px; display: inline; margin-right: 4px;"> ${price}</div>
                <div style="margin-bottom: 0.5rem;"><strong>Solde actuel:</strong> <img src="../../source/dt.png" alt="DT" style="width: 14px; height: 14px; display: inline; margin-right: 4px;"> ${currentBalance.toFixed(2)}</div>
                <div><strong>Nouveau solde:</strong> <img src="../../source/dt.png" alt="DT" style="width: 14px; height: 14px; display: inline; margin-right: 4px;"> ${(currentBalance - price).toFixed(2)}</div>
            </div>
            
            <div style="display: flex; gap: 1rem;">
                <button id="confirmBuyBtn" style="
                    flex: 1;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    padding: 0.875rem;
                    font-family: 'Inter', sans-serif;
                    font-weight: 600;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: transform 0.2s;
                ">Confirmer</button>
                
                <button id="cancelBuyBtn" style="
                    flex: 1;
                    background: #e5e7eb;
                    color: #1e293b;
                    border: none;
                    border-radius: 10px;
                    padding: 0.875rem;
                    font-family: 'Inter', sans-serif;
                    font-weight: 600;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: transform 0.2s;
                ">Annuler</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Add event listeners
    document.getElementById('confirmBuyBtn').onclick = async () => {
        popup.remove();
        await completePurchase(courseId, price);
    };
    
    document.getElementById('cancelBuyBtn').onclick = () => {
        popup.remove();
    };
    
    // Close on background click
    popup.onclick = (e) => {
        if (e.target === popup) {
            popup.remove();
        }
    };
}

/**
 * Complete the purchase after confirmation
 */
async function completePurchase(courseId, price) {
    try {
        const user = await window.SyntaAPI.getCurrentUser();
        
        // Deduct balance and create enrollment
        const { error: balanceError } = await window.SyntaAPI.supabase
            .rpc('deduct_balance', {
                p_user_id: user.id,
                p_amount: price
            });
        
        if (balanceError) {
            throw balanceError;
        }
        
        // Create enrollment
        const { error: enrollError } = await window.SyntaAPI.supabase
            .from('enrollments')
            .insert({
                user_id: user.id,
                course_id: courseId,
                amount_paid: price,
                enrolled_at: new Date().toISOString()
            });
        
        if (enrollError) {
            throw enrollError;
        }
        
        window.SyntaAPI.showSuccess('Cours acheté avec succès!');
        setTimeout(() => {
            location.reload();
        }, 1500);
        
    } catch (error) {
        console.error('Error completing purchase:', error);
        window.SyntaAPI.showError('Erreur lors de l\'achat du cours');
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
    
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    
    @keyframes slideUp {
        from {
            transform: translateY(20px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style); 