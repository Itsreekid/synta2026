document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentStep = 1;
    let registrationId = null;
    let track = null;
    let filier = null;
    let questions = [];
    let currentQuestionIndex = 0;
    let answers = {}; // { question_id: answer_value }
    let timerInterval = null;
    let timeRemaining = 300; // 5 minutes in seconds

    // DOM Elements
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');
    const step4 = document.getElementById('step-4');
    const step5 = document.getElementById('step-5');

    const identityForm = document.getElementById('identity-form');
    const identityError = document.getElementById('identity-error');
    const identitySubmit = document.getElementById('identity-submit');

    const trackBtns = document.querySelectorAll('.track-btn:not(.filier-btn)');
    const filierBtns = document.querySelectorAll('.filier-btn');
    
    const questionContainer = document.getElementById('question-container');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnSubmit = document.getElementById('btn-submit');
    const quizProgressText = document.getElementById('quiz-progress-text');
    const quizProgressBar = document.getElementById('quiz-progress-bar');
    const quizTrackBadge = document.getElementById('quiz-track-badge');
    const quizError = document.getElementById('quiz-error');
    const quizTimer = document.getElementById('quiz-timer');

    const successTierName = document.getElementById('success-tier-name');
    const successScore = document.getElementById('success-score');
    const successPerks = document.getElementById('success-perks');

    // --- Session Restoration ---
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    const token = localStorage.getItem('synta_session_token') || getCookie('synta_session_token');
    if (token) {
        registrationId = token;
        const storedScore = localStorage.getItem('synta_session_score') || 0;
        const storedTier = localStorage.getItem('synta_session_tier') || 'explorer';
        const isCompleted = localStorage.getItem('synta_session_completed') === 'true';
        
        if (isCompleted) {
            showSuccess(storedScore, storedTier, true);
            // Don't execute the rest of the initialization if we jump to success
        } else {
            goToStep(2);
        }
    }

    // --- STEP 1: Registration ---
    identityForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        identityError.classList.add('hidden');
        
        const fullName = document.getElementById('full_name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();

        if (!fullName || !email || !phone) {
            showError(identityError, 'Tous les champs sont requis.');
            return;
        }

        identitySubmit.textContent = 'Chargement...';
        identitySubmit.disabled = true;

        try {
            const response = await fetch('/api/session/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name: fullName, email, phone })
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Erreur lors de l\'inscription');

            registrationId = data.registration.id;
            localStorage.setItem('synta_session_token', data.token || data.registration.id);
            
            // If already completed in the past, jump to success?
            if (data.registration.completed) {
                localStorage.setItem('synta_session_score', data.registration.score);
                localStorage.setItem('synta_session_tier', data.registration.tier);
                localStorage.setItem('synta_session_completed', 'true');
                showSuccess(data.registration.score, data.registration.tier, true);
            } else {
                goToStep(2);
            }
        } catch (err) {
            showError(identityError, err.message);
        } finally {
            identitySubmit.textContent = 'Réserver ma place gratuite →';
            identitySubmit.disabled = false;
        }
    });

    // --- STEP 2: Track Selection ---
    trackBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            track = btn.getAttribute('data-track');
            quizTrackBadge.textContent = track.toUpperCase();
            goToStep(3); // Go to Filiere selection
        });
    });

    // --- STEP 3: Filiere Selection ---
    filierBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filier = btn.getAttribute('data-filier');
            loadQuestions(); // Go to Quiz
        });
    });

    // --- STEP 4: Quiz Logic ---
    async function loadQuestions() {
        goToStep(4);
        questionContainer.innerHTML = '<div class="text-center py-8"><span class="loader"></span><p>Chargement des questions...</p></div>';
        
        try {
            const response = await fetch('/api/session/questions');
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Erreur lors du chargement des questions');
            
            questions = data.questions || [];
            if (questions.length === 0) {
                questionContainer.innerHTML = '<p class="text-center">لا توجد أسئلة متاحة حالياً.</p>';
                return;
            }

            currentQuestionIndex = 0;
            renderQuestion();
            startTimer();
        } catch (err) {
            showError(quizError, err.message);
            questionContainer.innerHTML = '';
        }
    }

    function renderQuestion() {
        quizError.classList.add('hidden');
        const q = questions[currentQuestionIndex];
        
        // Update Progress
        quizProgressText.textContent = `السؤال ${currentQuestionIndex + 1} من ${questions.length}`;
        quizProgressBar.style.width = `${((currentQuestionIndex + 1) / questions.length) * 100}%`;

        // Render Content
        let html = `<h3 class="font-bold text-xl mb-6 text-white leading-relaxed">${q.text}</h3>`;
        html += `<div class="space-y-4 options-container">`;
        
        if (q.options && Array.isArray(q.options)) {
            q.options.forEach((opt, idx) => {
                const val = typeof opt === 'object' && opt !== null ? opt.id : opt;
                const label = typeof opt === 'object' && opt !== null ? opt.label : opt;
                
                // If it's a drag & drop, maybe we want a different UI? But for now it's radio/checkbox
                const inputType = q.type === 'multiple' ? 'checkbox' : 'radio';
                const isSelected = Array.isArray(answers[q.id]) 
                    ? answers[q.id].includes(val) 
                    : answers[q.id] === val;

                html += `
                    <label class="track-btn flex items-center cursor-pointer hover:bg-white/10" style="padding: 1.25rem; border-radius: 12px; background: rgba(255,255,255,0.05); transition: background 0.2s;">
                        <input type="${inputType}" 
                               name="q_${q.id}" 
                               value="${val}" 
                               ${isSelected ? 'checked' : ''}
                               class="ml-4" style="transform: scale(1.5); accent-color: #f07e15; flex-shrink: 0;">
                        <span class="text-white font-medium" style="font-size: 1.05rem;">${label}</span>
                    </label>
                `;
            });
        }
        
        html += `</div>`;
        questionContainer.innerHTML = html;

        // Attach event listeners to new inputs
        const inputs = questionContainer.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('change', () => {
                if (q.type === 'multiple') {
                    const checked = Array.from(questionContainer.querySelectorAll('input:checked')).map(el => el.value);
                    answers[q.id] = checked;
                } else {
                    answers[q.id] = input.value;
                }
                updateNavButtons();
            });
        });

        updateNavButtons();
    }

    function updateNavButtons() {
        const q = questions[currentQuestionIndex];
        const hasAnswer = answers[q.id] !== undefined && (Array.isArray(answers[q.id]) ? answers[q.id].length > 0 : answers[q.id] !== '');

        if (currentQuestionIndex > 0) {
            btnPrev.classList.remove('hidden');
        } else {
            btnPrev.classList.add('hidden');
        }

        if (currentQuestionIndex < questions.length - 1) {
            btnNext.classList.remove('hidden');
            btnSubmit.classList.add('hidden');
            if (hasAnswer) {
                btnNext.classList.remove('disabled');
                btnNext.disabled = false;
            } else {
                btnNext.classList.add('disabled');
                btnNext.disabled = true;
            }
        } else {
            btnNext.classList.add('hidden');
            btnSubmit.classList.remove('hidden');
            if (hasAnswer) {
                btnSubmit.classList.remove('disabled');
                btnSubmit.disabled = false;
            } else {
                btnSubmit.classList.add('disabled');
                btnSubmit.disabled = true;
            }
        }
    }

    btnPrev.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderQuestion();
        }
    });

    btnNext.addEventListener('click', () => {
        if (currentQuestionIndex < questions.length - 1) {
            currentQuestionIndex++;
            renderQuestion();
        }
    });

    btnSubmit.addEventListener('click', submitQuiz);

    // --- Timer Logic ---
    function startTimer() {
        clearInterval(timerInterval);
        timeRemaining = 300; // Reset to 5 mins
        updateTimerDisplay();
        
        timerInterval = setInterval(() => {
            timeRemaining--;
            updateTimerDisplay();
            
            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
                alert('انتهى الوقت! سيتم إرسال إجاباتك تلقائياً.');
                submitQuiz();
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        const mins = Math.floor(timeRemaining / 60);
        const secs = timeRemaining % 60;
        quizTimer.textContent = `⏱️ ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        if (timeRemaining <= 60) {
            quizTimer.style.color = 'var(--error)';
            quizTimer.classList.add('animate-pulse');
        }
    }

    // --- Submission ---
    async function submitQuiz() {
        clearInterval(timerInterval);
        btnSubmit.textContent = 'إرسال...';
        btnSubmit.disabled = true;

        try {
            const response = await fetch('/api/session/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ registration_id: registrationId, answers, track, branch: filier })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'خطأ في الإرسال');

            localStorage.setItem('synta_session_score', data.score);
            localStorage.setItem('synta_session_tier', data.tier);
            localStorage.setItem('synta_session_completed', 'true');
            localStorage.setItem('synta_session_group', data.group || 'beginner');
            showSuccess(data.score, data.tier, false, data.group);
        } catch (err) {
            showError(quizError, err.message);
            btnSubmit.textContent = '🚀 إنهاء الاختبار';
            btnSubmit.disabled = false;
        }
    }

    // --- STEP 5: Success ---
    function showSuccess(score, tier, isReturning = false, group = null) {
        goToStep(5);

        // Restore group from localStorage if returning
        if (!group) group = localStorage.getItem('synta_session_group') || 'beginner';
        
        // Throw confetti
        if (typeof confetti === 'function' && !isReturning) {
            confetti({
                particleCount: 150,
                spread: 80,
                origin: { y: 0.6 },
                colors: ['#f07e15', '#ffffff', '#fb923c']
            });
        }

        successScore.textContent = `${score} / ${questions.length || '?'}`;
        
        const tiers = {
            elite:      { name: 'النخبة',       icon: '💎', perks: ['أولوية الوصول إلى الدروس', 'حصة كوتش فردية', 'شارة النخبة على Discord'] },
            challenger: { name: 'المتحدي',      icon: '⚔️', perks: ['الوصول إلى المجموعة الخاصة', 'خصم 20% على أول تكوين'] },
            explorer:   { name: 'المستكشف',     icon: '🚀', perks: ['الوصول إلى الموارد الأساسية', 'دعوة إلى خادم المجتمع'] }
        };

        const t = tiers[tier] || tiers.explorer;
        successTierName.textContent = t.name;
        document.getElementById('success-icon').textContent = t.icon;

        // Group routing message
        const groupMsgEl = document.getElementById('group-message');
        if (groupMsgEl) {
            if (group === 'advanced') {
                groupMsgEl.innerHTML = `<div style="background:rgba(240,126,21,0.15);border:1px solid rgba(240,126,21,0.4);border-radius:12px;padding:1rem;margin-bottom:1rem;">
                    <p style="color:#f07e15;font-weight:800;margin:0 0 0.25rem;">🏆 حصة المتقدمين الحصرية!</p>
                    <p style="color:rgba(255,255,255,0.7);font-size:0.875rem;margin:0;">أحسنت! أنت في الفئة المتقدمة. ستحضر حصة تمارين مكثفة حصرية.</p>
                </div>`;
            } else {
                groupMsgEl.innerHTML = `<div style="background:rgba(33,158,188,0.1);border:1px solid rgba(33,158,188,0.3);border-radius:12px;padding:1rem;margin-bottom:1rem;">
                    <p style="color:#38bdf8;font-weight:800;margin:0 0 0.25rem;">📅 حصة الأحد الكبرى!</p>
                    <p style="color:rgba(255,255,255,0.7);font-size:0.875rem;margin:0;">ستحضر الحصة المجانية يوم الأحد مع مئات الطلاب.</p>
                </div>`;
            }
        }

        successPerks.innerHTML = t.perks.map(p => `<li>✅ ${p}</li>`).join('');

        // Start countdown if session date is configured
        startCountdown();
    }

    // --- Countdown Timer ---
    function startCountdown() {
        const rawDate = window.__SESSION_DATE__;
        if (!rawDate) return;

        const targetDate = new Date(rawDate);
        if (isNaN(targetDate.getTime())) return;

        const container = document.getElementById('countdown-container');
        if (container) container.style.display = 'block';

        function tick() {
            const now = new Date();
            const diff = targetDate - now;

            if (diff <= 0) {
                document.getElementById('cd-days').textContent = '00';
                document.getElementById('cd-hours').textContent = '00';
                document.getElementById('cd-minutes').textContent = '00';
                document.getElementById('cd-seconds').textContent = '00';
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            document.getElementById('cd-days').textContent = String(days).padStart(2, '0');
            document.getElementById('cd-hours').textContent = String(hours).padStart(2, '0');
            document.getElementById('cd-minutes').textContent = String(minutes).padStart(2, '0');
            document.getElementById('cd-seconds').textContent = String(seconds).padStart(2, '0');
        }

        tick();
        setInterval(tick, 1000);
    }

    // --- Helpers ---
    function goToStep(step) {
        step1.classList.add('hidden');
        step2.classList.add('hidden');
        step3.classList.add('hidden');
        step4.classList.add('hidden');
        if (step5) step5.classList.add('hidden');

        if (step === 1) step1.classList.remove('hidden');
        if (step === 2) step2.classList.remove('hidden');
        if (step === 3) step3.classList.remove('hidden');
        if (step === 4) step4.classList.remove('hidden');
        if (step === 5 && step5) step5.classList.remove('hidden');
    }

    function showError(element, msg) {
        element.textContent = msg;
        element.classList.remove('hidden');
    }
});

// --- Password Modal (global scope for onclick) ---
function openPasswordModal() {
    const modal = document.getElementById('password-modal');
    modal.style.display = 'flex';
    document.getElementById('modal-password').focus();
}

function closePasswordModal() {
    const modal = document.getElementById('password-modal');
    modal.style.display = 'none';
    document.getElementById('modal-error').classList.add('hidden');
}

async function submitPassword() {
    const password = document.getElementById('modal-password').value;
    const confirm = document.getElementById('modal-password-confirm').value;
    const errBox = document.getElementById('modal-error');
    const btn = document.getElementById('btn-confirm-password');

    errBox.classList.add('hidden');

    if (password.length < 6) {
        errBox.textContent = 'يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل.';
        errBox.classList.remove('hidden');
        return;
    }
    if (password !== confirm) {
        errBox.textContent = 'كلمتا المرور غير متطابقتين.';
        errBox.classList.remove('hidden');
        return;
    }

    const registrationId = localStorage.getItem('synta_session_token');
    if (!registrationId) {
        errBox.textContent = 'انتهت الحصة. يرجى إعادة تحميل الصفحة.';
        errBox.classList.remove('hidden');
        return;
    }

    btn.textContent = 'جارٍ التفعيل...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/session/set-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registration_id: registrationId, password })
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Erreur serveur');

        // Clear wizard localStorage now that we have a real account
        localStorage.removeItem('synta_session_token');
        localStorage.removeItem('synta_session_score');
        localStorage.removeItem('synta_session_tier');
        localStorage.removeItem('synta_session_completed');

        window.location.href = data.redirectUrl || '/dashboard';
    } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
        btn.textContent = 'تفعيل الحساب ←';
        btn.disabled = false;
    }
}
