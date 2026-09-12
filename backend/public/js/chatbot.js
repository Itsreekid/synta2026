// Enhanced Chatbot Page JS

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('chatbot-form');
    const messages = document.getElementById('chatbot-messages');
    
    // Add welcome message
    setTimeout(() => {
        addMessage('مرحباً! أنا المساعد الذكي لأكاديمية سينتا 🤖\nكيف يمكنني مساعدتك اليوم؟', 'bot');
        addQuickReplies([
            'دورات البرمجة',
            'العروض والخصومات',
            'كيف أسجل؟',
            'تواصل معنا'
        ]);
    }, 500);
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const input = document.getElementById('chatbot-question');
        const question = input.value.trim();
        if (!question) return;
        
        addMessage(question, 'user');
        input.value = '';
        
        // Show typing indicator
        showTypingIndicator();
        
        // Simulate bot thinking
        setTimeout(() => {
            hideTypingIndicator();
            const reply = getBotReply(question);
            addMessage(reply, 'bot');
            
            // Add quick replies based on context
            addContextualQuickReplies(question);
        }, 1000 + Math.random() * 1000);
    });
});

function addMessage(text, sender) {
    const messages = document.getElementById('chatbot-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + sender;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = sender === 'user' ? '👤' : '🤖';
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    
    // Handle line breaks
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        if (index > 0) bubble.appendChild(document.createElement('br'));
        bubble.appendChild(document.createTextNode(line));
    });
    
    if (sender === 'user') {
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(bubble);
    } else {
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(bubble);
    }
    
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
}

function showTypingIndicator() {
    const messages = document.getElementById('chatbot-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot typing-indicator';
    typingDiv.id = 'typing-indicator';
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = '🤖';
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble typing';
    bubble.innerHTML = '<span></span><span></span><span></span>';
    
    typingDiv.appendChild(avatar);
    typingDiv.appendChild(bubble);
    messages.appendChild(typingDiv);
    messages.scrollTop = messages.scrollHeight;
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

function addQuickReplies(buttons) {
    const messages = document.getElementById('chatbot-messages');
    const quickRepliesDiv = document.createElement('div');
    quickRepliesDiv.className = 'quick-replies';
    
    buttons.forEach(buttonText => {
        const button = document.createElement('button');
        button.className = 'quick-reply-btn';
        button.textContent = buttonText;
        button.addEventListener('click', () => {
            addMessage(buttonText, 'user');
            showTypingIndicator();
            setTimeout(() => {
                hideTypingIndicator();
                const reply = getBotReply(buttonText);
                addMessage(reply, 'bot');
                addContextualQuickReplies(buttonText);
            }, 800);
        });
        quickRepliesDiv.appendChild(button);
    });
    
    messages.appendChild(quickRepliesDiv);
    messages.scrollTop = messages.scrollHeight;
}

function addContextualQuickReplies(question) {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('دورات') || lowerQuestion.includes('برمجة')) {
        addQuickReplies([
            'دورة البايثون',
            'دورة JavaScript',
            'دورة HTML/CSS',
            'أسعار الدورات'
        ]);
    } else if (lowerQuestion.includes('عروض') || lowerQuestion.includes('خصومات')) {
        addQuickReplies([
            'خصم 50% للطلاب',
            'باقة العائلة',
            'عرض الشهر',
            'كوبونات الخصم'
        ]);
    } else if (lowerQuestion.includes('سجل') || lowerQuestion.includes('تسجيل')) {
        addQuickReplies([
            'إنشاء حساب جديد',
            'تسجيل الدخول',
            'استعادة كلمة المرور',
            'المساعدة في التسجيل'
        ]);
    } else {
        addQuickReplies([
            'دورات البرمجة',
            'العروض والخصومات',
            'كيف أسجل؟',
            'تواصل معنا'
        ]);
    }
}

function getBotReply(question) {
    const lowerQuestion = question.toLowerCase();
    
    // Programming courses
    if (lowerQuestion.includes('بايثون') || lowerQuestion.includes('python')) {
        return '🐍 دورة البايثون الأساسية متاحة الآن!\n\n📚 المحتوى:\n• أساسيات البرمجة\n• هياكل البيانات\n• البرمجة كائنية التوجه\n• مشاريع عملية\n\n💰 السعر: 199 دينار\n⏱️ المدة: 40 ساعة\n🎯 المستوى: مبتدئ - متوسط';
    }
    
    if (lowerQuestion.includes('javascript') || lowerQuestion.includes('جافا')) {
        return '⚡ دورة JavaScript متقدمة!\n\n📚 المحتوى:\n• ES6+ الميزات الجديدة\n• DOM Manipulation\n• Async Programming\n• React.js الأساسيات\n\n💰 السعر: 249 دينار\n⏱️ المدة: 50 ساعة\n🎯 المستوى: متوسط - متقدم';
    }
    
    if (lowerQuestion.includes('html') || lowerQuestion.includes('css')) {
        return '🌐 دورة تطوير الويب الأساسية!\n\n📚 المحتوى:\n• HTML5 المتقدم\n• CSS3 والتصميم المتجاوب\n• Flexbox و Grid\n• مشاريع واقعية\n\n💰 السعر: 149 دينار\n⏱️ المدة: 30 ساعة\n🎯 المستوى: مبتدئ';
    }
    
    // Offers and discounts
    if (lowerQuestion.includes('عروض') || lowerQuestion.includes('خصومات')) {
        return '🎉 عروض حصرية لأكاديمية سينتا!\n\n🔥 العروض الحالية:\n• خصم 50% للطلاب\n• باقة العائلة: 3 دورات بسعر 2\n• عرض الشهر: خصم 30% على جميع الدورات\n• كوبون "SINTA2024" لخصم إضافي 10%\n\n📞 للاستفسار: 123-456-789';
    }
    
    if (lowerQuestion.includes('50%') || lowerQuestion.includes('طلاب')) {
        return '🎓 خصم 50% للطلاب!\n\n📋 الشروط:\n• إثبات الطالبية\n• صورة من البطاقة الجامعية\n• صورة شخصية\n\n💳 السعر بعد الخصم:\n• البايثون: 99.5 دينار\n• JavaScript: 124.5 دينار\n• HTML/CSS: 74.5 دينار\n\n📧 أرسل المستندات إلى: students@synta.academy';
    }
    
    // Registration
    if (lowerQuestion.includes('سجل') || lowerQuestion.includes('تسجيل') || lowerQuestion.includes('حساب')) {
        return '📝 كيفية التسجيل في أكاديمية سينتا:\n\n1️⃣ اذهب إلى صفحة التسجيل\n2️⃣ املأ البيانات المطلوبة\n3️⃣ اختر الدورة المناسبة\n4️⃣ ادفع الرسوم\n5️⃣ ابدأ التعلم فوراً!\n\n🔗 رابط التسجيل: synta.academy/register\n📞 للمساعدة: 123-456-789';
    }
    
    // Contact
    if (lowerQuestion.includes('تواصل') || lowerQuestion.includes('اتصل') || lowerQuestion.includes('مساعدة')) {
        return '📞 معلومات التواصل مع أكاديمية سينتا:\n\n📱 الهاتف: 123-456-789\n📧 البريد الإلكتروني: info@synta.academy\n🌐 الموقع: www.synta.academy\n📍 العنوان: شارع الحرية، تونس\n\n⏰ ساعات العمل:\nالأحد - الخميس: 9:00 - 18:00\nالجمعة - السبت: 10:00 - 16:00';
    }
    
    // General questions
    if (lowerQuestion.includes('اسمك') || lowerQuestion.includes('من أنت')) {
        return '🤖 أنا المساعد الذكي لأكاديمية سينتا!\n\n🎯 مهمتي:\n• مساعدتك في اختيار الدورات المناسبة\n• الإجابة على استفساراتك\n• توجيهك للخدمات المطلوبة\n• تقديم الدعم الفني\n\n💡 يمكنك سؤالي عن:\n• الدورات المتاحة\n• العروض والخصومات\n• كيفية التسجيل\n• معلومات التواصل';
    }
    
    if (lowerQuestion.includes('شكرا') || lowerQuestion.includes('ممتاز') || lowerQuestion.includes('رائع')) {
        return '😊 شكراً لك! سعيد بمساعدتك\n\n🎯 إذا احتجت أي مساعدة إضافية، لا تتردد في السؤال!\n\n💡 نصيحة: يمكنك أيضاً زيارة صفحة الأسئلة الشائعة للحصول على إجابات سريعة.';
    }
    
    // Default response
    return '🤔 عذراً، لم أفهم سؤالك بشكل واضح.\n\n💡 يمكنني مساعدتك في:\n• معلومات الدورات والبرمجة\n• العروض والخصومات\n• كيفية التسجيل\n• معلومات التواصل\n\n🔍 جرب إعادة صياغة سؤالك أو اختر من الأزرار أدناه.';
} 