// =====================================================
// Courses Page — REST API version (replaces Supabase SDK calls)
// =====================================================

async function initCoursesPage() {
    const coursesList = document.getElementById('courses-list');
    if (!coursesList) return; // Prevent running on other pages

    try {
        await loadCourses();
        setupFilters();
    } catch (err) {
        console.error('Failed to initialize courses page:', err);
        if (coursesList) {
            coursesList.innerHTML = '<div class="error-message">Erreur de connexion à la base de données. Veuillez rafraîchir la page.</div>';
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCoursesPage);
} else {
    initCoursesPage();
}

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

        if (filters.search) {
            const q = filters.search.toLowerCase();
            courses = courses.filter(c =>
                c.title.toLowerCase().includes(q) ||
                (c.description || '').toLowerCase().includes(q) ||
                (c.category || '').toLowerCase().includes(q)
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
        let activeCourseHtml = '';
        let regularCoursesHtml = '';
        
        courses.forEach(course => {
            const enrollment = enrollments.find(e => e.course_id === course.id);
            const isEnrolled = enrollment ? enrollment.is_enrolled : false;
            const progress = enrollment ? (enrollment.progress || 0) : 0;

            let imgSrc = course.thumbnail_url && course.thumbnail_url.startsWith('http')
                ? course.thumbnail_url
                : `https://via.placeholder.com/400x225/fff7ed/f97316?text=${encodeURIComponent(course.title)}`;
                
            // Generate some fake stats if they don't exist in DB yet
            const lessonsCount = course.lessons_count || Math.floor(Math.random() * 10) + 5;
            const quizzesCount = course.quizzes_count || Math.floor(Math.random() * 4) + 1;
            const livesCount = course.lives_count || Math.floor(Math.random() * 2) + 1;

            const ctaText = isEnrolled ? 'Continuer le cours &rarr;' : 'Découvrir le cours &rarr;';
            const statusLabel = isEnrolled ? 'En cours' : 'Disponible';
            const statusColor = isEnrolled ? '#f97316' : '#10b981';

            const cardHtml = `
                <div class="course-card" style="background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.04); display: flex; flex-direction: column; transition: transform 0.3s, box-shadow 0.3s; cursor: pointer;" onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 10px 25px rgba(0,0,0,0.08)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 20px rgba(0,0,0,0.04)';" onclick="window.location.href='/app/course-details?id=${course.id}'">
                    
                    <div class="course-thumbnail" style="position: relative; padding-top: 56.25%;">
                        <img src="${imgSrc}" alt="${course.title}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
                        <div style="position: absolute; top: 1rem; left: 1rem; display: flex; gap: 0.5rem;">
                            <span style="background: ${statusColor}; color: white; padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                                ${statusLabel}
                            </span>
                        </div>
                    </div>
                    
                    <div class="course-info" style="padding: 1.2rem; flex: 1; display: flex; flex-direction: column;">
                        ${course.category ? `<span style="color: #64748b; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.4rem; letter-spacing: 0.5px;">${formatCategory(course.category)}</span>` : ''}
                        
                        <h3 style="margin: 0 0 1rem; color: #1e293b; font-size: 1.1rem; font-weight: 700; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${course.title}</h3>
                        
                        <!-- Progress -->
                        ${progress > 0 || isEnrolled ? `
                        <div style="margin-bottom: 1rem;">
                            <div style="display: flex; justify-content: flex-end; margin-bottom: 0.3rem;">
                                <span style="font-size: 0.75rem; color: #64748b; font-weight: 600;">${progress}% terminé</span>
                            </div>
                            <div style="height: 4px; background: #e2e8f0; border-radius: 10px; overflow: hidden;">
                                <div style="height: 100%; background: #f97316; width: ${progress}%; border-radius: 10px;"></div>
                            </div>
                        </div>
                        ` : '<div style="flex: 1;"></div>'}
                        
                        <!-- Stats Row -->
                        <div style="display: flex; justify-content: space-between; padding-top: 0.8rem; border-top: 1px solid #f1f5f9; margin-bottom: 1rem; margin-top: auto;">
                            <div style="display: flex; align-items: center; gap: 0.3rem; color: #64748b; font-size: 0.8rem; font-weight: 500;">
                                <i class="fas fa-book-open" style="color: #cbd5e1;"></i> ${lessonsCount} leçons
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.3rem; color: #64748b; font-size: 0.8rem; font-weight: 500;">
                                <i class="fas fa-question-circle" style="color: #cbd5e1;"></i> ${quizzesCount} quiz
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.3rem; color: #64748b; font-size: 0.8rem; font-weight: 500;">
                                <i class="fas fa-video" style="color: #cbd5e1;"></i> ${livesCount} live
                            </div>
                        </div>
                        
                        <!-- CTA Button -->
                        <button style="width: 100%; background: ${isEnrolled ? '#f97316' : '#f8fafc'}; color: ${isEnrolled ? 'white' : '#f97316'}; border: ${isEnrolled ? 'none' : '1px solid #fed7aa'}; padding: 0.75rem; border-radius: 10px; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; font-family: inherit;">
                            ${ctaText}
                        </button>
                    </div>
                </div>
            `;

            if (isEnrolled) {
                activeCourseHtml += cardHtml;
            } else {
                regularCoursesHtml += cardHtml;
            }
        });

        const resumeSection = document.getElementById('resume-learning-section');
        if (resumeSection) {
            resumeSection.style.display = 'none';
        }

        if (!regularCoursesHtml && !activeCourseHtml) {
            coursesList.innerHTML = '<div class="no-courses" style="text-align: center; padding: 3rem; color: #64748b; font-size: 1.1rem;">Aucun cours trouvé. <button onclick="applyCategoryFilter(\'\')" style="background: none; border: none; color: #f97316; cursor: pointer; font-weight: 600; text-decoration: underline; font-size: 1rem; padding: 0;">Effacer les filtres</button></div>';
        } else {
            // Group them all into the same grid, enrolled courses first
            coursesList.innerHTML = activeCourseHtml + regularCoursesHtml;
        }

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

let currentCategory = '';

window.applyCategoryFilter = function(category) {
    currentCategory = category;
    
    // Update active class on chips
    document.querySelectorAll('.filter-chips .chip').forEach(chip => {
        if (
            (category === '' && chip.textContent.trim() === 'Tous les cours') ||
            (chip.textContent.trim().toLowerCase().includes(category.toLowerCase()) && category !== '')
        ) {
            chip.classList.add('active');
            chip.style.background = '#f97316';
            chip.style.color = 'white';
            chip.style.border = 'none';
        } else {
            chip.classList.remove('active');
            chip.style.background = 'white';
            chip.style.color = '#64748b';
            chip.style.border = '1px solid #e2e8f0';
        }
    });
    
    applyFilters();
};

/**
 * Apply current filters
 */
function applyFilters() {
    const filters = {};

    const levelFilter = document.getElementById('level-filter');
    const searchInput = document.getElementById('search-courses');

    if (currentCategory) {
        filters.category = currentCategory;
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
    @keyframes fillBar {
        from { width: 0%; }
        to { width: var(--target-width); }
    }
`;
document.head.appendChild(style);