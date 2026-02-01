// =====================================================
// Course Details Page - Backend Integration (French)
// =====================================================

let currentCourse = null;
let currentEnrollment = null;

document.addEventListener('DOMContentLoaded', async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');
    
    if (!courseId) {
        showError('ID du cours manquant');
        setTimeout(() => {
            window.location.href = 'courses.html';
        }, 2000);
        return;
    }
    
    await loadCourseDetails(courseId);
});

/**
 * Load course details with modules and lessons
 */
async function loadCourseDetails(courseId) {
    try {
        // Fetch course details from courses table
        const { data: course, error: courseError } = await window.SyntaAPI.supabase
            .from('courses')
            .select('*')
            .eq('id', courseId)
            .eq('is_published', true)
            .single();
        
        if (courseError) throw courseError;
        if (!course) {
            showError('Cours non trouvé');
            setTimeout(() => window.location.href = 'courses.html', 2000);
            return;
        }
        
        currentCourse = course;
        
        // Check enrollment status
        const hasAccess = await checkUserAccess(courseId);
        
        // Fetch modules and lessons from Supabase
        const modulesWithLessons = await fetchModulesAndLessons(courseId);
        
        // Count total lessons
        const totalLessons = modulesWithLessons.reduce((sum, module) => sum + (module.lessons?.length || 0), 0);
        
        // Render course information
        await renderCourseInfo(course, totalLessons, hasAccess);
        
        // Render modules and lessons
        renderModulesAndLessons(modulesWithLessons, hasAccess);
        
    } catch (error) {
        console.error('Erreur lors du chargement du cours:', error);
        showError('Une erreur s\'est produite lors du chargement des détails du cours');
    }
}

/**
 * Fetch modules and lessons from Supabase
 */
async function fetchModulesAndLessons(courseId) {
    try {
        if (!window.SyntaAPI.supabase) {
            throw new Error('Supabase non initialisé');
        }
        
        // Fetch modules for this course
        const { data: modules, error: modulesError } = await window.SyntaAPI.supabase
            .from('modules')
            .select('*')
            .eq('course_id', courseId)
            .order('order_index', { ascending: true });
        
        if (modulesError) throw modulesError;
        
        if (!modules || modules.length === 0) {
            return [];
        }
        
        // Fetch lessons for all modules
        const moduleIds = modules.map(m => m.id);
        const { data: lessons, error: lessonsError } = await window.SyntaAPI.supabase
            .from('lessons')
            .select('*')
            .in('module_id', moduleIds)
            .order('order_index', { ascending: true });
        
        if (lessonsError) throw lessonsError;
        
        // Combine modules with their lessons
        const modulesWithLessons = modules.map(module => ({
            ...module,
            lessons: (lessons || []).filter(lesson => lesson.module_id === module.id)
        }));
        
        return modulesWithLessons;
        
    } catch (error) {
        console.error('Erreur lors de la récupération des modules et leçons:', error);
        return [];
    }
}

/**
 * Check if user has access to course (via enrollment)
 */
async function checkUserAccess(courseId) {
    try {
        const authenticated = await window.SyntaAPI.isAuthenticated();
        if (!authenticated) return false;
        
        const user = await window.SyntaAPI.getCurrentUser();
        if (!user) return false;
        
        // Check enrollments table
        const { data: enrollment, error } = await window.SyntaAPI.supabase
            .from('enrollments')
            .select('*')
            .eq('user_id', user.id)
            .eq('course_id', courseId)
            .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Error checking enrollment:', error);
            return false;
        }
        
        // Check if enrollment exists and is not expired
        if (enrollment) {
            currentEnrollment = enrollment;
            if (!enrollment.expires_at || new Date(enrollment.expires_at) > new Date()) {
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error('Error checking access:', error);
        return false;
    }
}

/**
 * Render course information
 */
async function renderCourseInfo(course, totalLessons, hasAccess) {
    // Update thumbnail
    const thumbnail = document.getElementById('course-thumbnail');
    
    if (course.thumbnail_url) {
        let thumbnailUrl = course.thumbnail_url;
        
        // If it's an R2 key (not a full URL), get signed URL
        if (!thumbnailUrl.startsWith('http')) {
            try {
                const response = await fetch(`${window.SyntaAPI.BACKEND_URL}/api/content/thumbnail/${encodeURIComponent(thumbnailUrl)}`);
                if (response.ok) {
                    const data = await response.json();
                    thumbnailUrl = data.url;
                }
            } catch (err) {
                console.warn('Failed to get thumbnail signed URL:', err);
            }
        }
        
        thumbnail.innerHTML = `<img src="${thumbnailUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;" alt="${course.title}">`;
    } else {
        thumbnail.textContent = course.title.charAt(0).toUpperCase();
    }
    
    // Update title
    document.getElementById('course-title').textContent = course.title;
    
    // Update description
    document.getElementById('course-description').textContent = course.description || 'Aucune description disponible';
    
    // Update price
    const currentPrice = document.getElementById('current-price');
    const originalPrice = document.getElementById('original-price');
    
    if (course.is_free) {
        currentPrice.textContent = 'Gratuit';
        originalPrice.style.display = 'none';
    } else {
        currentPrice.textContent = `${course.price} dt`;
        // Show original price if there's a discount (example)
        if (course.original_price && course.original_price > course.price) {
            originalPrice.textContent = `${course.original_price} dt`;
            originalPrice.style.display = 'block';
        }
    }
    
    // Update lessons count
    document.getElementById('lessons-count').textContent = totalLessons;
    
    // Update language (default to Français)
    document.getElementById('course-language').textContent = 'Français';
    
    // Update buy button
    const buyButton = document.getElementById('buy-button');
    if (hasAccess) {
        buyButton.textContent = 'Continuer le cours';
        buyButton.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    } else {
        buyButton.textContent = course.is_free ? 'S\'inscrire gratuitement' : 'Acheter maintenant';
    }
    
    buyButton.onclick = () => enrollInCourse(course.id, course.is_free, hasAccess);
}

/**
 * Render modules and lessons
 */
function renderModulesAndLessons(modules, hasAccess) {
    const container = document.getElementById('modules-container');
    
    if (!modules || modules.length === 0) {
        container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 2rem;">Aucun module disponible pour ce cours.</p>';
        return;
    }
    
    container.innerHTML = modules.map((module, moduleIndex) => {
        const lessons = module.lessons || [];
        
        return `
            <div class="module-card">
                <div class="module-header" onclick="toggleModule(${moduleIndex})">
                    <h3>${module.title}</h3>
                    <span class="module-toggle" id="toggle-${moduleIndex}">▼</span>
                </div>
                <div class="lessons-list" id="lessons-${moduleIndex}">
                    ${lessons.length > 0 ? lessons.map(lesson => {
                        const isLocked = !hasAccess && !lesson.is_preview;
                        const duration = formatDuration(lesson.duration);
                        
                        return `
                            <div class="lesson-item ${isLocked ? 'locked' : ''}" ${!isLocked ? `onclick="playLesson('${lesson.id}')"` : ''} style="${!isLocked ? 'cursor: pointer;' : ''}">
                                <div class="lesson-info">
                                    <span class="lesson-icon">🎥</span>
                                    <div class="lesson-details">
                                        <div class="lesson-title">${lesson.title}</div>
                                        ${lesson.duration && lesson.duration > 0 ? `<div class="lesson-duration">${duration}</div>` : ''}
                                    </div>
                                </div>
                                <div class="lesson-status">
                                    ${isLocked ? 
                                        '<span class="lock-icon">🔒</span>' : 
                                        '<span class="play-icon">▶</span>'
                                    }
                                </div>
                            </div>
                        `;
                    }).join('') : '<p style="padding: 1rem; color: #94a3b8; text-align: center;">Aucune leçon dans ce module</p>'}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Toggle module visibility
 */
function toggleModule(index) {
    const lessonsList = document.getElementById(`lessons-${index}`);
    const toggle = document.getElementById(`toggle-${index}`);
    
    if (lessonsList.classList.contains('open')) {
        lessonsList.classList.remove('open');
        toggle.classList.remove('open');
    } else {
        lessonsList.classList.add('open');
        toggle.classList.add('open');
    }
}

/**
 * Format duration from seconds to MM:SS
 */
function formatDuration(seconds) {
    if (!seconds) return '00:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Play lesson (open video player)
 */
async function playLesson(lessonId) {
    try {
        // Fetch lesson details
        const { data: lesson, error } = await window.SyntaAPI.supabase
            .from('lessons')
            .select('*')
            .eq('id', lessonId)
            .single();
        
        if (error) throw error;
        
        if (lesson.video_key) {
            let videoUrl;
            
            try {
                // Try to get signed URL from backend API
                const contentData = await window.SyntaAPI.getContentUrl(lessonId);
                videoUrl = contentData.videoUrl;
                
                if (!videoUrl) {
                    throw new Error('No video URL returned from backend');
                }
            } catch (err) {
                console.error('Backend not available:', err);
                
                // Try direct URL if configured
                videoUrl = window.SyntaAPI.getDirectVideoUrl(lesson.video_key);
                
                if (!videoUrl) {
                    // Show helpful error message based on environment
                    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
                    
                    if (isProduction) {
                        showError(`Pour lire les vidéos en production :<br><br>
                            <strong>Option 1 :</strong> Configurez R2_PUBLIC_URL<br>
                            Dans api-client.js, définissez votre URL publique R2<br><br>
                            <strong>Option 2 :</strong> Déployez le backend<br>
                            Déployez le backend sur un serveur et configurez BACKEND_URL<br><br>
                            <strong>Vidéo de démo utilisée temporairement</strong>`);
                    } else {
                        showError(`Le backend n'est pas démarré.<br><br>
                            <strong>Pour lire les vidéos :</strong><br>
                            1. Ouvrez un terminal dans le dossier backend<br>
                            2. Exécutez: npm install (première fois)<br>
                            3. Exécutez: npm start<br>
                            4. Accédez au site via http://localhost ou http://127.0.0.1<br><br>
                            <strong>Vidéo de démo utilisée temporairement</strong>`);
                    }
                    
                    // Use demo video as last resort
                    videoUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
                    console.log('🎬 Vidéo de démo utilisée. Clé vidéo:', lesson.video_key);
                }
            }
            
            // Mark lesson progress
            await markLessonProgress(lessonId);
            
            // Show video in main content area
            await showVideoInMainArea(lesson, videoUrl);
        } else {
            showError('Vidéo non disponible pour cette leçon');
        }
        
    } catch (error) {
        console.error('Erreur lors de la lecture de la leçon:', error);
        showError('Impossible de lire la vidéo');
    }
}

/**
 * Mark lesson progress in database
 */
async function markLessonProgress(lessonId) {
    try {
        const user = await window.SyntaAPI.getCurrentUser();
        if (!user) return;
        
        // Insert or update lesson progress
        const { error } = await window.SyntaAPI.supabase
            .from('lesson_progress')
            .upsert({
                user_id: user.id,
                lesson_id: lessonId,
                progress_percentage: 100,
                completed: true,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,lesson_id'
            });
        
        if (error) console.error('Error updating progress:', error);
        
        // Update course progress
        if (currentCourse) {
            await updateCourseProgress(user.id, currentCourse.id);
        }
    } catch (error) {
        console.error('Error marking progress:', error);
    }
}

/**
 * Update overall course progress
 */
async function updateCourseProgress(userId, courseId) {
    try {
        // Call the PostgreSQL function to update progress
        const { error } = await window.SyntaAPI.supabase
            .rpc('update_course_progress', {
                p_user_id: userId,
                p_course_id: courseId
            });
        
        if (error) console.error('Error updating course progress:', error);
    } catch (error) {
        console.error('Error in updateCourseProgress:', error);
    }
}

/**
 * Show video in main content area
 */
async function showVideoInMainArea(lesson, videoUrl) {
    const courseMain = document.querySelector('.course-main');
    const courseSidebar = document.querySelector('.course-sidebar');
    const modulesContainer = document.getElementById('modules-container');
    
    // Store original content to restore later
    if (!courseMain.dataset.originalContent) {
        courseMain.dataset.originalContent = courseMain.innerHTML;
    }
    if (!courseSidebar.dataset.originalContent) {
        courseSidebar.dataset.originalContent = courseSidebar.innerHTML;
    }
    
    // Fetch PDF URLs if pdf_key exists
    let pdfUrls = [];
    if (lesson.pdf_key) {
        try {
            const response = await fetch(`${window.SyntaAPI.BACKEND_URL}/api/content/lesson/${lesson.id}`);
            if (response.ok) {
                const data = await response.json();
                
                // Handle multiple PDFs - pdf_key can be:
                // 1. A single string: "file.pdf"
                // 2. Comma-separated: "file1.pdf,file2.pdf"
                // 3. JSON array: ["file1.pdf", "file2.pdf"]
                let pdfKeys = [];
                if (typeof lesson.pdf_key === 'string') {
                    if (lesson.pdf_key.startsWith('[')) {
                        // JSON array
                        try {
                            pdfKeys = JSON.parse(lesson.pdf_key);
                        } catch (e) {
                            pdfKeys = [lesson.pdf_key];
                        }
                    } else if (lesson.pdf_key.includes(',')) {
                        // Comma-separated
                        pdfKeys = lesson.pdf_key.split(',').map(k => k.trim());
                    } else {
                        // Single file
                        pdfKeys = [lesson.pdf_key];
                    }
                } else if (Array.isArray(lesson.pdf_key)) {
                    pdfKeys = lesson.pdf_key;
                }
                
                // Fetch signed URLs for all PDFs
                for (const pdfKey of pdfKeys) {
                    if (pdfKey) {
                        try {
                            const pdfResponse = await fetch(`${window.SyntaAPI.BACKEND_URL}/api/content/lesson/${lesson.id}`);
                            if (pdfResponse.ok) {
                                const pdfData = await pdfResponse.json();
                                if (pdfData.pdfUrl) {
                                    pdfUrls.push({
                                        url: pdfData.pdfUrl,
                                        name: pdfKey.split('/').pop().replace('.pdf', '')
                                    });
                                }
                            }
                        } catch (err) {
                            console.warn('Failed to fetch PDF:', pdfKey, err);
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('Failed to fetch PDF URLs:', err);
        }
    }
    
    // Generate PDF buttons HTML
    let pdfButtonsHtml = '';
    if (pdfUrls.length > 0) {
        pdfButtonsHtml = `
            <div style="margin-top: 0.75rem;">
                <p style="font-size: 0.9rem; color: #64748b; margin-bottom: 0.5rem; font-weight: 500;">
                    📄 Documents de la leçon
                </p>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    ${pdfUrls.map((pdf, index) => `
                        <a href="${pdf.url}" target="_blank" style="
                            display: inline-flex;
                            align-items: center;
                            gap: 0.5rem;
                            padding: 0.6rem 1.2rem;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            text-decoration: none;
                            border-radius: 8px;
                            font-weight: 600;
                            font-size: 0.9rem;
                            transition: transform 0.2s ease;
                        " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                            <i class="fas fa-file-pdf"></i>
                            ${pdfUrls.length === 1 ? 'Voir le document' : `Document ${index + 1}`}
                        </a>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Replace main content with video player
    courseMain.innerHTML = `
        <div style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
            <video id="current-lesson-video" controls autoplay controlsList="nodownload" oncontextmenu="return false;" style="
                width: 100%;
                height: auto;
                max-height: calc(100vh - 320px);
                border-radius: 12px;
                background: #000;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            ">
                <source src="${videoUrl}" type="video/mp4">
                Votre navigateur ne supporte pas la vidéo.
            </video>
        </div>
        
        <div style="margin-top: 1rem; flex-shrink: 0;">
            <h1 style="font-size: 1.5rem; color: #1e293b; margin-bottom: 0.5rem; font-weight: 700;">
                ${lesson.title}
            </h1>
            ${lesson.description ? `
                <p style="color: #64748b; line-height: 1.6; margin-bottom: 0.5rem; font-size: 0.95rem;">
                    ${lesson.description}
                </p>
            ` : ''}
            ${pdfButtonsHtml}
        </div>
    `;
    
    // Replace sidebar with modules section
    if (modulesContainer && courseSidebar) {
        const modulesClone = modulesContainer.cloneNode(true);
        modulesClone.style.cssText = '';
        courseSidebar.innerHTML = '';
        courseSidebar.appendChild(modulesClone);
        
        // Highlight the current lesson
        setTimeout(() => {
            const allLessons = courseSidebar.querySelectorAll('.lesson-item');
            allLessons.forEach(lessonItem => {
                // Remove previous active state
                lessonItem.style.background = '';
                
                // Check if this is the current lesson by comparing onclick attribute
                const onclickAttr = lessonItem.getAttribute('onclick');
                if (onclickAttr && onclickAttr.includes(`'${lesson.id}'`)) {
                    lessonItem.style.background = '#c3f3ff';
                    lessonItem.style.borderLeft = '4px solid #667eea';
                }
            });
        }, 100);
    }
    
    // Disable right-click on video
    setTimeout(() => {
        const video = document.getElementById('current-lesson-video');
        if (video) {
            video.addEventListener('contextmenu', (e) => e.preventDefault());
        }
    }, 100);
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Restore course content
 */
function restoreCourseContent() {
    const courseMain = document.querySelector('.course-main');
    const courseSidebar = document.querySelector('.course-sidebar');
    
    if (courseMain.dataset.originalContent) {
        courseMain.innerHTML = courseMain.dataset.originalContent;
        delete courseMain.dataset.originalContent;
    }
    
    if (courseSidebar.dataset.originalContent) {
        courseSidebar.innerHTML = courseSidebar.dataset.originalContent;
        delete courseSidebar.dataset.originalContent;
    }
}

/**
 * Open video modal (legacy function - now redirects to inline player)
 */
function openVideoModal(title, videoUrl) {
    // This function is kept for compatibility but redirects to inline player
    showVideoInMainArea({ title, description: '' }, videoUrl);
}

/**
 * Enroll in course
 */
async function enrollInCourse(courseId, isFree, hasAccess) {
    if (hasAccess) {
        // Already enrolled, just scroll to modules
        document.getElementById('modules-container').scrollIntoView({ behavior: 'smooth' });
        return;
    }
    
    const authenticated = await window.SyntaAPI.isAuthenticated();
    if (!authenticated) {
        showError('Vous devez vous connecter d\'abord');
        setTimeout(() => {
            window.location.href = '../auth/login.html';
        }, 1500);
        return;
    }
    
    try {
        const user = await window.SyntaAPI.getCurrentUser();
        if (!user) {
            showError('Utilisateur non trouvé');
            return;
        }
        
        if (isFree) {
            // Create enrollment directly in database
            const { error } = await window.SyntaAPI.supabase
                .from('enrollments')
                .insert({
                    user_id: user.id,
                    course_id: courseId,
                    amount_paid: 0,
                    enrolled_at: new Date().toISOString()
                });
            
            if (error) {
                if (error.code === '23505') {
                    showError('Vous êtes déjà inscrit à ce cours');
                } else {
                    throw error;
                }
                return;
            }
            
            showSuccess('Inscription réussie au cours !');
            setTimeout(() => {
                location.reload();
            }, 1500);
        } else {
            // Redirect to payment page
            window.location.href = `../paiement/paiement.html?course=${courseId}`;
        }
    } catch (error) {
        console.error('Erreur d\'inscription:', error);
        showError('Une erreur s\'est produite lors de l\'inscription');
    }
}

/**
 * Show error message
 */
function showError(message) {
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
        background: #dc3545;
        max-width: 400px;
        line-height: 1.6;
    `;
    
    messageDiv.innerHTML = message;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 8000); // Longer timeout for error messages with instructions
}

/**
 * Show success message
 */
function showSuccess(message) {
    showMessage(message, 'success');
}

/**
 * Show message
 */
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
        messageDiv.style.background = '#10b981';
    } else {
        messageDiv.style.background = '#667eea';
    }
    
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// Add animation styles
if (!document.getElementById('message-animations')) {
    const style = document.createElement('style');
    style.id = 'message-animations';
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
}

/**
 * Render course modules and lessons
 */
function renderCourseContent(course, hasAccess, progress) {
    const contentContainer = document.getElementById('course-content');
    if (!contentContainer) return;
    
    const completedLessons = progress?.completed_lessons || [];
    
    contentContainer.innerHTML = course.modules.map(module => `
        <div class="module-card">
            <div class="module-header">
                <h3>${module.title}</h3>
                ${module.description ? `<p>${module.description}</p>` : ''}
            </div>
            
            <div class="lessons-list">
                ${module.lessons.map(lesson => {
                    const isCompleted = completedLessons.includes(lesson.id);
                    const canAccess = hasAccess || lesson.is_preview;
                    
                    return `
                        <div class="lesson-item ${canAccess ? 'accessible' : 'locked'} ${isCompleted ? 'completed' : ''}">
                            <div class="lesson-info">
                                <span class="lesson-icon">
                                    ${lesson.type === 'video' ? '🎥' : lesson.type === 'pdf' ? '📄' : '📝'}
                                </span>
                                <div class="lesson-details">
                                    <h4>${lesson.title}</h4>
                                    ${lesson.description ? `<p>${lesson.description}</p>` : ''}
                                    ${lesson.duration ? `<span class="duration">${formatDuration(lesson.duration)}</span>` : ''}
                                </div>
                            </div>
                            
                            <div class="lesson-actions">
                                ${isCompleted ? '<span class="completed-badge">✅ مكتمل</span>' : ''}
                                ${lesson.is_preview ? '<span class="preview-badge">👁️ معاينة مجانية</span>' : ''}
                                ${canAccess ? `
                                    <button class="lesson-btn" onclick="openLesson('${lesson.id}', '${lesson.type}')">
                                        ${lesson.type === 'video' ? 'مشاهدة' : 'فتح'}
                                    </button>
                                ` : `
                                    <button class="lesson-btn locked" disabled>
                                        🔒 مقفل
                                    </button>
                                `}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');
}

/**
 * Enroll in course
 */
async function enrollInCourse(courseId, isFree) {
    const authenticated = await window.SyntaAPI.isAuthenticated();
    if (!authenticated) {
        window.SyntaAPI.showError('يجب تسجيل الدخول أولاً');
        setTimeout(() => {
            window.location.href = '../auth/login.html';
        }, 1500);
        return;
    }
    
    try {
        if (isFree) {
            await window.SyntaAPI.enrollFreeCourse(courseId);
            window.SyntaAPI.showSuccess('تم التسجيل بنجاح! جاري تحديث الصفحة...');
            setTimeout(() => location.reload(), 1500);
        } else {
            // Redirect to payment
            window.location.href = `../paiement/paiement.html?course=${courseId}`;
        }
    } catch (error) {
        console.error('Enrollment error:', error);
        window.SyntaAPI.showError('حدث خطأ: ' + error.message);
    }
}

/**
 * Open lesson content
 */
async function openLesson(lessonId, lessonType) {
    try {
        if (lessonType === 'video') {
            const { videoUrl } = await window.SyntaAPI.getLessonVideo(lessonId);
            openVideoPlayer(lessonId, videoUrl);
        } else if (lessonType === 'pdf') {
            const { pdfUrl } = await window.SyntaAPI.getLessonPDF(lessonId);
            window.open(pdfUrl, '_blank');
            // Mark as viewed
            await window.SyntaAPI.markLessonComplete(lessonId, 50);
        }
    } catch (error) {
        console.error('Error opening lesson:', error);
        window.SyntaAPI.showError('حدث خطأ أثناء فتح الدرس');
    }
}

/**
 * Open video player modal
 */
function openVideoPlayer(lessonId, videoUrl) {
    const modal = document.createElement('div');
    modal.className = 'video-modal';
    modal.innerHTML = `
        <div class="video-modal-content">
            <button class="close-modal" onclick="this.closest('.video-modal').remove()">✕</button>
            <video id="lesson-video" controls autoplay controlsList="nodownload" oncontextmenu="return false;">
                <source src="${videoUrl}" type="video/mp4">
                متصفحك لا يدعم تشغيل الفيديو
            </video>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const video = document.getElementById('lesson-video');
    
    // Track progress
    let progressInterval;
    video.addEventListener('play', () => {
        progressInterval = setInterval(async () => {
            await window.SyntaAPI.updateVideoPosition(lessonId, video.currentTime);
        }, 10000); // Update every 10 seconds
    });
    
    video.addEventListener('pause', () => {
        clearInterval(progressInterval);
    });
    
    video.addEventListener('ended', async () => {
        clearInterval(progressInterval);
        await window.SyntaAPI.markLessonComplete(lessonId, 100);
        window.SyntaAPI.showSuccess('تم إكمال الدرس! 🎉');
        setTimeout(() => location.reload(), 1500);
    });
}

/**
 * Format duration in seconds to readable format
 */
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}س ${minutes}د`;
    }
    return `${minutes}د`;
}

/**
 * Show error message
 */
function showError(message) {
    alert(message); // Replace with better UI notification
}
