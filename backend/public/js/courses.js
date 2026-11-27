// =====================================================
// Courses Page — REST API version (replaces Supabase SDK calls)
// =====================================================

let currentCategory = '';
let catalogRequest = 0;

function courseCardText(value) {
    return String(value ?? '').replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character]));
}

function initCoursesPage() {
    const coursesList = document.getElementById('courses-list');
    if (!coursesList) return; // Prevent running on other pages

    setupFilters();
    applyFilters();
}

window.addEventListener('pageshow', event => {
    if (event.persisted) applyFilters({ keepCards: true });
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCoursesPage);
} else {
    initCoursesPage();
}

/**
 * Load courses from the REST API
 */
async function loadCourses(filters = {}, { keepCards = false } = {}) {
    const coursesList = document.getElementById('courses-list');
    if (!coursesList) return;
    const request = ++catalogRequest;
    const hasCards = keepCards && Boolean(coursesList.querySelector('.course-card-link'));

    try {
        // Show loading state
        if (!hasCards) coursesList.innerHTML = courseSkeletons();

        // Build query string
        const params = new URLSearchParams();
        if (filters.category) params.append('category', filters.category);
        if (filters.level) params.append('level', filters.level);

        // Fetch published courses from backend
        const coursesResp = await fetch(`/api/courses?${params.toString()}`, {
            credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(12000)
        });
        if (!coursesResp.ok) throw new Error(`HTTP ${coursesResp.status}`);
        let courses = await coursesResp.json();
        if (request !== catalogRequest) return;
        if (!Array.isArray(courses)) throw new Error('Réponse du catalogue invalide');

        if (filters.search) {
            const q = filters.search.toLowerCase();
            courses = courses.filter(c =>
                c.title.toLowerCase().includes(q) ||
                (c.description || '').toLowerCase().includes(q) ||
                (c.category || '').toLowerCase().includes(q)
            );
        }

        if (!courses || courses.length === 0) {
            coursesList.innerHTML = filters.search || filters.category
                ? '<div class="no-courses"><i class="fas fa-search" aria-hidden="true"></i><strong>Aucun cours ne correspond à ta recherche.</strong><button type="button" class="clear-filters-btn sa-btn sa-btn--secondary sa-btn--sm" onclick="clearCourseFilters()">Effacer les filtres</button></div>'
                : '<div class="no-courses"><i class="fas fa-book-open" aria-hidden="true"></i><strong>Aucun cours disponible pour le moment</strong></div>';
            return;
        }

        // Fetch user enrollments if logged in
        let enrollments = [];
        try {
            const enrollResp = await fetch('/api/courses/user/my-courses', {
                credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(3000)
            });
            if (enrollResp.ok) {
                const result = await enrollResp.json();
                if (Array.isArray(result)) enrollments = result;
            }
        } catch (err) {
            // Not logged in or error — continue without enrollment data
        }
        if (request !== catalogRequest) return;

        // Render courses
        let activeCourseHtml = '';
        let regularCoursesHtml = '';
        
        courses.forEach((course, index) => {
            const enrollment = enrollments.find(e => e.course_id === course.id);
            const isEnrolled = enrollment ? enrollment.is_enrolled : false;
            const progress = Math.round(Math.max(0, Math.min(100, Number(enrollment?.progress) || 0)));

            // Use real stats from the database
            const lessonsCount = Number(course.lessons_count) || 0;
            const quizzesCount = Number(course.quizzes_count) || 0;
            const livesCount = Number(course.lives_count) || 0;

            const ctaText = isEnrolled ? (progress > 0 ? 'Continuer' : 'Commencer') : 'Découvrir le cours';
            const statusLabel = isEnrolled ? (progress >= 100 ? 'Terminé' : 'En cours') : 'Disponible';
            const statusClass = isEnrolled ? (progress >= 100 ? 'is-done' : 'is-active') : 'is-open';
            const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;
            const initial = courseCardText(String(course.title || '?').trim().charAt(0).toUpperCase());

            const cardHtml = `
                <a class="course-card course-card-link${isEnrolled ? ' is-enrolled' : ''}" href="/app/course-details?id=${encodeURIComponent(course.id)}">
                    <div class="course-thumbnail">
                        <span class="course-thumbnail-fallback" aria-hidden="true">${initial}</span>
                        <img data-thumbnail-index="${index}" alt="" decoding="async" ${index > 2 ? 'loading="lazy"' : ''}>
                        <span class="course-status ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="course-info">
                        ${course.category ? `<span class="course-card-category">${courseCardText(formatCategory(course.category))}</span>` : ''}
                        <h3 class="course-card-title">${courseCardText(course.title)}</h3>
                        <div class="course-card-description" dir="auto" data-description-index="${index}"></div>
                        ${isEnrolled ? `
                        <div class="course-card-progress" aria-label="Progression : ${progress} %">
                            <div class="course-card-progress-track"><span style="width: ${progress}%"></span></div>
                            <span class="course-card-progress-value">${progress} %</span>
                        </div>` : ''}
                        <ul class="course-card-stats">
                            <li><i class="fas fa-play-circle" aria-hidden="true"></i> ${plural(lessonsCount, 'leçon')}</li>
                            <li><i class="fas fa-bolt" aria-hidden="true"></i> ${quizzesCount} quiz</li>
                            <li><i class="fas fa-video" aria-hidden="true"></i> ${livesCount} live</li>
                        </ul>
                        <span class="course-card-action${isEnrolled ? ' is-enrolled' : ''}">${ctaText} <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
                    </div>
                </a>
            `;

            if (isEnrolled) {
                activeCourseHtml += cardHtml;
            } else {
                regularCoursesHtml += cardHtml;
            }
        });

        const resumeSection = document.getElementById('resume-learning-section');
        if (resumeSection) {
            resumeSection.hidden = true;
        }

        if (!regularCoursesHtml && !activeCourseHtml) {
            coursesList.innerHTML = '<div class="no-courses"><i class="fas fa-search" aria-hidden="true"></i><strong>Aucun cours trouvé.</strong><button type="button" class="clear-filters-btn sa-btn sa-btn--secondary sa-btn--sm" onclick="clearCourseFilters()">Effacer les filtres</button></div>';
        } else {
            // Enrolled courses first, under their own heading, then the rest of the catalogue.
            const group = (title, icon, count, html) => `
                <section class="courses-group" aria-label="${title}">
                    <h2 class="courses-group-title"><i class="fas fa-${icon}" aria-hidden="true"></i> ${title} <span>${count}</span></h2>
                    <div class="courses-grid">${html}</div>
                </section>`;
            const count = html => (html.match(/class="course-card /g) || []).length;
            coursesList.innerHTML =
                (activeCourseHtml ? group('Mes cours', 'graduation-cap', count(activeCourseHtml), activeCourseHtml) : '') +
                (regularCoursesHtml ? group(activeCourseHtml ? 'Découvrir d’autres cours' : 'Tous les cours', 'compass', count(regularCoursesHtml), regularCoursesHtml) : '');
            for (const description of coursesList.querySelectorAll('[data-description-index]')) {
                description.textContent = CourseMarkdown.preview(courses[Number(description.dataset.descriptionIndex)].description);
            }
            for (const image of coursesList.querySelectorAll('[data-thumbnail-index]')) {
                const course = courses[Number(image.dataset.thumbnailIndex)];
                const source = resolveCourseImage(course.thumbnail_url);
                if (!source) { image.remove(); continue; }
                image.addEventListener('load', () => {
                    const frame = image.closest('.course-thumbnail');
                    if (!frame) return;
                    // 16:9 frame: artwork close to 16:9 fills it; any other shape is shown whole
                    // (contain) over a soft, blurred copy of itself instead of being cropped.
                    const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
                    if (Math.abs(ratio - 16 / 9) > 0.12) {
                        frame.style.setProperty('--thumb', 'url("' + image.currentSrc.replace(/["\\\n\r]/g, encodeURIComponent) + '")');
                        frame.classList.add('is-contained');
                    }
                    frame.classList.add('has-image');
                }, { once: true });
                image.addEventListener('error', () => image.remove(), { once: true });
                image.src = source;
            }
        }

    } catch (error) {
        if (request !== catalogRequest || hasCards) return;
        console.error('Erreur lors du chargement des cours:', error);
        coursesList.innerHTML = `
            <div class="error-message">
                <i class="fas fa-wifi" aria-hidden="true"></i>
                <strong>Impossible de charger les cours pour le moment.</strong>
                <span>Vérifie ta connexion puis réessaie.</span>
                <button type="button" onclick="applyFilters()">Réessayer</button>
            </div>
        `;
    }
}

function courseSkeletons() {
    const card = '<div class="course-card course-card-skeleton" aria-hidden="true"><div class="course-thumbnail"></div><div class="course-info"><span></span><span></span><span></span></div></div>';
    return `<div class="courses-grid" role="status" aria-label="Chargement des cours…">${card.repeat(3)}</div>`;
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

window.applyCategoryFilter = function(category) {
    currentCategory = category;
    
    // Update active class on chips
    document.querySelectorAll('.filter-chips .chip').forEach(chip => {
        const isActive = (chip.dataset.category || '') === category;
        chip.setAttribute('aria-pressed', String(isActive));
        chip.classList.toggle('active', isActive);
    });
    
    applyFilters();
};

window.clearCourseFilters = function() {
    const searchInput = document.getElementById('search-courses');
    if (searchInput) searchInput.value = '';
    window.applyCategoryFilter('');
};

/**
 * Apply current filters
 */
function applyFilters(options) {
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

    loadCourses(filters, options);
}

/**
 * Enroll in a course
 */
async function enrollCourse(courseId, isFree) {
    // Check if logged in
    const userResp = await fetch('/api/user/me', { credentials: 'include' });
    if (!userResp.ok) {
        // A 401 already opened the session-expired dialog; do not navigate away from the student's page.
        if (userResp.status !== 401) showMessage('Impossible de vérifier ton compte. Réessaie dans un instant.', 'error');
        return;
    }
    const { user } = await userResp.json();
    if (!user) {
        showMessage('Vous devez vous connecter d\'abord', 'error');
        setTimeout(() => { window.SyntaSession ? window.SyntaSession.redirectToLogin() : (window.location.href = '/login'); }, 1500);
        return;
    }

    try {
        if (isFree) {
            const resp = await fetch('/api/purchase/course', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId })
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

            showPurchaseConfirmation(courseId, course.title, price, balance);
        }

    } catch (error) {
        console.error('Erreur d\'inscription:', error);
        showMessage('Une erreur s\'est produite lors de l\'inscription : ' + error.message, 'error');
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
        await completePurchase(courseId, price);
    };

    document.getElementById('cancelBuyBtn').onclick = () => { popup.remove(); };

    popup.onclick = (e) => { if (e.target === popup) popup.remove(); };
}

/**
 * Complete the purchase after confirmation
 */
async function completePurchase(courseId, price) {
    try {
        const response = await fetch('/api/purchase/course', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId })
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
