// Offers Page JS

document.addEventListener('DOMContentLoaded', function() {
    loadOffers();
});

function loadOffers() {
    const offers = [
        {
            title: 'خصم 20% على دورة البايثون',
            description: 'سجل الآن في دورة البايثون الأساسية واحصل على خصم 20% لفترة محدودة.',
            discount: '20%',
            expiry: 'تنتهي في 30 يونيو 2025'
        },
        {
            title: 'اشترِ دورة واحصل على الثانية مجاناً',
            description: 'عند شرائك أي دورة، ستحصل على دورة أخرى مجاناً من اختيارك.',
            discount: '1+1 مجاناً',
            expiry: 'تنتهي في 15 يوليو 2025'
        },
        {
            title: 'خصم خاص للطلاب',
            description: 'جميع الطلاب يحصلون على خصم إضافي 10% على جميع الدورات.',
            discount: '10% للطلاب',
            expiry: 'دائم'
        }
    ];
    const offersList = document.getElementById('offers-list');
    offersList.innerHTML = offers.map(offer => `
        <div class="offer-card">
            <div class="offer-title">${offer.title}</div>
            <div class="offer-description">${offer.description}</div>
            <div class="offer-discount">${offer.discount}</div>
            <div class="offer-expiry">${offer.expiry}</div>
            <button class="offer-btn" onclick="showOfferMessage('${offer.title}')">سجل الآن</button>
        </div>
    `).join('');
}

function showOfferMessage(title) {
    showMessage(`تم اختيار العرض: ${title}`, 'success');
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