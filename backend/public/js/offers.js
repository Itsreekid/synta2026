// Offers Page JS — REST API version (replaces Supabase direct calls)

document.addEventListener('DOMContentLoaded', function () {
    initOffers();
});

function escapeOfferHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

const offerTunisDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' });
const offerCivilDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' });

function annualOfferDetails(offer) {
    const year = Number(offer.academic_year_start);
    const cutoff = String(offer.access_cutoff_date ?? '').slice(0, 10);
    const cutoffTime = Date.parse(cutoff + 'T00:00:00Z');
    if (!year || !Number.isFinite(cutoffTime)) return '';
    const today = Object.fromEntries(offerTunisDay.formatToParts(new Date()).map(({type, value}) => [type, value]));
    const days = Math.round((cutoffTime - Date.UTC(today.year, today.month - 1, today.day)) / 86400000);
    const duration = days < 0 ? 'Période d’accès terminée' : days === 0 ? 'Dernier jour aujourd’hui' : `Encore ${days} j avant le dernier jour inclus`;
    return `<strong>${year}/${year + 1}</strong><span>Dernier jour inclus : ${offerCivilDate.format(cutoffTime)} (Tunis)</span><span>${duration}</span>`;
}

async function initOffers() {
    const offersList = document.getElementById('offers-list');
    if (!offersList) return;

    try {
        // Show loading state
        offersList.innerHTML = '<div class="loading" role="status">Chargement des offres...</div>';

        // Fetch offers + user balance from the REST API (auth via HttpOnly cookie)
        const response = await fetch('/api/offers', { credentials: 'include' });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const { offers, userBalance } = await response.json();

        // Update balance display
        updateBalanceInUI(userBalance || 0);

        if (!offers || offers.length === 0) {
            offersList.innerHTML = '<div class="no-courses">Aucune offre disponible pour le moment</div>';
            return;
        }

        // Render dynamic offers
        const formatPrice = new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 2 });
        offersList.innerHTML = offers.map((offer, index) => {
            const renewable = offer.can_renew;
            const timedUnavailable = offer.access_mode && !offer.timed_sales_enabled;
            const monthly = offer.access_mode === 'monthly';
            const annual = offer.access_mode === 'academic_year';
            const scheduled = annual && offer.scheduled_checkout_enabled && !offer.is_purchased;
            const installments = scheduled && Number(offer.installment_max);
            const upgrade = scheduled && offer.upgrades_enabled;
            const paymentLabel = installments === 3 ? 'Paiement en 1, 2 ou 3 tranches' : installments === 2 ? 'Paiement en 1 ou 2 tranches' : '';
            const isFeatured = offer.is_best_seller === true;

            const price = parseFloat(offer.fixed_price || offer.price || 0);
            const discountAmount = parseFloat(offer.discount_percentage || 0);
            const originalPrice = formatPrice.format(price + discountAmount);

            // Format dates
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                const date = new Date(dateStr);
                return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
            };

            const dateRange = (offer.valid_from && offer.valid_until)
                ? `De ${formatDate(offer.valid_from)} Jusqu'à ${formatDate(offer.valid_until)}`
                : 'Offre à durée limitée';

            // Use the separate config file for features and images
            let featureItems = [];
            let offerImage = offer.image_url || '/source/algo2.gif';

            if (window.OFFERS_FEATURES_CONFIG) {
                featureItems = window.OFFERS_FEATURES_CONFIG.getFeatures(offer);
                offerImage = window.OFFERS_FEATURES_CONFIG.getImage(offer) || offerImage;
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
                <article class="offer-card ${monthly ? 'offer-monthly' : annual ? 'offer-annual' : 'offer-legacy'} ${isFeatured ? 'featured' : ''}" aria-labelledby="offer-title-${index}">
                    <div class="offer-image-section">
                        <img src="${escapeOfferHtml(offerImage)}" alt="${escapeOfferHtml(offer.title)}" decoding="async" ${index > 2 ? 'loading="lazy"' : ''}>
                    </div>
                    <header class="offer-card-heading">
                        <div class="offer-badges">
                            <span class="offer-type-badge">${monthly ? 'Abonnement mensuel' : annual ? 'Offre année scolaire' : 'Offre à durée limitée'}</span>
                            ${isFeatured ? '<span class="best-seller-banner" lang="ar" dir="rtl">عرضنا الأكثر مبيعا</span>' : ''}
                        </div>
                        <h2 id="offer-title-${index}" dir="auto">${escapeOfferHtml(offer.title)}</h2>
                    </header>

                    <div class="offer-price-section" dir="ltr">
                        <div class="price-comparison">
                            ${discountAmount > 0 ? `<span class="original-price">${originalPrice} DT</span>` : ''}
                            <div class="current-price-container">
                                <span class="current-price">${formatPrice.format(price)}</span>
                                <span class="currency-label">${monthly ? 'DT / mois' : 'DT'}</span>
                            </div>
                        </div>
                        ${discountAmount > 0 ? `<span class="discount-badge">-${formatPrice.format(discountAmount)}</span>` : ''}
                    </div>

                    ${monthly || annual || (offer.valid_from && offer.valid_until) ? `<div class="validity-box">
                        ${monthly ? '<strong>Un mois d’accès</strong><span>Renouvellement manuel. La date de fin est indiquée avant confirmation.</span>' : annual ? annualOfferDetails(offer) : `<span>${dateRange}</span>`}
                        ${monthly && offer.is_purchased && renewable ? '<span>Accès en cours. Le renouvellement prolonge ton accès à partir de la fin de la période actuelle.</span>' : ''}
                        ${paymentLabel ? `<span>${paymentLabel}</span>` : ''}
                    </div>` : ''}

                    <ul class="features-section" role="list">
                        ${featureItems.map(item => `
                            <li class="feature-item">
                                <span class="check-icon"><img src="/source/icons/${item.active ? 'true' : 'false'}.png" alt=""></span>
                                <span><span class="offer-sr-only">${item.active ? 'Inclus : ' : 'Non inclus : '}</span><span class="feature-text" dir="auto">${escapeOfferHtml(item.text)}</span></span>
                            </li>
                        `).join('')}
                    </ul>

                    <div class="purchase-section">
                        ${scheduled && (upgrade || installments > 1) ?
                            `<button class="acheter-btn scheduled-offer-btn" type="button" data-scheduled-index="${index}">${upgrade ? 'Passer à cette offre' : 'Choisir mon paiement'}</button>` :
                        `<button type="button" class="acheter-btn ${offer.is_purchased && !renewable ? 'purchased-btn' : ''}"
                            ${!offer.can_purchase || timedUnavailable ? 'disabled' : ''}
                            data-offer-index="${index}">
                            ${timedUnavailable ? 'Indisponible' : renewable && offer.can_purchase ? 'Renouveler' : offer.is_purchased ? 'Déjà possédé' : (offer.can_purchase ? 'Acheter' : 'Solde insuffisant')}
                        </button>`}
                    </div>
                </article>
            `;
        }).join('');

        for (const button of offersList.querySelectorAll('[data-offer-index]')) {
            const offer = offers[Number(button.dataset.offerIndex)];
            button.addEventListener('click', async () => {
                button.disabled = true;
                try { await subscribeToOffer(offer.id, offer.title, offer.access_mode); }
                finally { button.disabled = false; }
            });
        }
        for (const button of offersList.querySelectorAll('[data-scheduled-index]')) {
            button.addEventListener('click', () => window.openScheduledOfferCheckout(offers[Number(button.dataset.scheduledIndex)]));
        }

        initMobileOfferNav(offersList);


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
    // Update header balance element if present
    const headerBalance = document.getElementById('userBalance');
    if (headerBalance) headerBalance.textContent = parseFloat(balance).toFixed(2);
    console.log('Balance update received:', balance);
}

async function subscribeToOffer(offerId, title, accessMode) {
    try {
        // Get current user from the REST API
        const userResp = await fetch('/api/user/me', { credentials: 'include' });
        if (!userResp.ok) {
            showMessage('Veuillez vous connecter pour acheter un plan', 'error');
            setTimeout(() => { window.location.href = '/login'; }, 2000);
            return;
        }
        const { user } = await userResp.json();
        if (!user) {
            showMessage('Veuillez vous connecter pour acheter un plan', 'error');
            setTimeout(() => { window.location.href = '/login'; }, 2000);
            return;
        }

        let details = `Voulez-vous acheter l’offre « ${title} » ? Le montant sera déduit de votre solde.`;
        const request = { offerId };
        if (accessMode) {
            const response = await fetch('/api/purchase/offer/quote', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offerId })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Devis indisponible.');
            const expiry = new Intl.DateTimeFormat('fr-FR', {
                timeZone: 'Africa/Tunis', dateStyle: 'long', timeStyle: 'short'
            }).format(new Date(data.expires_at));
            request.quote = data.quote;
            request.requestId = data.requestId;
            details += `\nMontant : ${data.price} DT. Fin d’accès : ${expiry} (Tunis).`;
            if (accessMode === 'monthly') {
                details += '\nRenouvellement manuel. Si le mois suivant ne comporte pas le 29, 30 ou 31 choisi, l’accès inclut son dernier jour. Un renouvellement continu conserve le jour initial.';
            }
            if (data.access_mode === 'academic_year') {
                const year = Number(data.academic_year_start);
                const days = Math.max(0, Math.ceil((Date.parse(data.expires_at) - Date.parse(data.starts_at)) / 86400000));
                const cutoff = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' })
                    .format(new Date(data.access_cutoff_date + 'T00:00:00Z'));
                details += `\nAnnée scolaire ${year}–${year + 1} · environ ${days} jour(s) d’accès. Accès jusqu’au ${cutoff} inclus (heure de Tunis), quelle que soit la date d’achat.`;
            }
        }
        const confirmed = confirm(details);
        if (!confirmed) return;

        showMessage('Traitement de votre achat...', 'info');

        const purchaseResp = await fetch('/api/purchase/offer', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });

        const data = await purchaseResp.json();

        if (!purchaseResp.ok) {
            showMessage('Erreur lors de l\'achat: ' + (data.error || 'Erreur inconnue'), 'error');
            return;
        }

        if (data.success) {
            // Trigger confetti effect
            handleConfetti();

            // Update balance in header if available
            if (data.newBalance !== undefined) {
                updateBalanceInUI(data.newBalance);
            }

            // Fresh dashboard/course data after enrollment
            ['swr_courses', 'swr_courses_v2', 'swr_stats', 'swr_events', 'swr_replays'].forEach((key) => {
                try { sessionStorage.removeItem(key); } catch (_) {}
            });

            showMessage(data.message || 'Offre achetée avec succès!', 'success');

            // Redirect to wallet after a short delay
            setTimeout(() => {
                window.location.href = '/app/paiement';
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
    if (typeof confetti !== 'function') return;

    const count = 200;
    const defaults = { origin: { y: 0.7 } };

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
    .offer-btn:disabled {
        background: #94a3b8;
        cursor: not-allowed;
        transform: none !important;
    }
`;
document.head.appendChild(style);

function initMobileOfferNav(list) {
    const nav = document.getElementById('mobile-offer-nav');
    const previous = document.getElementById('nav-prev-btn');
    const next = document.getElementById('nav-next-btn');
    const indicator = document.getElementById('offer-indicator');
    const cards = [...list.querySelectorAll('.offer-card')];
    if (!nav || !previous || !next || !indicator) return;
    list._mobileNavCleanup?.();
    nav.hidden = cards.length < 2;
    if (nav.hidden) return;
    let index = 0;
    const sync = () => {
        previous.disabled = index === 0;
        next.disabled = index === cards.length - 1;
        indicator.textContent = (index + 1) + ' / ' + cards.length;
    };
    const go = offset => {
        index = Math.max(0, Math.min(cards.length - 1, index + offset));
        cards[index].scrollIntoView({ block: 'start' });
        sync();
    };
    const scroller = document.getElementById('main-section');
    const track = () => {
        if (!window.matchMedia('(max-width: 600px)').matches) return;
        const top = nav.getBoundingClientRect().bottom;
        const visible = cards.findLastIndex(card => card.getBoundingClientRect().top <= top + 28);
        index = Math.max(0, visible);
        sync();
    };
    previous.onclick = () => go(-1);
    next.onclick = () => go(1);
    scroller?.addEventListener('scroll', track, { passive: true });
    list._mobileNavCleanup = () => scroller?.removeEventListener('scroll', track);
    sync();
}
