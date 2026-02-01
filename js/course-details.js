// =====================================================
// Course Details Page - Backend Integration
// =====================================================

let currentCourse = null;
let currentEnrollment = null;

document.addEventListener('DOMContentLoaded', async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');
    
    if (!courseId) {
        showError('معرف الدورة مفقود');
        return;
    }
    
    await loadCourseDetails(courseId);
});

/**
 * Load course details with modules and lessons
 */
async function loadCourseDetails(courseId) {
    try {
        // Fetch course details
        const course = await window.SyntaAPI.fetchCourseDetails(courseId);
        currentCourse = course;
        
        // Check enrollment status
        const hasAccess = await window.SyntaAPI.checkCourseAccess(courseId);
        
        // Get progress if enrolled
        let progress = null;
        if (hasAccess) {
            try {
                progress = await window.SyntaAPI.fetchCourseProgress(courseId);
            } catch (error) {
                console.error('Error fetching progress:', error);
            }
        }
        
        // Render course header
        renderCourseHeader(course, hasAccess, progress);
        
        // Render modules and lessons
        renderCourseContent(course, hasAccess, progress);
        
    } catch (error) {
        console.error('Error loading course:', error);
        showError('حدث خطأ أثناء تحميل تفاصيل الدورة');
    }
}

/**
 * Render course header
 */
function renderCourseHeader(course, hasAccess, progress) {
    const header = document.getElementById('course-header');
    if (!header) return;
    
    const progressPercent = progress?.progress || 0;
    
    header.innerHTML = `
        <div class="course-hero">
            ${course.thumbnail_url ? `
                <img src="${course.thumbnail_url}" alt="${course.title}" class="course-hero-image">
            ` : ''}
            <div class="course-hero-content">
                <h1 class="course-title">${course.title}</h1>
                <p class="course-description">${course.description || ''}</p>
                
                <div class="course-meta">
                    <span class="meta-item">📚 ${course.category}</span>
                    <span class="meta-item">📊 ${course.level}</span>
                    ${course.is_free ? 
                        '<span class="meta-item free">مجاني 🎉</span>' : 
                        `<span class="meta-item price">${course.price} دت</span>`
                    }
                </div>
                
                ${hasAccess ? `
                    <div class="enrollment-status">
                        <div class="progress-section">
                            <span>التقدم: ${progressPercent}%</span>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progressPercent}%"></div>
                            </div>
                        </div>
                    </div>
                ` : `
                    <button class="enroll-btn ${course.is_free ? 'free' : 'paid'}" 
                            onclick="enrollInCourse('${course.id}', ${course.is_free})">
                        ${course.is_free ? '🎁 التسجيل المجاني' : '🛒 شراء الدورة'}
                    </button>
                `}
            </div>
        </div>
    `;
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
            <video id="lesson-video" controls autoplay>
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
