// =====================================================
// Payment/Wallet Page - Synta Academy
// =====================================================

document.addEventListener('DOMContentLoaded', async function() {
    // Check if API client is loaded
    if (!window.SyntaAPI) {
        console.error('Client API non chargé');
        return;
    }
    
    await loadUserData();
    await loadTransactions();
});

/**
 * Load user wallet data
 */
async function loadUserData() {
    try {
        const user = await window.SyntaAPI.getCurrentUser();
        if (!user) {
            window.location.href = '../../pages/auth/login.html';
            return;
        }
        
        // In a real app, you would fetch this from the database
        // For now, we'll use placeholder data
        console.log('User loaded:', user.email);
        
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

/**
 * Load transaction history
 */
async function loadTransactions() {
    const tbody = document.getElementById('transaction-history');
    
    try {
        const user = await window.SyntaAPI.getCurrentUser();
        if (!user) return;
        
        // Fetch enrollments/purchases from Supabase
        const { data: enrollments, error } = await window.SyntaAPI.supabase
            .from('enrollments')
            .select(`
                *,
                course:courses (
                    title,
                    price
                )
            `)
            .eq('user_id', user.id)
            .order('enrolled_at', { ascending: false });
        
        if (error) throw error;
        
        if (!enrollments || enrollments.length === 0) {
            tbody.innerHTML = `
                <tr class="no-transactions">
                    <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
                        Aucune transaction pour le moment
                    </td>
                </tr>
            `;
            return;
        }
        
        // Render transactions
        tbody.innerHTML = enrollments.map(enrollment => {
            const date = new Date(enrollment.enrolled_at).toLocaleDateString('fr-FR');
            const code = enrollment.id.substring(0, 8) + '...';
            const status = getPaymentStatus(enrollment);
            const amount = enrollment.course?.price || 0;
            
            return `
                <tr>
                    <td>${code}</td>
                    <td>Installment</td>
                    <td>${amount} DT</td>
                    <td>${date}</td>
                    <td><span class="status-badge status-${status.class}">${status.text}</span></td>
                    <td><button class="action-btn" onclick="openTransaction('${enrollment.id}')">Ouvrir</button></td>
                </tr>
            `;
        }).join('');
        
        // Update pagination
        document.getElementById('pagination-info').textContent = `1 / 1 de ${enrollments.length}`;
        
    } catch (error) {
        console.error('Error loading transactions:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: #ef4444;">
                    Erreur lors du chargement de l'historique
                </td>
            </tr>
        `;
    }
}

/**
 * Get payment status
 */
function getPaymentStatus(enrollment) {
    // Check if enrollment is active
    if (!enrollment.expires_at || new Date(enrollment.expires_at) > new Date()) {
        return { text: 'Approuvé', class: 'approved' };
    } else {
        return { text: 'Expiré', class: 'rejected' };
    }
}

/**
 * Open transaction details
 */
window.openTransaction = function(enrollmentId) {
    console.log('Opening transaction:', enrollmentId);
    // You can implement a modal or redirect to a details page
    alert('Détails de la transaction: ' + enrollmentId);
};

    const plan = plans[planName] || plans['PROFESSIONNEL'];
    
    // Update plan details
    document.getElementById('plan-name').textContent = plan.name;
    document.getElementById('plan-description').textContent = plan.description;
    
    if (plan.customPrice) {
        document.getElementById('plan-price').textContent = plan.customPrice;
        document.getElementById('plan-period').textContent = '';
        document.getElementById('subtotal').textContent = 'Sur mesure';
        document.getElementById('tax').textContent = '-';
        document.getElementById('total').textContent = 'Sur mesure';
        document.querySelector('.submit-btn').innerHTML = '<i class="fas fa-envelope"></i> Demander un devis';
    } else {
        const subtotal = plan.price;
        const tax = (subtotal * 0.20).toFixed(2);
        const total = (subtotal + parseFloat(tax)).toFixed(2);
        
        document.getElementById('plan-price').textContent = `${subtotal}€`;
        document.getElementById('plan-period').textContent = plan.period;
        document.getElementById('subtotal').textContent = `${subtotal}€`;
        document.getElementById('tax').textContent = `${tax}€`;
        document.getElementById('total').textContent = `${total}€`;
        document.querySelector('.submit-btn').innerHTML = `<i class="fas fa-lock"></i> Payer ${total}€`;
    }
    
    // Update features
    const featuresList = document.getElementById('plan-features');
    featuresList.innerHTML = plan.features.map(feature => 
        `<li><i class="fas fa-check"></i> ${feature}</li>`
    ).join('');
}

function setupFormValidation() {
    const form = document.getElementById('payment-form');
    const cardNumber = document.getElementById('card-number');
    const expiry = document.getElementById('expiry');
    const cvv = document.getElementById('cvv');

    // Format card number
    cardNumber.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\s/g, '');
        let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
        e.target.value = formattedValue;
    });

    // Format expiry date
    expiry.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        e.target.value = value;
    });

    // CVV validation
    cvv.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '');
    });

    // Form submission
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (validateForm()) {
            showSuccessMessage();
        }
    });
}

function validateForm() {
    const cardNumber = document.getElementById('card-number').value.replace(/\s/g, '');
    const expiry = document.getElementById('expiry').value;
    const cvv = document.getElementById('cvv').value;
    const email = document.getElementById('email').value;
    const terms = document.getElementById('terms').checked;

    if (cardNumber.length < 13 || cardNumber.length > 19) {
        showError('Numéro de carte invalide');
        return false;
    }

    if (!expiry.match(/^\d{2}\/\d{2}$/)) {
        showError('Date d\'expiration invalide (MM/AA)');
        return false;
    }

    if (cvv.length !== 3) {
        showError('CVV invalide');
        return false;
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showError('Email invalide');
        return false;
    }

    if (!terms) {
        showError('Veuillez accepter les conditions d\'utilisation');
        return false;
    }

    return true;
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 2rem;
        border-radius: 10px;
        background: #dc3545;
        color: white;
        font-family: 'Tajawal', sans-serif;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}

function showSuccessMessage() {
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 3rem;
        border-radius: 20px;
        background: white;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        text-align: center;
        z-index: 1000;
        max-width: 400px;
    `;
    
    successDiv.innerHTML = `
        <i class="fas fa-check-circle" style="font-size: 4rem; color: #28a745; margin-bottom: 1rem;"></i>
        <h2 style="color: #333; margin-bottom: 1rem;">Paiement réussi !</h2>
        <p style="color: #6c757d; margin-bottom: 2rem;">Votre abonnement a été activé avec succès.</p>
        <p style="color: #6c757d; font-size: 0.9rem;">Redirection vers votre espace...</p>
    `;
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
    `;
    
    document.body.appendChild(overlay);
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        window.location.href = '../auth/login.html';
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
