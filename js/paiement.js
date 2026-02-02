// =====================================================
// Payment/Wallet Page - Synta Academy
// =====================================================

console.log('Paiement.js loaded');

// Check if we're in an iframe and use parent's API client
const isInIframe = window.self !== window.top;
const SyntaAPI = isInIframe && window.parent.SyntaAPI ? window.parent.SyntaAPI : window.SyntaAPI;

document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM loaded - starting initialization');
    console.log('Is in iframe:', isInIframe);
    console.log('SyntaAPI available:', !!SyntaAPI);
    
    // Check if API client is loaded
    if (!SyntaAPI) {
        console.error('Client API non chargé');
        // Show error in the table
        const tbody = document.getElementById('transaction-history');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: #ef4444;">
                        Erreur: API client non chargé
                    </td>
                </tr>
            `;
        }
        return;
    }
    
    // Store globally for use in other functions
    window.SyntaAPI = SyntaAPI;
    
    console.log('SyntaAPI loaded, loading user data and transactions');
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
    
    if (!tbody) {
        console.error('Transaction history tbody not found');
        return;
    }
    
    // Set a loading state first
    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
                Chargement...
            </td>
        </tr>
    `;
    
    try {
        const user = await window.SyntaAPI.getCurrentUser();
        if (!user) {
            console.log('No user found');
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: #ef4444;">
                        Utilisateur non connecté
                    </td>
                </tr>
            `;
            return;
        }
        
        console.log('Loading transactions for user:', user.id);
        
        // Fetch transactions from database
        const { data: transactions, error: txError } = await window.SyntaAPI.supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        
        if (txError) {
            console.error('Transaction fetch error:', txError);
            // Don't throw, continue with empty transactions
        }
        
        console.log('Transactions fetched:', transactions);
        
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
        
        if (error) {
            console.error('Enrollments fetch error:', error);
            // Don't throw, continue with empty enrollments
        }
        
        console.log('Enrollments fetched:', enrollments);
        
        // Combine transactions and enrollments
        const allTransactions = [
            ...(transactions || []).map(tx => ({
                id: tx.transaction_code || tx.id,
                type: tx.type,
                amount: tx.amount,
                date: tx.created_at,
                status: tx.status,
                payment_method: tx.payment_method || 'N/A',
                isTransaction: true
            })),
            ...(enrollments || []).map(enrollment => ({
                id: enrollment.id,
                type: 'purchase',
                amount: enrollment.course?.price || 0,
                date: enrollment.enrolled_at,
                status: 'approved',
                payment_method: 'Achat de cours',
                isTransaction: false,
                enrollment: enrollment
            }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (allTransactions.length === 0) {
            tbody.innerHTML = `
                <tr class="no-transactions">
                    <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
                        <div style="margin-bottom: 1rem;">Aucune transaction pour le moment</div>
                        <button onclick="showAddTransactionPopup()" style="
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            border: none;
                            border-radius: 10px;
                            padding: 0.75rem 1.5rem;
                            font-family: 'Inter', sans-serif;
                            font-weight: 600;
                            font-size: 0.95rem;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.3)'">
                            Ajouter une nouvelle transaction
                        </button>
                    </td>
                </tr>
            `;
            return;
        }
        
        // Render all transactions
        tbody.innerHTML = allTransactions.map(tx => {
            const date = new Date(tx.date).toLocaleDateString('fr-FR');
            const code = tx.id.toString().substring(0, 12) + (tx.id.length > 12 ? '...' : '');
            const statusInfo = getTransactionStatus(tx.status);
            
            return `
                <tr class="${tx.status === 'pending' ? 'pending-transaction' : ''}">
                    <td>${code}</td>
                    <td>${tx.payment_method}</td>
                    <td>${parseFloat(tx.amount).toFixed(2)} <img src="../../source/dt.png" alt="DT" class="dt-currency-icon-table"></td>
                    <td>${date}</td>
                    <td><span class="status-badge status-${statusInfo.class}">${statusInfo.text}</span></td>
                    <td><button class="action-btn" ${tx.status === 'pending' ? 'disabled style="opacity: 0.5;"' : ''} onclick="openTransaction('${tx.id}')">
                        ${tx.status === 'pending' ? 'En cours' : 'Ouvrir'}
                    </button></td>
                </tr>
            `;
        }).join('');
        
        // Update pagination
        document.getElementById('pagination-info').textContent = `1 / 1 de ${allTransactions.length}`;
        
    } catch (error) {
        console.error('Error loading transactions:', error);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: #ef4444;">
                        Erreur lors du chargement de l'historique: ${error.message || 'Erreur inconnue'}
                    </td>
                </tr>
            `;
        }
    }
}

/**
 * Get payment status for enrollments
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
 * Get transaction status
 */
function getTransactionStatus(status) {
    const statusMap = {
        'pending': { text: 'En attente', class: 'pending' },
        'approved': { text: 'Approuvé', class: 'approved' },
        'completed': { text: 'Complété', class: 'approved' },
        'rejected': { text: 'Rejeté', class: 'rejected' },
        'cancelled': { text: 'Annulé', class: 'rejected' }
    };
    return statusMap[status] || { text: status, class: 'pending' };
}

/**
 * Open transaction details
 */
window.openTransaction = function(enrollmentId) {
    console.log('Opening transaction:', enrollmentId);
    // You can implement a modal or redirect to a details page
    alert('Détails de la transaction: ' + enrollmentId);
};

/**
 * Show add transaction popup
 */
window.showAddTransactionPopup = function() {
    const popup = document.createElement('div');
    popup.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
        padding: 1rem;
        overflow-y: auto;
    `;
    
    popup.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 2rem;
            max-width: 450px;
            width: 100%;
            margin: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s ease;
        ">
            <h2 style="
                color: #1e293b;
                font-size: 1.5rem;
                margin-bottom: 1rem;
                font-weight: 700;
            ">Nouvelle Transaction</h2>
            
            <p style="
                color: #64748b;
                margin-bottom: 1.5rem;
                line-height: 1.6;
            ">Entrez le montant que vous souhaitez ajouter à votre solde</p>
            
            <div style="margin-bottom: 1.5rem;">
                <label style="
                    display: block;
                    color: #475569;
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                    font-size: 0.9rem;
                ">Montant (DT)</label>
                <div style="position: relative; display: flex; align-items: center;">
                    <img src="../../source/dt.png" alt="DT" style="
                        position: absolute;
                        left: 1rem;
                        width: 16px;
                        height: 16px;
                        pointer-events: none;
                    ">
                    <input type="number" id="transaction-amount" min="1" step="0.01" placeholder="0.00" style="
                        width: 100%;
                        padding: 0.875rem 1rem 0.875rem 2.5rem;
                        border: 2px solid #e2e8f0;
                        border-radius: 10px;
                        font-size: 1rem;
                        font-family: 'Inter', sans-serif;
                        transition: border-color 0.2s;
                    " onfocus="this.style.borderColor='#667eea'" onblur="this.style.borderColor='#e2e8f0'">
                </div>
            </div>
            
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <button id="confirmTransactionBtn" style="
                    flex: 1;
                    min-width: 120px;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    padding: 0.875rem;
                    font-family: 'Inter', sans-serif;
                    font-weight: 600;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">Confirmer</button>
                
                <button id="cancelTransactionBtn" style="
                    flex: 1;
                    min-width: 120px;
                    background: #e5e7eb;
                    color: #1e293b;
                    border: none;
                    border-radius: 10px;
                    padding: 0.875rem;
                    font-family: 'Inter', sans-serif;
                    font-weight: 600;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">Annuler</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Focus on input
    setTimeout(() => {
        document.getElementById('transaction-amount').focus();
    }, 100);
    
    // Add event listeners
    document.getElementById('confirmTransactionBtn').onclick = async () => {
        const amount = parseFloat(document.getElementById('transaction-amount').value);
        if (!amount || amount <= 0) {
            alert('Veuillez entrer un montant valide');
            return;
        }
        popup.remove();
        await createPendingTransaction(amount);
    };
    
    document.getElementById('cancelTransactionBtn').onclick = () => {
        popup.remove();
    };
    
    // Close on background click
    popup.onclick = (e) => {
        if (e.target === popup) {
            popup.remove();
        }
    };
};

/**
 * Create a pending transaction
 */
async function createPendingTransaction(amount) {
    try {
        const user = await window.SyntaAPI.getCurrentUser();
        if (!user) {
            showMessage('Utilisateur non connecté', 'error');
            return;
        }
        
        const transactionCode = 'TXN-' + Date.now();
        
        // Insert transaction into database
        const { data, error } = await window.SyntaAPI.supabase
            .from('transactions')
            .insert({
                user_id: user.id,
                amount: parseFloat(amount),
                type: 'deposit',
                status: 'pending',
                payment_method: 'En attente de confirmation',
                transaction_code: transactionCode,
                description: 'Demande de dépôt'
            })
            .select()
            .single();
        
        if (error) {
            console.error('Database error:', error);
            throw error;
        }
        
        console.log('Transaction created:', data);
        
        // Reload transactions to show the new one
        await loadTransactions();
        
        // Show success message
        showMessage('Transaction créée avec succès! Elle sera traitée prochainement.', 'success');
        
    } catch (error) {
        console.error('Error creating pending transaction:', error);
        showMessage('Erreur lors de la création de la transaction: ' + (error.message || 'Erreur inconnue'), 'error');
    }
}

/**
 * Show message notification
 */
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 2rem;
        border-radius: 10px;
        color: white;
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        z-index: 10001;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    
    if (type === 'error') {
        messageDiv.style.background = '#dc3545';
    } else if (type === 'success') {
        messageDiv.style.background = '#10b981';
    } else {
        messageDiv.style.background = '#667eea';
    }
    
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}
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
