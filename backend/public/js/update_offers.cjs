const fs = require('fs');

const path = "c:\\Work\\Synta\\Website\\synta academy new\\backend\\public\\js\\offers.js";
let content = fs.readFileSync(path, "utf-8");

const idx = content.indexOf("async function subscribeToOffer");
const tail = idx !== -1 ? content.substring(idx) : "";

const newContent = `// Offers Page JS

// Local Caching & Request Deduplication
const offersCache = new Map();
const offersPending = new Map();

document.addEventListener('turbo:before-cache', function() {
    const loaders = document.querySelectorAll('#offers-list .loading');
    loaders.forEach(el => el.remove());
});

document.addEventListener('turbo:load', function () {
    if (!document.getElementById('offers-list')) return; // Structural DOM check

    if (window.supabaseClient) {
        initOffers();
    } else {
        document.addEventListener('supabaseReady', function () {
            initOffers();
        }, { once: true });
    }
});

async function initOffers() {
    const offersList = document.getElementById('offers-list');
    if (!offersList) return;

    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        const user = session?.user;
        
        const cacheKey = 'offers_' + (user ? user.id : 'guest');

        // 1. Instant Cache Render
        if (offersCache.has(cacheKey)) {
            renderOffers(offersCache.get(cacheKey));
        } else {
            offersList.innerHTML = '<div class="loading">Chargement des offres...</div>';
        }

        // 2. Fetch Deduplication
        if (offersPending.has(cacheKey)) {
            offersPending.get(cacheKey).abort();
        }
        const abortController = new AbortController();
        offersPending.set(cacheKey, abortController);

        // 3. Background Revalidation
        const payload = await fetchOffersPayload(user, abortController.signal);
        
        const newDataStr = JSON.stringify(payload);
        const oldDataStr = offersCache.has(cacheKey) ? JSON.stringify(offersCache.get(cacheKey)) : null;

        if (newDataStr !== oldDataStr) {
            offersCache.set(cacheKey, payload);
            renderOffers(payload);
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Offers fetch aborted');
        } else {
            console.error('Error initializing offers:', error);
            if (!offersCache.has('offers_')) {
                document.getElementById('offers-list').innerHTML = '<div class="error-message">Erreur de chargement.</div>';
            }
        }
    }
}

async function fetchOffersPayload(user, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    let userProfile = null;
    let purchasedOfferIds = [];
    
    if (user) {
        const { data: profile, error: profileError } = await window.supabaseClient
            .from("Users")
            .select("class, branch, balance")
            .eq("id", user.id)
            .single();
            
        if (!profileError) userProfile = profile;
        
        const { data: payments, error: paymentsError } = await window.supabaseClient
            .from("payments")
            .select("offer_id")
            .eq("user_id", user.id);
            
        if (!paymentsError && payments) {
            purchasedOfferIds = payments.map(p => p.offer_id);
        }
    }

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const { data: offers, error: offersError } = await window.supabaseClient
        .from("offers")
        .select(\`
            *,
            courses:offer_courses(
                course:courses(*)
            )
        \`)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

    if (offersError) throw offersError;

    let filteredOffers = offers || [];
    if (userProfile) {
        filteredOffers = (offers || []).filter(offer => {
            const targetClasses = offer.target_classes || [];
            const targetBranches = offer.target_branches || [];
            const classMatch = targetClasses.length === 0 || (userProfile.class && targetClasses.includes(userProfile.class));
            const branchMatch = targetBranches.length === 0 || (userProfile.branch && targetBranches.includes(userProfile.branch));
            return classMatch && branchMatch;
        });
    }

    const userBalance = userProfile?.balance || 0;

    const formattedOffers = filteredOffers.map(offer => {
        const price = parseFloat(offer.fixed_price || offer.price || 0);
        const isPurchased = purchasedOfferIds.includes(offer.id);
        const coursesList = offer.courses ? offer.courses.map(oc => oc.course).filter(Boolean) : [];
            
        return {
            ...offer,
            courses: coursesList,
            is_purchased: isPurchased,
            can_purchase: !isPurchased && userBalance >= price
        };
    });

    return { formattedOffers, userBalance };
}

function renderOffers(payload) {
    const { formattedOffers, userBalance } = payload;
    const offersList = document.getElementById('offers-list');
    if (!offersList) return;

    if (typeof updateBalanceInUI === 'function') {
        updateBalanceInUI(userBalance);
    }

    if (!formattedOffers || formattedOffers.length === 0) {
        offersList.innerHTML = '<div class="no-courses">Aucune offre disponible pour le moment</div>';
        return;
    }

    offersList.innerHTML = formattedOffers.map(offer => {
        const isFeatured = offer.title.toLowerCase().includes('pro') || offer.title.toLowerCase().includes('integral') || offer.is_best_seller;
        const price = parseFloat(offer.fixed_price || offer.price || 0);
        const discountAmount = parseFloat(offer.discount_percentage || 0);
        const originalPrice = (price + discountAmount).toFixed(1);

        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        };

        const dateRange = (offer.valid_from && offer.valid_until)
            ? \\\`De \\\${formatDate(offer.valid_from)} Jusqu'à \\\${formatDate(offer.valid_until)}\\\`
            : 'Offre à durée limitée';

        let featureItems = [];
        let offerImage = offer.image_url || '../../source/algo2.gif';

        if (window.OFFERS_FEATURES_CONFIG) {
            featureItems = window.OFFERS_FEATURES_CONFIG.getFeatures(offer);
            offerImage = window.OFFERS_FEATURES_CONFIG.getImage(offer) || offerImage;
        } else {
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

        return \\\`
            <div class="offer-card \\\${isFeatured ? 'featured' : ''}">
                \\\${isFeatured ? '<div class="best-seller-banner">عرضنا الأكثر مبيعا</div>' : ''}
                
                <div class="offer-image-section">
                    <img src="\\\${offerImage}" alt="\\\${offer.title}">
                </div>

                <div class="offer-price-section">
                    \\\${discountAmount > 0 ? \\\`<div class="discount-badge">-\\\${discountAmount}</div>\\\` : ''}
                    <div class="price-comparison">
                        <span class="original-price">\\\${originalPrice} DT</span>
                        <div class="current-price-container">
                            <span class="current-price">\\\${price}</span>
                            <span class="currency-label">DT</span>
                        </div>
                    </div>
                </div>

                <div class="validity-box">
                    <i class="far fa-clock"></i>
                    <span>\\\${dateRange}</span>
                </div>

                <div class="features-section">
                    \\\${featureItems.map(item => \\\`
                        <div class="feature-item">
                            <span class="feature-text">\\\${item.text}</span>
                            <div class="check-icon">
                                <img src="../../source/icons/\\\${item.active ? 'true' : 'false'}.png" alt="icon" style="width: 100%; height: 100%; object-fit: contain;">
                            </div>
                        </div>
                    \\\`).join('')}
                </div>

                <div class="purchase-section">
                    <button class="acheter-btn" 
                        \\\${!offer.can_purchase || offer.is_purchased ? 'disabled' : ''} 
                        onclick="subscribeToOffer('\\\${offer.id}', '\\\${offer.title}')">
                        \\\${offer.is_purchased ? 'Déjà possédé' : (offer.can_purchase ? 'Acheter' : 'Solde insuffisant')}
                    </button>
                </div>
            </div>\\\`;
    }).join('');
}
`;

fs.writeFileSync(path, newContent + tail);
console.log('Offers JS updated successfully!');
