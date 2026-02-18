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
            const isFeatured = offer.title.toLowerCase().includes('pro') || offer.title.toLowerCase().includes('integral') || offer.is_best_seller;

            const price = parseFloat(offer.fixed_price || offer.price || 0);
            const discountAmount = parseFloat(offer.discount_percentage || 0);
            const originalPrice = (price + discountAmount).toFixed(1);

            // Format dates
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                const date = new Date(dateStr);
                return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
            };

            const dateRange = (offer.valid_from && offer.valid_until)
                ? `De ${formatDate(offer.valid_from)} Jusqu'à ${formatDate(offer.valid_until)}`
                : 'Offre à durée limitée';

            // NEW: Use the separate config file for features
            let featureItems = [];
            if (window.OFFERS_FEATURES_CONFIG) {
                featureItems = window.OFFERS_FEATURES_CONFIG.getFeatures(offer);
            } else {
                // Fallback if config is not loaded
                const featuresData = offer.features || {};
                if (Array.isArray(featuresData)) {
                    featureItems = featuresData.map(text => ({ text, active: true }));
                } else if (typeof featuresData === 'object') {
                    featureItems = Object.entries(featuresData)
                        .filter(([_, active]) => active)
                        .map(([text, _]) => ({ text, active: true }));
                }
            }

            if (featureItems.length === 0) {
                featureItems = [{ text: 'Accès complet au contenu', active: true }];
            }

            return `
                <div class="offer-card ${isFeatured ? 'featured' : ''}">
                    ${isFeatured ? '<div class="best-seller-banner">عرضنا الأكثر مبيعا</div>' : ''}
                    
                    <div class="offer-image-section">
                        <img src="${offer.image_url || '../../source/algo2.gif'}" alt="${offer.title}">
                    </div>

                    <div class="offer-price-section">
                        ${discountAmount > 0 ? `<div class="discount-badge">-${discountAmount}</div>` : ''}
                        <div class="price-comparison">
                            <span class="original-price">${originalPrice} DT</span>
                            <div class="current-price-container">
                                <span class="current-price">${price}</span>
                                <span class="currency-label">DT</span>
                            </div>
                        </div>
                    </div>

                    <div class="validity-box">
                        <i class="far fa-clock"></i>
                        <span>${dateRange}</span>
                    </div>

                    <div class="features-section">
                        ${featureItems.map(item => `
                            <div class="feature-item">
                                <span class="feature-text">${item.text}</span>
                                <div class="check-icon">
                                    <img src="../../source/icons/${item.active ? 'true' : 'false'}.png" alt="icon" style="width: 100%; height: 100%; object-fit: contain;">
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="purchase-section">
                        <button class="acheter-btn" 
                            ${!offer.can_purchase || offer.is_purchased ? 'disabled' : ''} 
                            onclick="subscribeToOffer('${offer.id}', '${offer.title}')">
                            ${offer.is_purchased ? 'Déjà possédé' : (offer.can_purchase ? 'Acheter' : 'Solde insuffisant')}
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
    // Hidden as requested: remove the class="user-balance-summary" from page offres
    console.log('Balance update received:', balance);
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

        // Show confirmation dialog
        const confirmed = confirm(`Voulez-vous vraiment acheter l'offre "${title}" ? Le montant sera déduit de votre solde.`);
        if (!confirmed) return;

        // Perform purchase via Supabase RPC
        showMessage('Traitement de votre achat...', 'info');

        const { data, error } = await window.SyntaAPI.supabase.rpc('purchase_offer', {
            p_user_id: user.id,
            p_offer_id: offerId
        });

        if (error) {
            console.error('Purchase error:', error);
            showMessage('Erreur lors de l\'achat: ' + error.message, 'error');
            return;
        }

        if (data && data.success) {
            // Trigger confetti effect
            handleConfetti();

            // Update balance in UI if possible
            if (data.new_balance !== undefined) {
                updateBalanceInUI(data.new_balance);
                // Also update global balance if available (for header)
                const headerBalance = document.getElementById('userBalance');
                if (headerBalance) headerBalance.textContent = parseFloat(data.new_balance).toFixed(2);
            }

            showMessage(data.message || 'Offre achetée avec succès!', 'success');

            // Redirect to wallet to see the new payment in history after a short delay
            setTimeout(() => {
                window.location.href = `../paiement/paiement.html`;
            }, 2500);
        } else {
            showMessage(data.message || 'Échec de l\'achat', 'error');
        }

    } catch (error) {
        console.error('Error in subscribeToOffer:', error);
        showMessage('Une erreur est survenue lors de l\'achat', 'error');
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
