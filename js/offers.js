// Offers Page JS

document.addEventListener('DOMContentLoaded', function () {
    initOffers();
});

async function initOffers() {
    const offersList = document.getElementById('offers-list');

    try {
        // Show loading state
        offersList.innerHTML = '<div class="loading">Chargement des offres...</div>';

        // Get session for auth token
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        const token = session?.access_token;

        // Fetch offers from backend
        const response = await fetch(`${window.SyntaAPI.BACKEND_URL}/api/offers`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!response.ok) throw new Error('Failed to fetch offers');

        const data = await response.json();
        let offers = [];
        let userBalance = 0;

        if (Array.isArray(data)) {
            offers = data;
            userBalance = 0; // Default for old API format
        } else if (data && typeof data === 'object') {
            offers = data.offers || [];
            userBalance = data.userBalance || 0;
        }

        // Update balance display
        updateBalanceInUI(userBalance);

        if (!offers || offers.length === 0) {
            offersList.innerHTML = '<div class="no-courses">Aucune offre disponible pour le moment</div>';
            return;
        }

        // Render dynamic offers
        offersList.innerHTML = offers.map(offer => {
            // Determine featured status
            const isFeatured = offer.title.toLowerCase().includes('pro') || offer.title.toLowerCase().includes('integral');

            const price = parseFloat(offer.fixed_price || offer.price || 0);

            // Map features from JSONB
            const featureList = [];
            if (offer.features) {
                if (offer.features.live_access) featureList.push('Accès aux classes en direct');
                if (offer.features.exams) featureList.push('Simulations d\'examens');
                if (offer.features.community) featureList.push('Accès à la communauté');
                if (offer.features.tracking) featureList.push('Suivi de progression avancé');
            }

            return `
                <div class="offer-card ${isFeatured ? 'featured' : ''} ${!offer.can_purchase ? 'insufficient-balance' : ''}">
                    <div class="offer-badge">${offer.title}</div>
                    <div class="offer-image">
                        <img src="${offer.image_url || '../../source/algo2.gif'}" alt="${offer.title}">
                    </div>
                    <div class="offer-content">
                        <div class="offer-price">
                             <img src="../../source/dt.png" alt="DT" class="dt-currency-icon" style="width: 20px; height: 20px;"> 
                             <span class="offer-price">${price}</span>
                             ${offer.period ? `<span>/${offer.period}</span>` : ''}
                        </div>
                        <div class="offer-subtitle">${offer.description || ''}</div>
                        <ul class="offer-features">
                            ${featureList.map(feature => `<li>${feature}</li>`).join('')}
                            ${offer.courses ? `<li>Inclut ${offer.courses.length} cours</li>` : ''}
                        </ul>
                        <button class="offer-btn" ${!offer.can_purchase ? 'disabled' : ''} onclick="subscribeToOffer('${offer.id}', '${offer.title}')">
                            ${offer.can_purchase ? 'S\'abonner' : 'Solde insuffisant'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading offers:', error);
        offersList.innerHTML = `
            <div class="error-message">
                Erreur lors du chargement des offres.
                <button onclick="initOffers()">Réessayer</button>
            </div>
        `;
    }
}

function updateBalanceInUI(balance) {
    const numericBalance = parseFloat(balance) || 0;
    // Look for an existing balance display or create one
    let balanceDisplay = document.querySelector('.user-balance-summary');
    if (!balanceDisplay) {
        balanceDisplay = document.createElement('div');
        balanceDisplay.className = 'user-balance-summary';
        const container = document.querySelector('.offers-container');
        if (container) {
            container.insertBefore(balanceDisplay, container.firstChild);
        }
    }

    balanceDisplay.innerHTML = `
        <div class="balance-card">
            <span class="balance-label">Votre Solde:</span>
            <span class="balance-amount">${numericBalance.toFixed(2)} DT</span>
        </div>
    `;
}

async function subscribeToOffer(offerId, title) {
    try {
        if (!window.SyntaAPI) {
            showMessage('Erreur: Système non initialisé', 'error');
            return;
        }

        const user = await window.SyntaAPI.getCurrentUser();
        if (!user) {
            showMessage('Veuillez vous connecter pour acheter un plan', 'error');
            setTimeout(() => {
                window.location.href = '../auth/login.html';
            }, 2000);
            return;
        }

        // Trigger confetti effect
        handleConfetti();
        // Show message and redirect to payment
        showMessage(`Vous avez sélectionné l'offre ${title}. Redirection vers le paiement...`, 'success');

        // Redirect to payment page with offer parameter
        setTimeout(() => {
            window.location.href = `../paiement/paiement.html?offer=${offerId}`;
        }, 2000);
    } catch (error) {
        console.error('Error in subscribeToOffer:', error);
        showMessage('Une erreur est survenue', 'error');
    }
}

function handleConfetti() {
    // Check if confetti function exists (from library)
    if (typeof confetti !== 'function') return;

    const count = 200;
    const defaults = {
        origin: { y: 0.7 }
    };

    function fire(particleRatio, opts) {
        confetti(Object.assign({}, defaults, opts, {
            particleCount: Math.floor(count * particleRatio)
        }));
    }

    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 45 });
}

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 2rem;
        border-radius: 10px;
        color: white;
        font-family: 'Tajawal', sans-serif;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    if (type === 'error') {
        messageDiv.style.background = '#dc3545';
    } else if (type === 'success') {
        messageDiv.style.background = '#28a745';
    } else {
        messageDiv.style.background = '#ff7b1a';
    }
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    .loading, .no-courses {
        text-align: center;
        padding: 3rem;
        font-size: 1.2rem;
        color: #64748b;
        grid-column: 1 / -1;
    }
    .user-balance-summary {
        margin-bottom: 2rem;
        display: flex;
        justify-content: flex-end;
    }
    .balance-card {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        padding: 0.75rem 1.5rem;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .balance-label {
        font-size: 0.9rem;
        color: #94a3b8;
    }
    .balance-amount {
        font-size: 1.1rem;
        font-weight: 700;
        color: #10b981;
    }
    .offer-card.insufficient-balance {
        opacity: 0.8;
    }
    .offer-btn:disabled {
        background: #94a3b8;
        cursor: not-allowed;
        transform: none !important;
    }
`;
document.head.appendChild(style);
