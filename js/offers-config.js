/**
 * OFFERS CONFIGURATION
 * Use this file to manage the features displayed for each offer.
 */

window.OFFERS_FEATURES_CONFIG = {
    // Default features used if an offer has no features in the database
    "default": [
        { text: " (Live 🟢) حصص تفاعلية مباشرة في الاعلامية ", active: true },
        { text: "تمارين مرفقة بإصلاح PDFs", active: true },
        { text: "امتحانات تقييمية في جميع الاعلامية", active: true },
        { text: "منتدى - Forum للتفاعل مع الأساتذة", active: true }
    ],

    // Specific features for each offer
    "offers": {
        "ac44c4af-3bc6-4d38-a3aa-a6c7b3b1eeea": [
            { text: " (Live 🟢) حصص تفاعلية مباشرة في الاعلامية ", active: true },
            { text: "تمارين مرفقة بإصلاح PDFs", active: true },
            { text: "🎁 تسجيلات عرض ملخر و علخر في الانفو ", active: true },
            { text: "حصص نصائح حول الصحة النفسية", active: true }
        ],
        "Offre Pro": [
            { text: "حصص تفاعلية مباشرة (Live 🟢) في جميع المواد", active: true },
            { text: "تسجيلات الحصص المباشرة (REC 🔴) لجميع المواد", active: true },
            { text: "تمارين مرفقة بإصلاح PDFs", active: true },
            { text: "امتحانات تقييمية في جميع المواد", active: true },
            { text: "منتدى - Forum للتفاعل مع الأساتذة", active: false }
        ],
        // You can also use the Offer ID (UUID) as a key:
        "550e8400-e29b-41d4-a716-446655440000": [
            { text: "Exemple de fonctionnalité par ID", active: true },
            { text: "Fonctionnalité désactivée", active: false }
        ]
    },

    /**
     * Function to get features for an offer
     */
    getFeatures: function (offer) {
        let list = [];

        // 1. Check if we have specific config by Title
        if (this.offers[offer.title]) {
            list = this.offers[offer.title];
        }
        // 2. Check if we have specific config by ID
        else if (this.offers[offer.id]) {
            list = this.offers[offer.id];
        }
        // 3. Fallback to Database data
        else if (offer.features && (Array.isArray(offer.features) || Object.keys(offer.features).length > 0)) {
            const data = offer.features;
            if (Array.isArray(data)) {
                return data.map(text => ({ text, active: true }));
            } else {
                return Object.entries(data).map(([text, active]) => ({ text, active: !!active }));
            }
        }
        // 4. Default
        else {
            list = this.default;
        }

        // Ensure we always return objects { text, active }
        return list.map(item => typeof item === 'string' ? { text: item, active: true } : item);
    }
};
