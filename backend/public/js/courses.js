// =====================================================
// Courses Page - Backend Integration (French)
// =====================================================

// Local Caching & Request Deduplication
var coursesCache = window.coursesCache || new Map();
var pendingRequests = window.pendingRequests || new Map();
window.coursesCache = coursesCache;
window.pendingRequests = pendingRequests;

document.addEventListener('turbo:before-cache', function() {
    const coursesList = document.getElementById('courses-list');
    if (coursesList) {
        const loadingEls = coursesList.querySelectorAll('.loading');
        loadingEls.forEach(el => el.remove());
    }
});

const initCoursesLogicWrapper = async function() {
    if (!document.getElementById('courses-list')) return;
    if (!window.SyntaAPI) { console.error('api-client.js manquant'); return; }
    if (window.appUserState) {
        initializeCourses();
    } else {
        document.addEventListener('appStateHydrated', function () { initializeCourses(); }, { once: true });
    }
};
initCoursesLogicWrapper();
document.addEventListener('turbo:load', initCoursesLogicWrapper);

async function initializeCourses() {
    if (!window.SyntaAPI) return;
    try {
        await window.SyntaAPI.waitForSupabase();
        loadCourses();
        setupFilters();
    } catch (err) {
        console.error('Failed to initialize:', err);
        const el = document.getElementById('courses-list');
        if (el) el.innerHTML = '<div class="error-message">Erreur de connexion. Veuillez rafraichir.</div>';
    }
}

async function loadCourses(filters = {}) {
    const coursesList = document.getElementById('courses-list');
    if (!coursesList) return;
    const cacheKey = 'courses_' + JSON.stringify(filters);
    if (coursesCache.has(cacheKey)) { renderCourses(coursesCache.get(cacheKey)); }
    else { coursesList.innerHTML = '<div class="loading">Chargement des cours...</div>'; }
    if (pendingRequests.has(cacheKey)) pendingRequests.get(cacheKey).abort();
    const abortController = new AbortController();
    pendingRequests.set(cacheKey, abortController);
    try {
        const courses = await window.SyntaAPI.fetchCourses(filters);
        let enrollments = [];
        const authenticated = await window.SyntaAPI.isAuthenticated();
        if (authenticated) {
            try { enrollments = await window.SyntaAPI.fetchMyEnrollments(); }
            catch (e) { console.error('Erreur inscriptions:', e); }
        }
        const dataPayload = { courses, enrollments };
        const newDataStr = JSON.stringify(dataPayload);
        const oldDataStr = coursesCache.has(cacheKey) ? JSON.stringify(coursesCache.get(cacheKey)) : null;
        if (newDataStr !== oldDataStr) { coursesCache.set(cacheKey, dataPayload); renderCourses(dataPayload); }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error fetching courses:', error);
            if (!coursesCache.has(cacheKey)) coursesList.innerHTML = '<div class="error-message">Erreur de chargement.</div>';
        }
    } finally {
        if (pendingRequests.get(cacheKey) === abortController) pendingRequests.delete(cacheKey);
    }
}

function renderCourses(dataPayload) {
    const coursesList = document.getElementById('courses-list');
    if (!coursesList) return;
    const { courses, enrollments } = dataPayload;
    if (!courses || courses.length === 0) {
        coursesList.innerHTML = '<div class="no-courses">Aucun cours disponible pour le moment</div>';
        return;
    }
    coursesList.innerHTML = courses.map(course => {
        const enrollment = enrollments.find(e => e.course_id === course.id);
        const isEnrolled = !!enrollment;
        const progress = enrollment ? enrollment.progress : 0;
        const imgId = `course-img-${course.id}`;
        const hasSignedUrl = course.thumbnail_url && course.thumbnail_url.startsWith('http');
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        let initialImgSrc = `https://via.placeholder.com/400x200/667eea/ffffff?text=${encodeURIComponent(course.title || 'Cours')}`;
        if (hasSignedUrl) { initialImgSrc = course.thumbnail_url; }
        else if (isLocal && course.thumbnail_url && course.thumbnail_url.startsWith('Courses-th/')) {
            initialImgSrc = '/source/' + course.thumbnail_url.replace('Courses-th/', '');
        }
        return `<div class="course-card" data-course-id="${course.id}">
            <div class="course-thumbnail"><img id="${imgId}" src="${initialImgSrc}" alt="${course.title}"></div>
            <div class="course-info">
                <h3 class="course-title">${course.title}</h3>
                <p class="course-description">${course.description || 'Description du cours'}</p>
                <div class="course-meta">
                    <span class="course-category">${formatCategory(course.category)}</span>
                    <span class="course-level">${formatLevel(course.level)}</span>
                </div>
                ${isEnrolled ? `<div class="course-progress"><div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div><span class="progress-text">${progress}% complete</span></div>` : ''}
                <button class="preview-btn" onclick="viewCourse('${course.id}')">Apercu du cours</button>
                <div class="course-footer">
                    ${course.is_free ? '<span class="course-price free">Gratuit</span>' : `<span class="course-price"><img src="/source/dt.png" alt="DT" class="dt-currency-icon"> ${course.price}</span>`}
                    ${isEnrolled
                        ? `<button class="course-btn enrolled" onclick="viewCourse('${course.id}')">Continuer</button>`
                        : `<button class="course-btn" onclick="enrollCourse('${course.id}',${course.is_free})">${course.is_free ? "S'inscrire" : 'Acheter'}</button>`}
                </div>
            </div>
        </div>`;
    }).join('');
    // Background thumbnail fetch
    courses.forEach(async (course) => {
        if (course.thumbnail_url && !course.thumbnail_url.startsWith('http')) {
            const imgId = `course-img-${course.id}`;
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            if (isLocal && course.thumbnail_url.startsWith('Courses-th/')) return;
            try {
                const url = `${window.SyntaAPI.BACKEND_URL}/api/content/thumbnail/${encodeURIComponent(course.thumbnail_url)}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    const imgElement = document.getElementById(imgId);
                    if (imgElement && data.url) imgElement.src = data.url;
                }
            } catch (err) { console.error('Thumbnail fetch failed:', course.title, err); }
        }
    });
}

function setupFilters() {
    const categoryFilter = document.getElementById('category-filter');
    const levelFilter = document.getElementById('level-filter');
    const searchInput = document.getElementById('search-courses');
    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if (levelFilter) levelFilter.addEventListener('change', applyFilters);
    if (searchInput) {
        let t;
        searchInput.addEventListener('input', () => { clearTimeout(t); t = setTimeout(applyFilters, 500); });
    }
}

function applyFilters() {
    const filters = {};
    const cat = document.getElementById('category-filter');
    const lev = document.getElementById('level-filter');
    const src = document.getElementById('search-courses');
    if (cat && cat.value) filters.category = cat.value;
    if (lev && lev.value) filters.level = lev.value;
    if (src && src.value.trim()) filters.search = src.value.trim();
    loadCourses(filters);
}

async function enrollCourse(courseId, isFree) {
    const authenticated = await window.SyntaAPI.isAuthenticated();
    if (!authenticated) {
        window.SyntaAPI.showError("Vous devez vous connecter d'abord");
        setTimeout(() => { window.location.href = '/login'; }, 1500);
        return;
    }
    try {
        if (isFree) {
            await window.SyntaAPI.enrollFreeCourse(courseId);
            window.SyntaAPI.showSuccess('Inscription reussie !');
            loadCourses();
        } else {
            const user = await window.SyntaAPI.getCurrentUser();
            if (!user) { window.SyntaAPI.showError('Utilisateur non trouve'); return; }
            const { data: userData } = await window.SyntaAPI.supabase.from('Users').select('balance').eq('id', user.id).single();
            const { data: course } = await window.SyntaAPI.supabase.from('courses').select('price, title').eq('id', courseId).single();
            const balance = userData?.balance || 0;
            const price = course?.price || 0;
            if (balance < price) {
                window.SyntaAPI.showError('Solde insuffisant. Redirection...');
                setTimeout(() => { window.location.href = '/app/paiement'; }, 1500);
                return;
            }
            showPurchaseConfirmation(courseId, course.title, price, balance);
        }
    } catch (error) {
        window.SyntaAPI.showError("Erreur: " + error.message);
    }
}

function showPurchaseConfirmation(courseId, courseTitle, price, currentBalance) {
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;';
    popup.innerHTML = `<div style="background:white;border-radius:16px;padding:2rem;max-width:450px;width:100%;margin:1rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <h2 style="color:#1e293b;margin-bottom:1rem;">Confirmer l'achat</h2>
        <div style="background:#f8fafc;border-radius:12px;padding:1rem;margin-bottom:1.5rem;">
            <div><strong>Cours:</strong> ${courseTitle}</div>
            <div><strong>Prix:</strong> ${price} DT</div>
            <div><strong>Solde actuel:</strong> ${currentBalance.toFixed(2)} DT</div>
            <div><strong>Nouveau solde:</strong> ${(currentBalance - price).toFixed(2)} DT</div>
        </div>
        <div style="display:flex;gap:1rem;">
            <button id="confirmBuyBtn" style="flex:1;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:10px;padding:0.875rem;font-weight:600;cursor:pointer;">Confirmer</button>
            <button id="cancelBuyBtn" style="flex:1;background:#e5e7eb;color:#1e293b;border:none;border-radius:10px;padding:0.875rem;font-weight:600;cursor:pointer;">Annuler</button>
        </div>
    </div>`;
    document.body.appendChild(popup);
    document.getElementById('confirmBuyBtn').onclick = async () => { popup.remove(); await completePurchase(courseId, price); };
    document.getElementById('cancelBuyBtn').onclick = () => popup.remove();
    popup.onclick = (e) => { if (e.target === popup) popup.remove(); };
}

async function completePurchase(courseId, price) {
    try {
        const user = await window.SyntaAPI.getCurrentUser();
        const response = await fetch(`${window.SyntaAPI.BACKEND_URL}/api/purchase/course`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId, userId: user.id })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Erreur achat");
        window.SyntaAPI.showSuccess('Cours achete avec succes!');
        setTimeout(() => location.reload(), 1500);
    } catch (error) { window.SyntaAPI.showError(error.message); }
}

function viewCourse(courseId) { window.location.href = `/app/course-details?id=${courseId}`; }

function formatCategory(category) {
    return { 'bac-info': 'Bac Informatique', 'bac-math': 'Bac Mathematiques', 'web-dev': 'Dev Web', 'general': 'General' }[category] || category || '';
}
function formatLevel(level) {
    return { 'beginner': 'Debutant', 'intermediate': 'Intermediaire', 'advanced': 'Avance' }[level] || level || '';
}
