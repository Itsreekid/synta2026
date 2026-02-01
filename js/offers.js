// Offers Page JS

document.addEventListener('DOMContentLoaded', function() {
    loadOffers();
});

function loadOffers() {
    const offers = [
        {
            badge: 'STARTER',
            price: '0€',
            period: '/mois',
            subtitle: 'Parfait pour les petites équipes',
            buttonText: 'Commencer',
            image: '../../source/algo2.gif',
            features: [
                '3 Projets',
                'Sélection des candidats par IA',
                'Recruteur IA'
            ],
            featured: false
        },
        {
            badge: 'PROFESSIONNEL',
            price: '99€',
            period: '/mois',
            subtitle: 'Parfait pour les équipes en croissance',
            buttonText: 'Commencer',
            image: '../../source/soon1.jpg',
            features: [
                'Projets illimités',
                'Sélection des candidats par IA',
                'Recruteur IA',
                'Garantie sans risque'
            ],
            featured: true
        },
        {
            badge: 'ENTREPRISE',
            price: 'Sur mesure',
            period: '',
            subtitle: 'Pour les grandes organisations',
            buttonText: 'Nous contacter',
            image: '../../source/graphique.jfif',
            features: [
                'Projets illimités',
                'Sélection des candidats par IA',
                'Évaluations de compétences personnalisées',
                'Recruteur IA personnalisé'
            ],
            featured: false
        }
    ];
    
    const offersList = document.getElementById('offers-list');
    offersList.innerHTML = offers.map(offer => `
        <div class="offer-card ${offer.featured ? 'featured' : ''}">
            <div class="offer-badge">${offer.badge}</div>
            <div class="offer-image">
                <img src="${offer.image}" alt="${offer.badge}">
            </div>
            <div class="offer-content">
                <div class="offer-price">${offer.price}${offer.period ? `<span>${offer.period}</span>` : ''}</div>
                <div class="offer-subtitle">${offer.subtitle}</div>
                <ul class="offer-features">
                    ${offer.features.map(feature => `<li>${feature}</li>`).join('')}
                </ul>
                <button class="offer-btn" onclick="showOfferMessage('${offer.badge}')">${offer.buttonText}</button>
            </div>
        </div>
    `).join('');
}

async function showOfferMessage(badge) {
    try {
        // Check if user is logged in
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
        showMessage(`Vous avez sélectionné le plan ${badge}. Redirection vers le paiement...`, 'success');
        
        // Redirect to payment page with plan parameter after 2 seconds
        setTimeout(() => {
            window.location.href = `../paiement/paiement.html?plan=${badge}`;
        }, 2000);
    } catch (error) {
        console.error('Error in showOfferMessage:', error);
        showMessage('Une erreur est survenue', 'error');
    }
}

function handleConfetti() {
    const count = 200;
    const defaults = {
        origin: { y: 0.7 }
    };

    function fire(particleRatio, opts) {
        confetti(Object.assign({}, defaults, opts, {
            particleCount: Math.floor(count * particleRatio)
        }));
    }

    fire(0.25, {
        spread: 26,
        startVelocity: 55,
    });

    fire(0.2, {
        spread: 60,
    });

    fire(0.35, {
        spread: 100,
        decay: 0.91,
        scalar: 0.8
    });

    fire(0.1, {
        spread: 120,
        startVelocity: 25,
        decay: 0.92,
        scalar: 1.2
    });

    fire(0.1, {
        spread: 120,
        startVelocity: 45,
    });
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