// Auth Pages JavaScript
// Updated for Express + HttpOnly cookie session management

document.addEventListener('DOMContentLoaded', function() {
    console.log('Auth.js loaded...');
    
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const passwordResetForm = document.getElementById('passwordResetForm');

    // Check if user is already logged in (cookie present = redirect)
    if (loginForm || registerForm) {
        checkIfAlreadyLoggedIn();
    }

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        setupPasswordToggle();
    }

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
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
            // Fix loop: Ensure server has the cookie before redirecting
            const serverSynced = await setServerSessionCookie();
            if (serverSynced) {
                window.location.href = '/dashboard';
            } else {
                // If server sync fails, sign out client to prevent infinite loop
                await window.auth.signOut();
            }
        }
    } catch (error) {
        // No active session — stay on login page
    }
}

function setupPasswordToggle() {
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', function() {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }
}

async function waitForAuth(maxWaitTime = 10000) {
    const startTime = Date.now();
    while (!window.auth && Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!window.auth) {
        throw new Error(`Authentication system not available after ${maxWaitTime}ms`);
    }
    return window.auth;
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
            
            // Exchange Supabase JWT for server-side HttpOnly cookie
            await setServerSessionCookie();
            
            // Redirect to dashboard (server-side auth guard will verify cookie)
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 800);
        } else {
            if (result.error === 'INVALID_CREDENTIALS') {
                showInvalidLoginPopup();
            } else {
                showMessage(result.message || 'خطأ في تسجيل الدخول', 'error');
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('خطأ في تحميل نظام المصادقة. يرجى تحديث الصفحة.', 'error');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

/**
 * Sends the Supabase JWT to the Express backend to set HttpOnly cookies.
 * This is the bridge between client-side Supabase auth and server-side session.
 */
async function setServerSessionCookie() {
    try {
        // Get the current session from Supabase
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();
        
        if (error || !session) {
            console.error('Could not get Supabase session:', error);
            return false;
        }
        
        // POST tokens to Express — it will set the HttpOnly cookie
        const response = await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
            }),
        });
        
        if (!response.ok) {
            console.error('Failed to set server session cookie:', await response.text());
            return false;
        } else {
            console.log('✅ Server session cookie set successfully');
            return true;
        }
    } catch (error) {
        console.error('Error setting server session cookie:', error);
        return false;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const fullName = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const userClass = document.getElementById('userClass').value;
    const userBranch = document.getElementById('userBranch').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    if (!email || !password || !fullName || !phone || !userClass || !userBranch) {
        showMessage('يرجى ملء جميع الحقول', 'error');
        return;
    }
    
    if (!phone || phone.trim() === '' || phone.trim().length === 0) {
        showMessage('يرجى إدخال رقم هاتف', 'error');
        return;
    }
    
    if (phone.trim() === '0' || /^0+$/.test(phone.trim())) {
        showMessage('يرجى إدخال رقم هاتف صحيح', 'error');
        return;
    }
    
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 8) {
        showMessage('رقم الهاتف يجب أن يحتوي على 8 أرقام على الأقل', 'error');
        return;
    }
    
    if (/^0+$/.test(phoneDigits) || !/[1-9]/.test(phoneDigits)) {
        showMessage('رقم الهاتف يجب أن يحتوي على رقم واحد على الأقل غير صفر', 'error');
        return;
    }
    
    if (!validateEmail(email)) {
        showMessage('يرجى إدخال بريد إلكتروني صحيح', 'error');
        return;
    }
    
    if (!validatePassword(password)) {
        showMessage('يجب أن تكون كلمة المرور 6 أحرف على الأقل', 'error');
        return;
    }
    
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        await waitForAuth();
        
        const userData = {
            fullname: fullName,
            phone: phone,
            userClass: userClass,
            userBranch: userBranch
        };
        
        const result = await window.auth.signUp(email, password, userData);
        
        if (result.success) {
            if (typeof fbq !== 'undefined') {
                fbq('track', 'CompleteRegistration', {
                    content_name: 'Synta Student Signup',
                    status: 'success',
                    value: 0,
                    currency: 'TND'
                });
            }
            
            const popup = document.createElement('div');
            popup.className = 'success-popup';
            popup.innerHTML = `
                <div class="popup-content">
                    <div class="popup-icon">✅</div>
                    <h3>تم إنشاء الحساب بنجاح!</h3>
                    <p>يمكنك الآن تسجيل الدخول باستخدام بريدك الإلكتروني وكلمة المرور</p>
                    <button onclick="window.location.href='/login'" class="popup-button">تسجيل الدخول</button>
                </div>
            `;
            document.body.appendChild(popup);

            const style = document.createElement('style');
            style.textContent = `
                .success-popup { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000; animation: fadeIn 0.3s ease-out; }
                .popup-content { background: white; padding: 2rem; border-radius: 15px; text-align: center; max-width: 400px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
                .popup-icon { font-size: 3rem; margin-bottom: 1rem; }
                .popup-content h3 { color: #2ecc71; margin-bottom: 1rem; font-size: 1.5rem; }
                .popup-content p { color: #666; margin-bottom: 1.5rem; line-height: 1.5; }
                .popup-button { background: #2ecc71; color: white; border: none; padding: 0.8rem 2rem; border-radius: 8px; font-size: 1rem; cursor: pointer; transition: background 0.3s ease; }
                .popup-button:hover { background: #27ae60; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `;
            document.head.appendChild(style);
            e.target.reset();
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
            showMessage(result.message || 'حدث خطأ', 'error');
        }
    } catch (error) {
        showMessage('حدث خطأ أثناء إرسال رابط إعادة التعيين', 'error');
        console.error('Password reset error:', error);
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

function showMessage(message, type = 'info') {
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    const form = document.querySelector('form');
    form.parentNode.insertBefore(messageDiv, form);
    
    setTimeout(() => {
        if (messageDiv.parentNode) messageDiv.remove();
    }, 5000);
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    return password.length >= 6;
}

document.addEventListener('DOMContentLoaded', function() {
    const emailInputs = document.querySelectorAll('input[type="email"]');
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    
    emailInputs.forEach(input => {
        input.addEventListener('blur', function() {
            if (this.value && !validateEmail(this.value)) {
                this.style.borderColor = '#dc3545';
                showFieldError(this, 'البريد الإلكتروني غير صحيح');
            } else {
                this.style.borderColor = '#e0e0e0';
                removeFieldError(this);
            }
        });
    });
    
    passwordInputs.forEach(input => {
        input.addEventListener('blur', function() {
            if (this.value && !validatePassword(this.value)) {
                this.style.borderColor = '#dc3545';
                showFieldError(this, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
            } else {
                this.style.borderColor = '#e0e0e0';
                removeFieldError(this);
            }
        });
    });
});

function showFieldError(input, message) {
    removeFieldError(input);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.textContent = message;
    errorDiv.style.cssText = 'color: #dc3545; font-size: 0.85rem; margin-top: 0.25rem; font-weight: 500;';
    input.parentNode.appendChild(errorDiv);
}

function removeFieldError(input) {
    const existingError = input.parentNode.querySelector('.field-error');
    if (existingError) existingError.remove();
}

function showInvalidLoginPopup() {
    const existingPopup = document.querySelector('.error-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.className = 'error-popup';
    popup.innerHTML = `
        <div class="popup-content">
            <div class="popup-icon">⚠️</div>
            <h3>البريد الإلكتروني أو كلمة المرور غير صحيحة</h3>
            <p>يرجى التحقق من صحة بيانات الدخول الخاصة بك والمحاولة مرة أخرى.</p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button onclick="this.closest('.error-popup').remove()" class="popup-button retry-btn">إعادة المحاولة</button>
                <button onclick="window.location.href='/password-reset'" class="popup-button reset-btn">تغيير كلمة المرور</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);

    if (!document.getElementById('error-popup-styles')) {
        const style = document.createElement('style');
        style.id = 'error-popup-styles';
        style.textContent = `
            .error-popup { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000; animation: fadeIn 0.3s ease-out; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
            .error-popup .popup-content { background: white; padding: 2.5rem 2rem; border-radius: 15px; text-align: center; max-width: 400px; width: 90%; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
            .error-popup .popup-icon { font-size: 3.5rem; margin-bottom: 1rem; color: #dc3545; }
            .error-popup h3 { color: #dc3545; margin-bottom: 1rem; font-size: 1.4rem; line-height: 1.4; }
            .error-popup p { color: #666; margin-bottom: 2rem; line-height: 1.5; font-size: 0.95rem; }
            .error-popup .popup-button { border: none; padding: 0.8rem 1.5rem; border-radius: 8px; font-size: 1rem; cursor: pointer; transition: background 0.3s ease; font-weight: 500; font-family: 'Tajawal', sans-serif; flex: 1; min-width: 140px; }
            .error-popup .retry-btn { background: #f8f9fa; color: #333; border: 1px solid #ddd; }
            .error-popup .retry-btn:hover { background: #e9ecef; }
            .error-popup .reset-btn { background: #dc3545; color: white; }
            .error-popup .reset-btn:hover { background: #c82333; }
        `;
        document.head.appendChild(style);
    }
}