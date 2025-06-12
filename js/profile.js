// Profile Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Load user profile data
    loadUserProfile();
    
    // Set up form event listeners
    setupFormListeners();
});

// Load user profile data from Supabase
async function loadUserProfile() {
    try {
        // Simple check for auth availability
        if (!window.auth) {
            console.log('Auth not ready, retrying in 500ms...');
            setTimeout(loadUserProfile, 500);
            return;
        }
        
        // Get current user
        const authResult = await window.auth.getCurrentUser();
        
        if (authResult.success && authResult.user) {
            console.log('Loading profile for user:', authResult.user.email);
            populateProfileForm(authResult.user);
            updateProfileInitial(authResult.user);
            loadUserStats();
        } else {
            console.error('No user found or authentication failed');
            showMessage('يرجى تسجيل الدخول للوصول إلى الملف الشخصي', 'error');
        }
        
    } catch (error) {
        console.error('Error loading user profile:', error);
        showMessage('حدث خطأ في تحميل البيانات', 'error');
    }
}

// Populate the profile form with user data
function populateProfileForm(user) {
    console.log('Populating profile form with user data:', user);
    
    // Basic user information
    const fullNameInput = document.getElementById('full-name');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const userClassSelect = document.getElementById('user-class');
    const userBranchSelect = document.getElementById('user-branch');
    
    console.log('Found elements:', {
        fullNameInput: !!fullNameInput,
        emailInput: !!emailInput,
        phoneInput: !!phoneInput,
        userClassSelect: !!userClassSelect,
        userBranchSelect: !!userBranchSelect
    });
    
    // Set values from user metadata
    if (user.user_metadata) {
        console.log('User metadata:', user.user_metadata);
        
        // Full name
        if (user.user_metadata.full_name) {
            fullNameInput.value = user.user_metadata.full_name;
            console.log('Set full name:', user.user_metadata.full_name);
        }
        
        // Phone
        if (user.user_metadata.phone) {
            phoneInput.value = user.user_metadata.phone;
            console.log('Set phone:', user.user_metadata.phone);
        }
        
        // User class
        if (user.user_metadata.user_class) {
            userClassSelect.value = user.user_metadata.user_class;
            console.log('Set user class:', user.user_metadata.user_class);
        }
        
        // User branch
        if (user.user_metadata.user_branch) {
            userBranchSelect.value = user.user_metadata.user_branch;
            console.log('Set user branch:', user.user_metadata.user_branch);
        } else {
            console.log('No user_branch found in metadata, setting to empty');
            userBranchSelect.value = ''; // Ensure it's set to empty string
        }
        
        // Test: Force the branch field to be visible and populated for testing
        console.log('Testing branch field visibility...');
        userBranchSelect.style.display = 'block';
        userBranchSelect.style.visibility = 'visible';
        userBranchSelect.style.opacity = '1';
        
        // Debug: Check if the element is visible
        console.log('Branch select element:', userBranchSelect);
        console.log('Branch select parent:', userBranchSelect.parentElement);
        console.log('Branch select style:', window.getComputedStyle(userBranchSelect));
        console.log('Branch select offsetHeight:', userBranchSelect.offsetHeight);
        console.log('Branch select value:', userBranchSelect.value);
        console.log('Branch select options:', userBranchSelect.options.length);
    } else {
        console.log('No user metadata found');
    }
    
    // Email (always available)
    if (user.email) {
        emailInput.value = user.email;
        console.log('Set email:', user.email);
    }
    
    // Test: Ensure branch field is working
    setTimeout(() => {
        const branchField = document.getElementById('user-branch');
        if (branchField) {
            console.log('✅ Branch field found and working');
            console.log('Branch field value:', branchField.value);
            console.log('Branch field visible:', branchField.offsetHeight > 0);
            
            // Force it to be visible if it's not
            if (branchField.offsetHeight === 0) {
                console.log('⚠️ Branch field has no height, forcing visibility');
                branchField.style.display = 'block';
                branchField.style.height = 'auto';
                branchField.style.minHeight = '40px';
            }
        } else {
            console.log('❌ Branch field not found!');
        }
        
        // Test all form fields
        const allFields = ['full-name', 'email', 'phone', 'user-class', 'user-branch', 'birth-date', 'country', 'bio'];
        allFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                console.log(`✅ ${fieldId}: found, value="${field.value}", visible=${field.offsetHeight > 0}`);
            } else {
                console.log(`❌ ${fieldId}: not found!`);
            }
        });
    }, 1000);
    
    // Update profile initial
    updateProfileInitial(user);
}

// Update profile picture initial automatically
function updateProfileInitial(user) {
    const profileInitial = document.getElementById('profile-initial');
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'س';
    
    // Get first character of the name
    const initial = displayName.charAt(0).toUpperCase();
    profileInitial.textContent = initial;
}

// Load user statistics (placeholder for now)
function loadUserStats() {
    // These would typically come from a database
    // For now, we'll use placeholder data
    const stats = {
        completedCourses: 0,
        activeCourses: 0,
        learningHours: 0,
        achievements: 0,
        currentLevel: 'مبتدئ',
        earnedPoints: 0,
        activeDays: 0,
        contestsParticipated: 0
    };
    
    // Update stats in the UI
    document.getElementById('completed-courses').textContent = stats.completedCourses;
    document.getElementById('active-courses').textContent = stats.activeCourses;
    document.getElementById('learning-hours').textContent = stats.learningHours;
    document.getElementById('achievements').textContent = stats.achievements;
    document.getElementById('current-level').textContent = stats.currentLevel;
    document.getElementById('earned-points').textContent = stats.earnedPoints;
    document.getElementById('active-days').textContent = stats.activeDays;
    document.getElementById('contests-participated').textContent = stats.contestsParticipated;
}

// Save profile changes
async function saveProfile() {
    try {
        // Get form values
        const fullName = document.getElementById('full-name').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const userClass = document.getElementById('user-class').value;
        const userBranch = document.getElementById('user-branch').value;
        const birthDate = document.getElementById('birth-date').value;
        const country = document.getElementById('country').value;
        const bio = document.getElementById('bio').value.trim();
        
        // Validate required fields
        if (!fullName) {
            showMessage('الاسم الكامل مطلوب', 'error');
            return;
        }
        
        // Prepare update data
        const updates = {
            full_name: fullName,
            phone: phone,
            user_class: userClass,
            user_branch: userBranch,
            birth_date: birthDate,
            country: country,
            bio: bio
        };
        
        // Show loading state
        const saveBtn = document.querySelector('.save-btn');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'جاري الحفظ...';
        saveBtn.disabled = true;
        
        // Update user profile
        if (window.auth) {
            const result = await window.auth.updateProfile(updates);
            
            if (result.success) {
                showMessage('تم حفظ التغييرات بنجاح!', 'success');
                updateProfileInitial({ user_metadata: updates });
            } else {
                showMessage('حدث خطأ أثناء حفظ التغييرات', 'error');
            }
        } else {
            showMessage('نظام المصادقة غير متاح', 'error');
        }
        
    } catch (error) {
        console.error('Error saving profile:', error);
        showMessage('حدث خطأ أثناء حفظ التغييرات', 'error');
    } finally {
        // Restore button state
        const saveBtn = document.querySelector('.save-btn');
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

// Setup form event listeners
function setupFormListeners() {
    // Auto-save on form changes (optional)
    const formInputs = document.querySelectorAll('.profile-form input, .profile-form select, .profile-form textarea');
    formInputs.forEach(input => {
        input.addEventListener('change', function() {
            // You could implement auto-save here if desired
        });
    });
}

// Show message function
function showMessage(message, type = 'info') {
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.profile-message');
    existingMessages.forEach(msg => msg.remove());
    
    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = `profile-message ${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-family: 'Tajawal', sans-serif;
        z-index: 10000;
        max-width: 300px;
        animation: slideInRight 0.3s ease-out;
    `;
    
    // Set background color based on type
    switch(type) {
        case 'success':
            messageDiv.style.background = '#28a745';
            break;
        case 'error':
            messageDiv.style.background = '#dc3545';
            break;
        case 'info':
        default:
            messageDiv.style.background = '#17a2b8';
            break;
    }
    
    // Add animation style
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(messageDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (document.body.contains(messageDiv)) {
            document.body.removeChild(messageDiv);
            document.head.removeChild(style);
        }
    }, 5000);
} 