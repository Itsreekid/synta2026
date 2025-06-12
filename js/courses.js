// Courses Page JS

document.addEventListener('DOMContentLoaded', function() {
    loadCourses();
});

function loadCourses() {
    const courses = [
        {
            title: 'دورة البايثون الأساسية',
            description: 'تعلم أساسيات البرمجة بلغة البايثون من الصفر حتى الاحتراف.',
            progress: 100
        },
        {
            title: 'دورة Excel المتقدمة',
            description: 'إتقان برنامج Excel واستخدامه في التحليل والإدارة.',
            progress: 65
        },
        {
            title: 'دورة الخوارزميات',
            description: 'فهم الخوارزميات وكيفية حل المشكلات البرمجية.',
            progress: 30
        },
        {
            title: 'دورة قواعد البيانات',
            description: 'تعلم أساسيات إدارة قواعد البيانات والتعامل مع SQL.',
            progress: 0
        }
    ];
    const coursesList = document.getElementById('courses-list');
    coursesList.innerHTML = courses.map(course => `
        <div class="course-card">
            <div class="course-title">${course.title}</div>
            <div class="course-description">${course.description}</div>
            <div class="course-progress">
                <div class="course-progress-bar" style="width: ${course.progress}%"></div>
            </div>
            <button class="course-btn" onclick="showCourseMessage('${course.title}')">عرض التفاصيل</button>
        </div>
    `).join('');
}

function showCourseMessage(title) {
    showMessage(`تم اختيار الدورة: ${title}`, 'success');
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