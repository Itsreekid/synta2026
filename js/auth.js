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
            // Show success popup
            const popup = document.createElement('div');
            popup.className = 'success-popup';
            popup.innerHTML = `
                <div class="popup-content">
                    <div class="popup-icon">✅</div>
                    <h3>تم إنشاء الحساب بنجاح!</h3>
                    <p>يمكنك الآن تسجيل الدخول باستخدام بريدك الإلكتروني وكلمة المرور</p>
                    <button onclick="window.location.href='login.html'" class="popup-button">تسجيل الدخول</button>
                </div>
            `;
            document.body.appendChild(popup);

            // Add styles for the popup
            const style = document.createElement('style');
            style.textContent = `
                .success-popup {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                    animation: fadeIn 0.3s ease-out;
                }
                .popup-content {
                    background: white;
                    padding: 2rem;
                    border-radius: 15px;
                    text-align: center;
                    max-width: 400px;
                    width: 90%;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                }
                .popup-icon {
                    font-size: 3rem;
                    margin-bottom: 1rem;
                }
                .popup-content h3 {
                    color: #2ecc71;
                    margin-bottom: 1rem;
                    font-size: 1.5rem;
                }
                .popup-content p {
                    color: #666;
                    margin-bottom: 1.5rem;
                    line-height: 1.5;
                }
                .popup-button {
                    background: #2ecc71;
                    color: white;
                    border: none;
                    padding: 0.8rem 2rem;
                    border-radius: 8px;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: background 0.3s ease;
                }
                .popup-button:hover {
                    background: #27ae60;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `;
            document.head.appendChild(style);

            // Clear form
            e.target.reset();
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