// Auth Pages JavaScript

document.addEventListener('DOMContentLoaded', function() {
    console.log('Auth.js loaded, checking authentication system...');
    
    // Check which form is present and set up event listeners
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const passwordResetForm = document.getElementById('passwordResetForm');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    if (passwordResetForm) {
        passwordResetForm.addEventListener('submit', handlePasswordReset);
    }
    
    // Check if auth is already available
    if (window.auth) {
        console.log('Auth system already available');
    } else {
        console.log('Auth system not yet available, will wait when needed');
    }
});

async function waitForAuth(maxWaitTime = 10000) { // Increased to 10 seconds
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
    
    // Show loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        // Wait for auth to be available with longer timeout
        await waitForAuth();
        
        // Additional check to ensure auth is fully initialized
        if (!window.auth.isInitialized || !window.auth.isInitialized()) {
            console.log('Auth not fully initialized, waiting a bit more...');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const result = await window.auth.signIn(email, password);
        
        if (result.success) {
            showMessage('تم تسجيل الدخول بنجاح!', 'success');
            setTimeout(() => {
                window.location.href = '../../user.html';
            }, 1500);
        } else {
            showMessage(result.message, 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('خطأ في تحميل نظام المصادقة. يرجى تحديث الصفحة والمحاولة مرة أخرى.', 'error');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const userClass = document.getElementById('userClass').value;
    const userBranch = document.getElementById('userBranch').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const terms = document.getElementById('terms').checked;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    if (!fullName || !email || !phone || !userClass || !userBranch || !password || !confirmPassword) {
        showMessage('يرجى ملء جميع الحقول', 'error');
        return;
    }
    
    if (!terms) {
        showMessage('يجب الموافقة على الشروط والأحكام', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showMessage('كلمات المرور غير متطابقة', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
        return;
    }
    
    // Show loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        // Wait for auth to be available with longer timeout
        await waitForAuth();
        
        // Additional check to ensure auth is fully initialized
        if (!window.auth.isInitialized || !window.auth.isInitialized()) {
            console.log('Auth not fully initialized, waiting a bit more...');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Prepare user data for Supabase
        const userData = {
            fullname: fullName,
            phone: phone,
            userClass: userClass,
            userBranch: userBranch
        };
        
        const result = await window.auth.signUp(email, password, userData);
        
        if (result.success) {
            if (result.redirect) {
                showMessage('تم إنشاء الحساب بنجاح!', 'success');
                setTimeout(() => {
                    window.location.href = '../../user.html';
                }, 1500);
            } else {
                showMessage('تم إنشاء الحساب بنجاح! يمكنك تسجيل الدخول الآن', 'success');
            }
        } else {
            showMessage(result.message, 'error');
        }
    } catch (error) {
        showMessage('حدث خطأ أثناء إنشاء الحساب', 'error');
        console.error('Register error:', error);
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
    
    // Show loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        // Wait for auth to be available with longer timeout
        await waitForAuth();
        
        // Additional check to ensure auth is fully initialized
        if (!window.auth.isInitialized || !window.auth.isInitialized()) {
            console.log('Auth not fully initialized, waiting a bit more...');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const result = await window.auth.resetPassword(email);
        
        if (result.success) {
            showMessage('تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني', 'success');
        } else {
            showMessage(result.message, 'error');
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
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());
    
    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    // Insert message before the form
    const form = document.querySelector('form');
    form.parentNode.insertBefore(messageDiv, form);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 5000);
}

// Form validation helpers
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    return password.length >= 6;
}

// Add real-time validation
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
    errorDiv.style.cssText = `
        color: #dc3545;
        font-size: 0.85rem;
        margin-top: 0.25rem;
        font-weight: 500;
    `;
    
    input.parentNode.appendChild(errorDiv);
}

function removeFieldError(input) {
    const existingError = input.parentNode.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
} 