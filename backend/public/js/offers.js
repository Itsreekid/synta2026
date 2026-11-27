// Offers Page JS — REST API version (replaces Supabase direct calls)

document.addEventListener('DOMContentLoaded', function () {
    initOffers();
});

function escapeOfferHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

async function initOffers() {
    const offersList = document.getElementById('offers-list');
    if (!offersList) return;
    offersList._mobileNavCleanup?.(); // a retry starts from the plain list again

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
            offersList.innerHTML = '<div class="no-courses sa-empty"><span class="sa-empty__icon" aria-hidden="true"><i class="fas fa-tags"></i></span><p class="sa-empty__title">Aucune offre disponible pour le moment</p></div>';
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
            const year = Number(offer.academic_year_start);
            const annualLabel = year ? `Abonnement annuel ${year}/${year + 1}` : 'Abonnement annuel';
            const cutoffText = typeof offer.access_cutoff_date === 'string' ? offer.access_cutoff_date : '';
            const cutoffDate = /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(cutoffText)
                ? new Date(cutoffText.length === 10 ? cutoffText + 'T00:00:00Z' : cutoffText) : null;
            const annualNote = cutoffDate && Number.isFinite(cutoffDate.getTime())
                ? `Accès jusqu’au ${new Intl.DateTimeFormat('fr-FR', { day:'numeric', month:'long', year:'numeric', timeZone:'Africa/Tunis' }).format(cutoffDate)} inclus`
                : 'Accès pour l’année scolaire';
            const accessLabel = monthly ? 'Abonnement mensuel' : annual ? annualLabel : dateRange;

            // Use the separate config file for features and images
            let featureItems = [];
            let offerImage = offer.image_url || '/source/algo2.webp';

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
                <article class="offer-card ${monthly ? 'offer-monthly' : annual ? 'offer-annual' : 'offer-legacy'} ${isFeatured ? 'featured' : ''}" data-offer-id="${escapeOfferHtml(offer.id)}" aria-labelledby="offer-title-${index}">
                    ${isFeatured ? '<div class="best-seller-banner" lang="ar" dir="rtl">عرضنا الأكثر مبيعا</div>' : ''}
                    <div class="offer-image-section">
                        <img src="${escapeOfferHtml(offerImage)}" alt="" decoding="async" ${index > 2 ? 'loading="lazy"' : ''}>
                    </div>
                    <header class="offer-card-heading">
                        <h2 class="validity-box${monthly ? ' monthly-access-badge' : annual ? ' annual-access-badge' : ''}" id="offer-title-${index}" dir="auto">${monthly ? '<span class="monthly-access-title">Abonnement mensuel</span><small class="monthly-access-note">1 mois d’accès · renouvellement manuel</small>' : annual ? `<span class="annual-access-title">${escapeOfferHtml(annualLabel)}</span><small class="annual-access-note">${escapeOfferHtml(annualNote)}</small>` : escapeOfferHtml(accessLabel)}</h2>
                    </header>

                    <div class="offer-price-section" dir="ltr">
                        ${discountAmount > 0 ? `<span class="discount-badge">-${formatPrice.format(discountAmount)}</span>` : ''}
                        <div class="price-comparison">
                            ${discountAmount > 0 ? `<span class="original-price">${originalPrice} DT</span>` : ''}
                            <div class="current-price-container">
                                <span class="current-price">${formatPrice.format(price)}</span>
                                <span class="currency-label">${monthly ? 'DT / mois' : 'DT'}</span>
                            </div>
                        </div>
                    </div>


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
                            ${(!offer.can_purchase && !renewable) || timedUnavailable ? 'disabled' : ''}
                            data-offer-index="${index}">
                            ${timedUnavailable ? 'Indisponible' : renewable ? 'Renouvellement' : offer.is_purchased ? 'Déjà possédé' : (offer.can_purchase ? 'Acheter' : 'Solde insuffisant')}
                        </button>`}
                        ${!scheduled && !timedUnavailable && !renewable && !offer.is_purchased && !offer.can_purchase
                            ? '<a class="offer-topup-link" href="/app/paiement">Recharger mon portefeuille</a>' : ''}
                    </div>
                </article>
            `;
        }).join('');

        for (const button of offersList.querySelectorAll('[data-offer-index]')) {
            const offer = offers[Number(button.dataset.offerIndex)];
            button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    if (offer.can_renew && offer.access_mode === 'monthly') await openRenewalDialog(offer);
                    else await subscribeToOffer(offer.id, offer.title, offer.access_mode);
                }
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

async function openRenewalDialog(offer) {
    const dialog = document.createElement('dialog');
    dialog.className = 'offer-checkout-dialog';
    dialog.setAttribute('aria-label', 'Renouvellement mensuel');
    dialog.innerHTML = `<form>
        <header class="offer-checkout-header"><h2>Renouvellement mensuel</h2><button type="button" data-close aria-label="Fermer">×</button></header>
        <div class="offer-checkout-content">
            <p>Montant de l’offre <strong data-price></strong></p>
            <p><a href="/app/paiement" target="_blank" rel="noopener">Voir le RIB et D17 dans Mon Portefeuille (nouvel onglet)</a></p>
            <p>Le reçu est vérifié par l’administration. Une fois le portefeuille crédité, revenez ici pour payer le renouvellement.</p>
            <label>Reçu de paiement <input type="file" accept="image/jpeg,image/png,image/webp" required></label>
            <p role="status" aria-live="polite"></p>
        </div>
        <footer class="offer-checkout-footer">
            ${offer.can_purchase ? '<button type="button" data-wallet>Payer avec mon solde</button>' : ''}
            <button type="submit" disabled>Envoyer le reçu</button>
        </footer>
    </form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    const wallet = dialog.querySelector('[data-wallet]');
    if (wallet) wallet.onclick = () => {
        dialog.close();
        void subscribeToOffer(offer.id, offer.title, offer.access_mode);
    };
    const status = dialog.querySelector('[role=status]');
    const submit = dialog.querySelector('[type=submit]');
    dialog.showModal();
    try {
        const response = await fetch('/api/purchase/offer/quote', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offerId: offer.id })
        });
        const quote = await response.json();
        if (!response.ok) throw new Error(quote.error || 'Impossible de charger le montant.');
        dialog.querySelector('[data-price]').textContent = `${quote.price} DT`;
        submit.disabled = false;
        dialog.querySelector('form').onsubmit = async event => {
            event.preventDefault();
            if (submit.disabled) return;
            const image = dialog.querySelector('input').files[0];
            if (!image || image.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
                status.textContent = 'Joignez un reçu JPG, PNG ou WebP de 5 Mo maximum.';
                return;
            }
            submit.disabled = true;
            try {
                const receipt = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(image);
                });
                const result = await fetch('/api/user/transactions', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: quote.price, renewalOfferId: offer.id, receipt_url: receipt,
                        transaction_code: 'TXN-' + crypto.randomUUID(), description: 'Demande de dépôt' })
                });
                if (!result.ok) throw new Error((await result.json().catch(() => null))?.error || 'Impossible d’envoyer le reçu. Réessayez.');
                status.textContent = 'Reçu envoyé. La demande apparaît dans Mon Portefeuille.';
            } catch (error) {
                status.textContent = error.message || 'Impossible de lire le reçu.';
                submit.disabled = false;
            }
        };
    } catch (error) {
        status.textContent = error.message || 'Impossible de charger le montant.';
    }
}

async function subscribeToOffer(offerId, title, accessMode) {
    try {
        // Get current user from the REST API
        const userResp = await fetch('/api/user/me', { credentials: 'include' });
        if (!userResp.ok) {
            // A 401 already opened the session-expired dialog; do not navigate away from the student's page.
            if (userResp.status !== 401) showMessage('Impossible de vérifier ton compte. Réessaie dans un instant.', 'error');
            return;
        }
        const { user } = await userResp.json();
        if (!user) {
            showMessage('Veuillez vous connecter pour acheter un plan', 'error');
            setTimeout(() => { window.SyntaSession ? window.SyntaSession.redirectToLogin() : (window.location.href = '/login'); }, 2000);
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
            details += `\nMontant : ${data.price} DT. Fin d’accès : ${expiry}.`;
            if (accessMode === 'monthly') {
                details += '\nRenouvellement manuel. Si le mois suivant ne comporte pas le 29, 30 ou 31 choisi, l’accès inclut son dernier jour. Un renouvellement continu conserve le jour initial.';
            }
            if (data.access_mode === 'academic_year') {
                const year = Number(data.academic_year_start);
                const days = Math.max(0, Math.ceil((Date.parse(data.expires_at) - Date.parse(data.starts_at)) / 86400000));
                const cutoff = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' })
                    .format(new Date(data.access_cutoff_date + 'T00:00:00Z'));
                details += `\nAnnée scolaire ${year}–${year + 1} · environ ${days} jour(s) d’accès. Accès jusqu’au ${cutoff} inclus, quelle que soit la date d’achat.`;
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

// Phones (≤600px): the offer list becomes a horizontal scroll-snap carousel, one full card at a time.
// Swiping is native scrolling; the arrows animate the same scroll position (≈300 ms). Presentation
// only: cards, their buttons and every purchase handler stay exactly as rendered above.
function initMobileOfferNav(list) {
    const carousel = document.getElementById('offers-carousel');
    const nav = document.getElementById('mobile-offer-nav');
    const previous = document.getElementById('nav-prev-btn');
    const next = document.getElementById('nav-next-btn');
    const indicator = document.getElementById('offer-indicator');
    const pagination = document.getElementById('offer-pagination');
    const dots = document.getElementById('offer-dots');
    const cards = [...list.querySelectorAll('.offer-card')];
    if (!carousel || !nav || !previous || !next || !indicator) return;
    list._mobileNavCleanup?.();
    const enabled = cards.length > 1;
    nav.hidden = !enabled;
    if (pagination) pagination.hidden = !enabled;
    carousel.classList.toggle('is-carousel', enabled);
    if (!enabled) return;

    const phone = window.matchMedia('(max-width: 600px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scroller = document.getElementById('main-section');
    let index = 0;
    let animation = 0;
    let programmatic = false;
    let settleTimer = 0;

    if (dots) dots.innerHTML = cards.map(() => '<span class="offer-dot"></span>').join('');
    const dotItems = dots ? [...dots.children] : [];
    const nearest = () => {
        let best = 0;
        cards.forEach((card, i) => {
            if (Math.abs(card.offsetLeft - list.scrollLeft) < Math.abs(cards[best].offsetLeft - list.scrollLeft)) best = i;
        });
        return best;
    };
    // Conversion rule: the whole active offer, purchase button included, fits the visible screen.
    // --offer-max-h = the part of the page actually visible below the header (visualViewport when
    // the browser bar shrinks it), minus the space above the carousel, the counter below it and
    // the bottom padding (which carries the safe area). CSS caps every card at that height and
    // only the benefits list scrolls when an offer has too many to fit.
    const container = carousel.parentElement;
    const measure = () => {
        if (!phone.matches || !scroller) { carousel.style.removeProperty('--offer-max-h'); return; }
        const box = scroller.getBoundingClientRect();
        const viewport = window.visualViewport;
        const visibleBottom = Math.min(box.bottom, window.innerHeight,
            viewport ? viewport.offsetTop + viewport.height : Infinity);
        const listOffset = list.getBoundingClientRect().top - box.top + scroller.scrollTop;
        const below = (pagination && !pagination.hidden
            ? pagination.offsetHeight + parseFloat(getComputedStyle(pagination).marginTop || 0) : 0)
            + parseFloat(getComputedStyle(container).paddingBottom || 0)
            + parseFloat(getComputedStyle(scroller).paddingBottom || 0);
        const available = Math.floor(visibleBottom - box.top - listOffset - below);
        carousel.style.setProperty('--offer-max-h', Math.max(280, available) + 'px');
    };
    // Benefits that scroll get a soft fade at the bottom until the end of the list is reached.
    const hintScroll = () => cards.forEach(card => {
        const features = card.querySelector('.features-section');
        if (!features) return;
        const more = phone.matches && features.scrollHeight - features.clientHeight - features.scrollTop > 2;
        features.classList.toggle('has-more', more);
    });
    // The track is as tall as the visible card only, so shorter offers leave no blank space below.
    const fitHeight = () => {
        list.style.height = phone.matches ? cards[index].offsetHeight + 'px' : '';
        hintScroll();
    };
    const sync = () => {
        previous.disabled = index === 0;
        next.disabled = index === cards.length - 1;
        indicator.textContent = (index + 1) + ' / ' + cards.length;
        dotItems.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
        cards.forEach((card, i) => card.toggleAttribute('data-carousel-active', i === index));
        fitHeight();
    };
    // Reading the bottom of a long offer: bring the carousel top back into view before switching.
    const revealTop = () => {
        if (!scroller) return;
        const offset = carousel.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        if (offset < 0) scroller.scrollTo({ top: scroller.scrollTop + offset - 8, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    };
    let finishTimer = 0;
    const finish = to => {
        cancelAnimationFrame(animation);
        clearTimeout(finishTimer);
        list.scrollLeft = to;
        list.classList.remove('is-sliding');
        programmatic = false;
    };
    const slideTo = target => {
        cancelAnimationFrame(animation);
        clearTimeout(finishTimer);
        const from = list.scrollLeft;
        const to = cards[target].offsetLeft;
        if (reducedMotion.matches || from === to) { finish(to); return; }
        programmatic = true;
        list.classList.add('is-sliding'); // pauses scroll-snap while the position is animated
        const start = performance.now();
        const ease = t => 1 - Math.pow(1 - t, 3);
        const step = now => {
            const progress = Math.min(1, (now - start) / 300);
            list.scrollLeft = from + (to - from) * ease(progress);
            if (progress < 1) animation = requestAnimationFrame(step);
            else finish(to);
        };
        animation = requestAnimationFrame(step);
        finishTimer = setTimeout(() => finish(to), 420); // lands on the card even if frames are throttled
    };
    const go = offset => {
        if (!phone.matches) return;
        const target = Math.max(0, Math.min(cards.length - 1, index + offset));
        if (target === index) return;
        index = target; // state first: rapid clicks always move one card from the last target
        revealTop();
        sync();
        slideTo(index);
    };
    const onScroll = () => {
        if (programmatic) return;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
            const current = nearest();
            if (current !== index) { index = current; revealTop(); sync(); }
        }, 90);
    };
    const onMedia = () => {
        measure();
        finish(phone.matches ? cards[index].offsetLeft : 0);
        fitHeight();
    };
    let viewportFrame = 0;
    const onViewport = () => {
        cancelAnimationFrame(viewportFrame);
        viewportFrame = requestAnimationFrame(() => {
            measure();
            if (phone.matches) list.scrollLeft = cards[index].offsetLeft; // stay on the same offer
            fitHeight();
        });
    };
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fitHeight()) : null;
    cards.forEach(card => resize?.observe(card));
    const onFeaturesScroll = event => {
        if (event.target.classList?.contains('features-section')) hintScroll();
    };

    previous.onclick = () => go(-1);
    next.onclick = () => go(1);
    list.addEventListener('scroll', onScroll, { passive: true });
    list.addEventListener('scroll', onFeaturesScroll, { passive: true, capture: true });
    phone.addEventListener?.('change', onMedia);
    window.addEventListener('resize', onViewport);
    window.addEventListener('orientationchange', onViewport);
    window.visualViewport?.addEventListener('resize', onViewport);
    list._mobileNavCleanup = () => {
        cancelAnimationFrame(animation);
        cancelAnimationFrame(viewportFrame);
        clearTimeout(settleTimer);
        clearTimeout(finishTimer);
        list.removeEventListener('scroll', onScroll);
        list.removeEventListener('scroll', onFeaturesScroll, { capture: true });
        phone.removeEventListener?.('change', onMedia);
        window.removeEventListener('resize', onViewport);
        window.removeEventListener('orientationchange', onViewport);
        window.visualViewport?.removeEventListener('resize', onViewport);
        resize?.disconnect();
        list.style.height = '';
        carousel.style.removeProperty('--offer-max-h');
        carousel.classList.remove('is-carousel');
    };
    list.scrollLeft = 0;
    measure();
    sync();
}
