// =====================================================
// Courses Page — REST API version (replaces Supabase SDK calls)
// =====================================================

document.addEventListener('DOMContentLoaded', async function () {
    try {
        await loadCourses();
        setupFilters();
    } catch (err) {
        console.error('Failed to initialize courses page:', err);
        const coursesList = document.getElementById('courses-list');
        if (coursesList) {
            coursesList.innerHTML = '<div class="error-message">Erreur de connexion à la base de données. Veuillez rafraîchir la page.</div>';
        }
    }
});

/**
 * Load courses from the REST API
 */
async function loadCourses(filters = {}) {
    const coursesList = document.getElementById('courses-list');
    if (!coursesList) return;

    try {
        // Show loading state
        coursesList.innerHTML = '<div class="loading">Chargement des cours...</div>';

        // Build query string
        const params = new URLSearchParams();
        if (filters.category) params.append('category', filters.category);
        if (filters.level) params.append('level', filters.level);

        // Fetch published courses from backend
        const coursesResp = await fetch(`/api/courses?${params.toString()}`, { credentials: 'include' });
        if (!coursesResp.ok) throw new Error(`HTTP ${coursesResp.status}`);
        let courses = await coursesResp.json();

        // Client-side search filter (not supported server-side currently)
        if (filters.search) {
            const q = filters.search.toLowerCase();
            courses = courses.filter(c =>
                c.title.toLowerCase().includes(q) ||
                (c.description || '').toLowerCase().includes(q)
            );
        }

        if (!courses || courses.length === 0) {
            coursesList.innerHTML = '<div class="no-courses">Aucun cours disponible pour le moment</div>';
            return;
        }

        // Fetch user enrollments if logged in
        let enrollments = [];
        try {
            const enrollResp = await fetch('/api/courses/user/my-courses', { credentials: 'include' });
            if (enrollResp.ok) {
                enrollments = await enrollResp.json();
            }
        } catch (err) {
            // Not logged in or error — continue without enrollment data
        }

        // Render courses
        coursesList.innerHTML = courses.map(course => {
            const enrollment = enrollments.find(e => e.course_id === course.id);
            const isEnrolled = !!enrollment;
            const progress = enrollment ? (enrollment.progress || 0) : 0;

            const imgId = `course-img-${course.id}`;
            let imgSrc = course.thumbnail_url && course.thumbnail_url.startsWith('http')
                ? course.thumbnail_url
                : `https://via.placeholder.com/400x200/667eea/ffffff?text=${encodeURIComponent(course.title)}`;

            return `
                <div class="course-card" data-course-id="${course.id}">
                    <div class="course-thumbnail">
                        <img id="${imgId}" src="${imgSrc}" alt="${course.title}">
                    </div>
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
                            ${course.is_free
                                ? '<span class="course-price free">Gratuit</span>'
                                : `<span class="course-price"><img src="/source/dt.png" alt="DT" class="dt-currency-icon"> ${course.price}</span>`
                            }
                            
                            ${isEnrolled
                                ? `<button class="course-btn enrolled" onclick="viewCourse('${course.id}')">Continuer</button>`
                                : `<button class="course-btn" onclick="enrollCourse('${course.id}', ${course.is_free})">${course.is_free ? 'S\'inscrire' : 'Acheter'}</button>`
                            }
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
    // Check if logged in
    const userResp = await fetch('/api/user/me', { credentials: 'include' });
    if (!userResp.ok) {
        showMessage('Vous devez vous connecter d\'abord', 'error');
        setTimeout(() => { window.location.href = '/login'; }, 1500);
        return;
    }
    const { user } = await userResp.json();
    if (!user) {
        showMessage('Vous devez vous connecter d\'abord', 'error');
        setTimeout(() => { window.location.href = '/login'; }, 1500);
        return;
    }

    try {
        if (isFree) {
            const resp = await fetch('/api/purchase/course', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId, userId: user.id })
            });
            const result = await resp.json();
            if (resp.ok) {
                showMessage('Inscription réussie au cours !', 'success');
                loadCourses();
            } else {
                showMessage(result.error || 'Erreur lors de l\'inscription', 'error');
            }
        } else {
            // Fetch balance and course details before showing confirmation
            const balResp = await fetch('/api/user/me', { credentials: 'include' });
            const { user: userData } = await balResp.json();
            const balance = parseFloat(userData?.balance || 0);

            const courseResp = await fetch(`/api/courses/${courseId}`, { credentials: 'include' });
            if (!courseResp.ok) { showMessage('Erreur lors de la récupération du cours', 'error'); return; }
            const course = await courseResp.json();
            const price = parseFloat(course.price || 0);

            if (balance < price) {
                showMessage('Solde insuffisant. Redirection vers la page de paiement...', 'error');
                setTimeout(() => { window.location.href = '/app/paiement'; }, 1500);
                return;
            }

            showPurchaseConfirmation(courseId, course.title, price, balance, user.id);
        }

    } catch (error) {
        console.error('Erreur d\'inscription:', error);
        showMessage('Une erreur s\'est produite lors de l\'inscription : ' + error.message, 'error');
    }
}

/**
 * Show purchase confirmation popup
 */
function showPurchaseConfirmation(courseId, courseTitle, price, currentBalance, userId) {
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
        padding: 1rem;
        overflow-y: auto;
    `;

    popup.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 2rem;
            max-width: 450px;
            width: 100%;
            margin: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s ease;
        ">
            <h2 style="color: #1e293b; font-size: 1.5rem; margin-bottom: 1rem; font-weight: 700;">Confirmer l'achat</h2>
            
            <p style="color: #64748b; margin-bottom: 1.5rem; line-height: 1.6;">Voulez-vous acheter ce cours?</p>
            
            <div style="background: #f8fafc; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
                <div style="margin-bottom: 0.5rem; word-wrap: break-word;"><strong>Cours:</strong> ${courseTitle}</div>
                <div style="margin-bottom: 0.5rem;"><strong>Prix:</strong> <img src="/source/dt.png" alt="DT" style="width: 14px; height: 14px; display: inline; margin-right: 4px;"> ${price}</div>
                <div style="margin-bottom: 0.5rem;"><strong>Solde actuel:</strong> <img src="/source/dt.png" alt="DT" style="width: 14px; height: 14px; display: inline; margin-right: 4px;"> ${currentBalance.toFixed(2)}</div>
                <div><strong>Nouveau solde:</strong> <img src="/source/dt.png" alt="DT" style="width: 14px; height: 14px; display: inline; margin-right: 4px;"> ${(currentBalance - price).toFixed(2)}</div>
            </div>
            
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button id="confirmBuyBtn" style="
                    flex: 1; min-width: 120px;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white; border: none; border-radius: 10px;
                    padding: 0.875rem; font-weight: 600; font-size: 1rem;
                    cursor: pointer; transition: transform 0.2s;
                ">Confirmer</button>
                
                <button id="cancelBuyBtn" style="
                    flex: 1; min-width: 120px;
                    background: #e5e7eb; color: #1e293b; border: none; border-radius: 10px;
                    padding: 0.875rem; font-weight: 600; font-size: 1rem;
                    cursor: pointer; transition: transform 0.2s;
                ">Annuler</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    document.getElementById('confirmBuyBtn').onclick = async () => {
        popup.remove();
        await completePurchase(courseId, price, userId);
    };

    document.getElementById('cancelBuyBtn').onclick = () => { popup.remove(); };

    popup.onclick = (e) => { if (e.target === popup) popup.remove(); };
}

/**
 * Complete the purchase after confirmation
 */
async function completePurchase(courseId, price, userId) {
    try {
        const response = await fetch('/api/purchase/course', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId, userId })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Erreur lors de l\'achat du cours');
        }

        showMessage('Cours acheté avec succès!', 'success');
        setTimeout(() => { location.reload(); }, 1500);

    } catch (error) {
        console.error('Error completing purchase:', error);
        showMessage(error.message || 'Erreur lors de l\'achat du cours', 'error');
    }
}

/**
 * View course details
 */
function viewCourse(courseId) {
    window.location.href = `/app/course-details?id=${courseId}`;
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
    return categories[category] || category || '';
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
    return levels[level] || level || '';
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
        z-index: 10001;
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
    setTimeout(() => { messageDiv.remove(); }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
`;
document.head.appendChild(style);