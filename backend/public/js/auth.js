// Auth Pages JavaScript

document.addEventListener('DOMContentLoaded', function() {
    console.log('Auth.js loaded, checking authentication system...');
    
    // Check which form is present and set up event listeners
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const passwordResetForm = document.getElementById('passwordResetForm');

    // Check if user is already logged in and redirect to dashboard
    if (loginForm || registerForm) {
        checkIfAlreadyLoggedIn();
    }

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        // Setup password toggle
        setupPasswordToggle();
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

async function checkIfAlreadyLoggedIn() {
    try {
        // Wait for auth to be available
        await waitForAuth(5000);
        
        // Check if user is already logged in
        const result = await window.auth.getCurrentUser();
        
        if (result.success && result.user) {
            console.log('User already logged in, redirecting to dashboard...');
            // Redirect to user dashboard
            window.location.href = '../../user.html';
        }
    } catch (error) {
        // If there's an error checking auth, just continue to show login form
        console.log('No active session found or auth check failed');
    }
}

function setupPasswordToggle() {
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', function() {
            // Toggle password visibility
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Toggle icon
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }
}

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
                window.location.href = '/dashboard';
            }, 1500);
        } else if (result.unverified) {
            // Hide login form and show unverified state
            const authForm = e.target.closest('.auth-form');
            const unverifiedState = document.getElementById('unverifiedState');
            const emailDisplay = document.getElementById('unverifiedEmailDisplay');
            
            if (authForm && unverifiedState && emailDisplay) {
                authForm.style.display = 'none';
                emailDisplay.textContent = email;
                unverifiedState.style.display = 'block';
                
                // Wire up the resend button
                const resendBtn = document.getElementById('resendVerificationBtnLogin');
                const resendMsg = document.getElementById('resendMessageLogin');
                
                if (resendBtn) {
                    resendBtn.onclick = async () => {
                        resendBtn.disabled = true;
                        resendBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-left: 0.5rem;"></i> جاري الإرسال...';
                        resendMsg.style.display = 'none';
                        
                        try {
                            const res = await fetch('/api/auth/resend-verification', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email })
                            });
                            
                            const data = await res.json();
                            
                            resendMsg.style.display = 'block';
                            if (res.ok) {
                                resendMsg.textContent = 'تم إرسال بريد التفعيل بنجاح! يرجى التحقق من بريدك.';
                                resendMsg.style.color = '#10b981';
                            } else {
                                resendMsg.textContent = data.error || 'حدث خطأ. يرجى المحاولة مرة أخرى.';
                                resendMsg.style.color = '#ef4444';
                                resendBtn.disabled = false;
                                resendBtn.innerHTML = '<i class="fas fa-redo" style="margin-left: 0.5rem;"></i> إعادة إرسال بريد التفعيل';
                            }
                        } catch (err) {
                            resendMsg.style.display = 'block';
                            resendMsg.textContent = 'خطأ في الاتصال بالخادم.';
                            resendMsg.style.color = '#ef4444';
                            resendBtn.disabled = false;
                            resendBtn.innerHTML = '<i class="fas fa-redo" style="margin-left: 0.5rem;"></i> إعادة إرسال بريد التفعيل';
                        }
                    };
                }
            } else {
                showMessage(result.message, 'error');
            }
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
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const fullName = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const userClass = document.getElementById('userClass').value;
    const userBranch = document.getElementById('userBranch').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    // Validate inputs
    if (!email || !password || !fullName || !phone || !userClass || !userBranch) {
        showMessage('يرجى ملء جميع الحقول', 'error');
        return;
    }
    
    // Validate phone number - must not be empty or whitespace only
    if (!phone || phone.trim() === '' || phone.trim().length === 0) {
        showMessage('يرجى إدخال رقم هاتف', 'error');
        return;
    }
    
    // Validate phone number - must not be single zero or just zeros
    if (phone.trim() === '0' || /^0+$/.test(phone.trim())) {
        showMessage('يرجى إدخال رقم هاتف صحيح', 'error');
        return;
    }
    
    // Validate phone number has at least 8 digits
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 8) {
        showMessage('رقم الهاتف يجب أن يحتوي على 8 أرقام على الأقل', 'error');
        return;
    }
    
    // Additional check: phone must contain at least one non-zero digit (not all zeros)
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
            // Track Facebook Pixel - CompleteRegistration event
            if (typeof fbq !== 'undefined') {
                fbq('track', 'CompleteRegistration', {
                    content_name: 'Synta Student Signup',
                    status: 'success',
                    value: 0,
                    currency: 'TND'
                });
            }

            // Registration is successful, but the user is NOT logged in yet.
            // Hide the registration form and show the success state
            const authForm = e.target.closest('.auth-form');
            const successState = document.getElementById('registerSuccessState');
            const emailDisplay = document.getElementById('registeredEmailDisplay');
            
            if (authForm && successState && emailDisplay) {
                authForm.style.display = 'none';
                emailDisplay.textContent = email;
                successState.style.display = 'block';
                
                // Wire up the resend button
                const resendBtn = document.getElementById('resendVerificationBtn');
                const resendMsg = document.getElementById('resendMessage');
                
                if (resendBtn) {
                    resendBtn.onclick = async () => {
                        resendBtn.disabled = true;
                        resendBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-left: 0.5rem;"></i> جاري الإرسال...';
                        resendMsg.style.display = 'none';
                        
                        try {
                            const res = await fetch('/api/auth/resend-verification', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email })
                            });
                            
                            const data = await res.json();
                            
                            resendMsg.style.display = 'block';
                            if (res.ok) {
                                resendMsg.textContent = 'تم إرسال بريد التفعيل بنجاح! يرجى التحقق من بريدك.';
                                resendMsg.style.color = '#10b981';
                                // Keep button disabled to prevent spamming
                            } else {
                                resendMsg.textContent = data.error || 'حدث خطأ. يرجى المحاولة مرة أخرى.';
                                resendMsg.style.color = '#ef4444';
                                resendBtn.disabled = false;
                                resendBtn.innerHTML = '<i class="fas fa-redo" style="margin-left: 0.5rem;"></i> إعادة إرسال بريد التفعيل';
                            }
                        } catch (err) {
                            resendMsg.style.display = 'block';
                            resendMsg.textContent = 'خطأ في الاتصال بالخادم.';
                            resendMsg.style.color = '#ef4444';
                            resendBtn.disabled = false;
                            resendBtn.innerHTML = '<i class="fas fa-redo" style="margin-left: 0.5rem;"></i> إعادة إرسال بريد التفعيل';
                        }
                    };
                }
            } else {
                // Fallback if elements are missing
                showMessage('تم إنشاء الحساب بنجاح! يرجى التحقق من بريدك الإلكتروني لتفعيل حسابك.', 'success');
                e.target.reset();
            }
        } else {
            showMessage(result.message, 'error');
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