// Auth Pages JavaScript — login / register / password-reset

document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const passwordResetForm = document.getElementById('passwordResetForm');

    try {
        const params = new URLSearchParams(window.location.search);
        const googleError = params.get('google_error');
        if (googleError) {
            showMessage(googleError, 'error');
            params.delete('google_error');
            const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash || ''}`;
            window.history.replaceState({}, '', clean);
        }
    } catch (_) { /* ignore */ }

    if (loginForm || registerForm) {
        checkIfAlreadyLoggedIn();
    }

    setupPasswordToggles();

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
        setupPhoneInput(document.getElementById('phone'));
    }

    if (passwordResetForm) {
        passwordResetForm.addEventListener('submit', handlePasswordReset);
    }
});

async function checkIfAlreadyLoggedIn() {
    try {
        await waitForAuth(5000);
        const result = await window.auth.getCurrentUser();
        if (result.success && result.user) {
            window.location.href = '/dashboard';
        }
    } catch (_) {
        // No session — stay on auth page
    }
}

function setupPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach((toggle) => {
        const input = toggle.closest('.password-input-wrapper')?.querySelector('input');
        if (!input) return;

        const toggleVisibility = () => {
            const show = input.getAttribute('type') === 'password';
            input.setAttribute('type', show ? 'text' : 'password');
            toggle.classList.toggle('fa-eye', !show);
            toggle.classList.toggle('fa-eye-slash', show);
            toggle.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
        };

        toggle.addEventListener('click', toggleVisibility);
        toggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleVisibility();
            }
        });
    });
}

function setupPhoneInput(input) {
    if (!input) return;
    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 8);
    });
}

async function waitForAuth(maxWaitTime = 10000) {
    const startTime = Date.now();
    while (!window.auth && Date.now() - startTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!window.auth) {
        throw new Error(`Authentication system not available after ${maxWaitTime}ms`);
    }
    return window.auth;
}

function showPanel(panel) {
    if (!panel) return;
    panel.hidden = false;
    panel.removeAttribute('hidden');
    panel.style.display = '';
}

function hidePanel(panel) {
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute('hidden', '');
}

function scrollAuthTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const form = document.querySelector('.auth-form:not([hidden])');
    if (form) form.scrollTop = 0;
}

function wireResendButton(btn, msgEl, email) {
    if (!btn || !email) return;

    btn.onclick = async () => {
        btn.disabled = true;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> جاري الإرسال...';
        if (msgEl) {
            msgEl.hidden = true;
            msgEl.textContent = '';
        }

        try {
            const res = await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json().catch(() => ({}));

            if (msgEl) {
                msgEl.hidden = false;
                if (res.ok) {
                    msgEl.textContent = 'تم إرسال بريد التفعيل بنجاح! يرجى التحقق من بريدك.';
                    msgEl.style.color = '#059669';
                } else {
                    msgEl.textContent = data.error || 'حدث خطأ. يرجى المحاولة مرة أخرى.';
                    msgEl.style.color = '#ef4444';
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                }
            }
        } catch (_) {
            if (msgEl) {
                msgEl.hidden = false;
                msgEl.textContent = 'خطأ في الاتصال بالخادم.';
                msgEl.style.color = '#ef4444';
            }
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    };
}

function showUnverifiedState(email) {
    const formPanel = document.getElementById('loginFormPanel');
    const unverifiedState = document.getElementById('unverifiedState');
    const emailDisplay = document.getElementById('unverifiedEmailDisplay');

    if (!unverifiedState || !emailDisplay) {
        showMessage('يرجى التحقق من بريدك الإلكتروني لتفعيل حسابك قبل تسجيل الدخول.', 'error');
        return;
    }

    hidePanel(formPanel);
    emailDisplay.textContent = email;
    showPanel(unverifiedState);
    scrollAuthTop();
    wireResendButton(
        document.getElementById('resendVerificationBtnLogin'),
        document.getElementById('resendMessageLogin'),
        email
    );
}

function showRegisterSuccessState(email) {
    const formPanel = document.getElementById('registerFormPanel');
    const successState = document.getElementById('registerSuccessState');
    const emailDisplay = document.getElementById('registeredEmailDisplay');

    if (!successState || !emailDisplay) {
        showMessage('تم إنشاء الحساب بنجاح! يرجى التحقق من بريدك الإلكتروني لتفعيل حسابك.', 'success');
        return;
    }

    hidePanel(formPanel);
    emailDisplay.textContent = email;
    showPanel(successState);
    scrollAuthTop();
    wireResendButton(
        document.getElementById('resendVerificationBtn'),
        document.getElementById('resendMessage'),
        email
    );
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!email || !password) {
        showMessage('يرجى ملء جميع الحقول', 'error');
        return;
    }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        await waitForAuth();
        const result = await window.auth.signIn(email, password);

        if (result.success) {
            showMessage('تم تسجيل الدخول بنجاح!', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 800);
        } else if (result.unverified) {
            showUnverifiedState(email);
        } else {
            showMessage(result.message || 'البريد الإلكتروني أو كلمة المرور غير صحيحة', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('خطأ في تحميل نظام المصادقة. يرجى تحديث الصفحة والمحاولة مرة أخرى.', 'error');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

function validateTunisianPhone(phone) {
    return /^[24579][0-9]{7}$/.test(phone);
}

async function handleRegister(e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';
    const fullName = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const userClass = document.getElementById('userClass').value;
    const userBranch = document.getElementById('userBranch').value;
    const terms = document.getElementById('terms');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!email || !password || !fullName || !phone || !userClass || !userBranch) {
        showMessage('يرجى ملء جميع الحقول', 'error');
        return;
    }

    if (!validateEmail(email)) {
        showMessage('يرجى إدخال بريد إلكتروني صحيح', 'error');
        return;
    }

    if (!validateTunisianPhone(phone)) {
        showMessage('يرجى إدخال رقم هاتف تونسي صحيح (8 أرقام تبدأ بـ 2، 4، 5، 7، أو 9)', 'error');
        return;
    }

    if (!validatePassword(password)) {
        showMessage('يجب أن تكون كلمة المرور 6 أحرف على الأقل', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showMessage('كلمتا المرور غير متطابقتين', 'error');
        return;
    }

    if (terms && !terms.checked) {
        showMessage('يجب الموافقة على الشروط والأحكام', 'error');
        return;
    }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        await waitForAuth();

        const result = await window.auth.signUp(email, password, {
            fullname: fullName,
            name: fullName,
            phone,
            userClass,
            userBranch
        });

        if (result.success) {
            if (typeof fbq !== 'undefined') {
                fbq('track', 'CompleteRegistration', {
                    content_name: 'Synta Student Signup',
                    status: 'success',
                    value: 0,
                    currency: 'TND'
                });
            }
            showRegisterSuccessState(email);
        } else {
            showMessage(result.message || 'حدث خطأ أثناء إنشاء الحساب', 'error');
        }
    } catch (error) {
        console.error('Register error:', error);
        showMessage('حدث خطأ أثناء إنشاء الحساب', 'error');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

async function handlePasswordReset(e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!email) {
        showMessage('يرجى إدخال بريدك الإلكتروني', 'error');
        return;
    }

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        await waitForAuth();
        const result = await window.auth.resetPassword(email);
        if (result.success) {
            showMessage('تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني', 'success');
        } else {
            showMessage(result.message, 'error');
        }
    } catch (error) {
        console.error('Password reset error:', error);
        showMessage('حدث خطأ أثناء إرسال رابط إعادة التعيين', 'error');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

function showMessage(message, type = 'info') {
    document.querySelectorAll('.message').forEach((msg) => msg.remove());

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.setAttribute('role', 'alert');
    messageDiv.textContent = message;

    const mount = document.getElementById('authMessageMount');
    if (mount) {
        mount.appendChild(messageDiv);
    } else {
        const form = document.querySelector('form');
        if (form && form.parentNode) {
            form.parentNode.insertBefore(messageDiv, form);
        }
    }

    scrollAuthTop();

    setTimeout(() => {
        if (messageDiv.parentNode) messageDiv.remove();
    }, 6000);
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    return password.length >= 6;
}

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('input[type="email"]').forEach((input) => {
        input.addEventListener('blur', function () {
            if (this.value && !validateEmail(this.value)) {
                this.style.borderColor = '#dc3545';
                showFieldError(this, 'البريد الإلكتروني غير صحيح');
            } else {
                this.style.borderColor = '';
                removeFieldError(this);
            }
        });
    });

    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('blur', function () {
            if (this.value && !validatePassword(this.value)) {
                this.style.borderColor = '#dc3545';
                showFieldError(this, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
            } else {
                this.style.borderColor = '';
                removeFieldError(this);
            }
        });
    }

    const confirmInput = document.getElementById('confirmPassword');
    if (confirmInput && passwordInput) {
        confirmInput.addEventListener('blur', function () {
            if (this.value && this.value !== passwordInput.value) {
                this.style.borderColor = '#dc3545';
                showFieldError(this, 'كلمتا المرور غير متطابقتين');
            } else {
                this.style.borderColor = '';
                removeFieldError(this);
            }
        });
    }
});

function showFieldError(input, message) {
    removeFieldError(input);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.textContent = message;
    errorDiv.style.cssText = 'color:#dc3545;font-size:0.85rem;margin-top:0.25rem;font-weight:500;';
    const wrapper = input.closest('.form-group') || input.parentNode;
    wrapper.appendChild(errorDiv);
}

function removeFieldError(input) {
    const wrapper = input.closest('.form-group') || input.parentNode;
    const existingError = wrapper.querySelector('.field-error');
    if (existingError) existingError.remove();
}
