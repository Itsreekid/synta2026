// =====================================================
// Payment/Wallet Page - Synta Academy
// =====================================================

console.log('Paiement.js loaded');

// Check if we're in an iframe and use parent's API client
const isInIframe = window.self !== window.top;
const SyntaAPI = isInIframe && window.parent.SyntaAPI ? window.parent.SyntaAPI : window.SyntaAPI;

document.addEventListener('DOMContentLoaded', async function () {
    console.log('DOM loaded - starting initialization');
    console.log('Is in iframe:', isInIframe);
    console.log('SyntaAPI available:', !!SyntaAPI);

    document.getElementById('add-transaction-button')?.addEventListener('click', event => showAddTransactionPopup(event.currentTarget));
    document.querySelectorAll('[data-copy-account]').forEach(button => {
        button.addEventListener('click', async () => {
            const value = document.getElementById(button.dataset.copyAccount)?.textContent.trim();
            if (!value || button.disabled) return;
            button.disabled = true;
            try {
                await navigator.clipboard.writeText(value.replace(/\s+/g, ''));
                button.classList.add('is-copied');
                button.querySelector('i').className = 'fas fa-check';
                button.title = 'Copié';
                showMessage('Copié dans le presse-papiers.', 'success');
                setTimeout(() => {
                    button.classList.remove('is-copied');
                    button.querySelector('i').className = 'far fa-copy';
                    button.title = 'Copier';
                }, 1800);
            } catch {
                showMessage('Copie impossible. Sélectionnez le numéro pour le copier.', 'error');
            } finally {
                button.disabled = false;
            }
        });
    });

    // Check if API client is loaded
    if (!SyntaAPI) {
        console.error('Client API non chargé');
        // Show error in the table
        const tbody = document.getElementById('transaction-history');
        if (tbody) {
            tbody.innerHTML = walletStateRow('Erreur: API client non chargé', true);
        }
        return;
    }

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
        // An expired session is handled by the session-expired dialog without leaving the wallet.
        if (!user) return;

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
    tbody.innerHTML = walletStateRow('Chargement...');

    try {
        const user = await window.SyntaAPI.getCurrentUser();
        if (!user) {
            console.log('No user found');
            tbody.innerHTML = walletStateRow('Utilisateur non connecté', true);
            return;
        }

        console.log('Loading transactions for user:', user.id);

        // The wallet ledger is the transactions table: every purchase already writes one row there,
        // so enrollments must not be added again.
        const txRes = await fetch('/api/user/transactions', { credentials: 'same-origin' });
        if (!txRes.ok) throw new Error('Historique indisponible');
        const transactions = (await txRes.json()) || [];

        const allTransactions = transactions.map(tx => ({
            id: tx.transaction_code || tx.id,
            type: tx.type,
            amount: tx.amount,
            date: tx.created_at,
            status: tx.status,
            payment_method: tx.payment_method || (tx.type === 'purchase' ? 'Achat' : 'N/A')
        })).sort((a, b) => new Date(b.date) - new Date(a.date));

        // The "add" action lives in the history header, so the rows are only transactions.
        if (allTransactions.length === 0) {
            tbody.innerHTML = walletStateRow('Aucune transaction pour le moment');
        } else {
            tbody.innerHTML = allTransactions.map(tx => {
                const date = new Date(tx.date).toLocaleDateString('fr-FR');
                const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
                const code = tx.id.toString().substring(0, 12) + (tx.id.length > 12 ? '...' : '');
                const statusInfo = getTransactionStatus(tx.status);

                return `
                <tr class="${tx.status === 'pending' ? 'pending-transaction' : ''}">
                    <td data-label="Code">${esc(code)}</td>
                    <td data-label="Méthode de paiement">${esc(tx.payment_method)}</td>
                    <td data-label="Montant">${parseFloat(tx.amount).toFixed(2)} <img src="../../source/dt.png" alt="DT" class="dt-currency-icon-table"></td>
                    <td data-label="Date">${date}</td>
                    <td data-label="Statut"><span class="status-badge status-${esc(statusInfo.class)}">${esc(statusInfo.text)}</span></td>
                </tr>
            `;
            }).join('');
        }


        // Update pagination
        document.getElementById('pagination-info').textContent = `1 / 1 de ${allTransactions.length}`;

    } catch (error) {
        console.error('Error loading transactions:', error);
        if (tbody) {
            tbody.innerHTML = walletStateRow(`Erreur lors du chargement de l'historique: ${error.message || 'Erreur inconnue'}`, true);
        }
    }
}

/**
 * One full-width row for loading, empty and error states.
 * The text is escaped, so error messages can never inject markup.
 */
function walletStateRow(message, isError = false) {
    const text = String(message ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    return `<tr class="wallet-table-state-row"><td colspan="5" class="wallet-table-state${isError ? ' is-error' : ''}">${text}</td></tr>`;
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
 * Show add transaction popup
 */
window.showAddTransactionPopup = function (trigger = null) {
    const previousFocus = trigger || document.activeElement;
    const popup = document.createElement('div');
    popup.className = 'wallet-modal-backdrop';
    popup.innerHTML = `
        <div class="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="transaction-modal-title">
            <h2 id="transaction-modal-title">Nouvelle transaction</h2>
            <p class="wallet-modal-lead">Entrez le montant que vous souhaitez ajouter à votre solde.</p>

            <p class="wallet-modal-error" id="transaction-error" role="alert" hidden></p>

            <div class="wallet-field">
                <label for="transaction-amount">Montant (DT)</label>
                <div class="wallet-amount-input">
                    <img src="../../source/dt.png" alt="" width="16" height="16">
                    <input type="number" id="transaction-amount" min="1" step="0.01" placeholder="0.00" inputmode="decimal">
                </div>
            </div>

            <div class="wallet-field">
                <label for="transaction-receipt">Photo du reçu (optionnel)</label>
                <input type="file" id="transaction-receipt" accept="image/*" class="wallet-receipt-input">
                <p class="wallet-field-hint">Ajoutez une capture ou une photo de votre paiement pour accélérer la vérification.</p>
            </div>

            <div class="wallet-modal-actions">
                <button id="confirmTransactionBtn" type="button">Confirmer</button>
                <button id="cancelTransactionBtn" type="button">Annuler</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);
    document.querySelector('.content-wrapper')?.setAttribute('inert', '');

    const amountInput = document.getElementById('transaction-amount');
    const errorBox = document.getElementById('transaction-error');
    const confirmBtn = document.getElementById('confirmTransactionBtn');

    const showError = message => {
        errorBox.textContent = message;
        errorBox.hidden = false;
    };

    const close = () => {
        document.removeEventListener('keydown', onKey);
        popup.remove();
        document.querySelector('.content-wrapper')?.removeAttribute('inert');
        previousFocus?.focus?.();
    };

    const onKey = event => {
        if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    // Focus on input
    setTimeout(() => amountInput.focus(), 100);

    // Add event listeners
    confirmBtn.onclick = async () => {
        const amount = parseFloat(amountInput.value);
        if (!amount || amount <= 0) {
            showError('Veuillez entrer un montant valide.');
            amountInput.focus();
            return;
        }
        errorBox.hidden = true;

        const btn = confirmBtn;
        btn.disabled = true;
        btn.textContent = 'En cours...';

        const fileInput = document.getElementById('transaction-receipt');
        let receiptBase64 = null;

        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            const reader = new FileReader();

            reader.onload = async (e) => {
                receiptBase64 = e.target.result;
                close();
                await createPendingTransaction(amount, receiptBase64);
            };
            reader.onerror = () => {
                btn.disabled = false;
                btn.textContent = 'Confirmer';
                showError('Impossible de lire le reçu. Choisissez une autre image.');
            };

            reader.readAsDataURL(file);
        } else {
            close();
            await createPendingTransaction(amount, null);
        }
    };

    document.getElementById('cancelTransactionBtn').onclick = close;

    // Close on background click
    popup.onclick = (e) => {
        if (e.target === popup) close();
    };
};

/**
 * Create a pending transaction
 */
async function createPendingTransaction(amount, receiptBase64 = null) {
    try {
        const user = await window.SyntaAPI.getCurrentUser();
        if (!user) {
            showMessage('Utilisateur non connecté', 'error');
            return;
        }

        const transactionCode = 'TXN-' + Date.now();

        // Insert transaction via REST API
        const res = await fetch('/api/user/transactions', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: parseFloat(amount),
                type: 'deposit',
                status: 'pending',
                payment_method: 'En attente de confirmation',
                transaction_code: transactionCode,
                description: 'Demande de dépôt',
                receipt_url: receiptBase64
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Erreur serveur');
        }

        const data = await res.json();
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
    messageDiv.className = `wallet-toast is-${type === 'error' || type === 'success' ? type : 'info'}`;
    messageDiv.setAttribute('role', type === 'error' ? 'alert' : 'status');
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}
