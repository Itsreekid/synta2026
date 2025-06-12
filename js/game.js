// Game JavaScript
let currentLevel = 1;
let score = 0;
let lives = 3;

// Game challenges data
const challenges = {
    1: {
        title: "التحدي الأول: طباعة النص",
        description: "اكتب كود لطباعة 'مرحبا بالعالم!'",
        hint: "استخدم دالة print()",
        expectedOutput: "مرحبا بالعالم!",
        code: 'print("مرحبا بالعالم!")'
    },
    2: {
        title: "التحدي الثاني: المتغيرات",
        description: "أنشئ متغير باسم 'اسم' وقيمته 'أحمد' ثم اطبعه",
        hint: "استخدم المتغيرات مع print()",
        expectedOutput: "أحمد",
        code: 'اسم = "أحمد"\nprint(اسم)'
    },
    3: {
        title: "التحدي الثالث: الحلقات التكرارية",
        description: "اطبع الأرقام من 1 إلى 5 باستخدام حلقة for",
        hint: "استخدم for i in range(1, 6)",
        expectedOutput: "1\n2\n3\n4\n5",
        code: 'for i in range(1, 6):\n    print(i)'
    },
    4: {
        title: "التحدي الرابع: الشروط",
        description: "اكتب كود يتحقق من العمر ويطبع 'بالغ' إذا كان أكبر من 18",
        hint: "استخدم if مع المقارنة",
        expectedOutput: "بالغ",
        code: 'عمر = 20\nif عمر > 18:\n    print("بالغ")'
    },
    5: {
        title: "التحدي الخامس: الدوال",
        description: "أنشئ دالة تسمى 'تحية' تطبع 'مرحبا!'",
        hint: "استخدم def لإنشاء الدالة",
        expectedOutput: "مرحبا!",
        code: 'def تحية():\n    print("مرحبا!")\n\nتحية()'
    }
};

document.addEventListener('DOMContentLoaded', function() {
    initializeGame();
    setupEventListeners();
});

function initializeGame() {
    updateStats();
    loadChallenge(currentLevel);
    setupLessons();
}

function setupEventListeners() {
    // Lesson item clicks
    document.querySelectorAll('.lesson-item').forEach(item => {
        item.addEventListener('click', function() {
            const lessonNumber = parseInt(this.dataset.lesson);
            if (lessonNumber <= currentLevel) {
                loadChallenge(lessonNumber);
                updateActiveLesson(lessonNumber);
            }
        });
    });
}

function loadChallenge(level) {
    const challenge = challenges[level];
    if (!challenge) return;

    document.getElementById('challenge-title').textContent = challenge.title;
    document.getElementById('challenge-description').textContent = challenge.description;
    document.getElementById('challenge-hint').textContent = challenge.hint;
    
    // Set default code
    document.getElementById('code-input').value = challenge.code;
    
    // Clear output
    clearOutput();
    
    // Update active lesson
    updateActiveLesson(level);
}

function updateActiveLesson(level) {
    // Remove active class from all lessons
    document.querySelectorAll('.lesson-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to current lesson
    const currentLesson = document.querySelector(`[data-lesson="${level}"]`);
    if (currentLesson) {
        currentLesson.classList.add('active');
    }
}

function setupLessons() {
    // Update lesson statuses
    document.querySelectorAll('.lesson-item').forEach(item => {
        const lessonNumber = parseInt(item.dataset.lesson);
        const statusElement = item.querySelector('.lesson-status');
        
        if (lessonNumber < currentLevel) {
            statusElement.textContent = '✅';
            item.classList.add('completed');
        } else if (lessonNumber === currentLevel) {
            statusElement.textContent = '🎯';
            item.classList.add('active');
        } else {
            statusElement.textContent = '🔒';
            item.classList.add('locked');
        }
    });
}

function runCode() {
    const code = document.getElementById('code-input').value.trim();
    const output = document.getElementById('output');
    
    if (!code) {
        addOutputLine('يرجى كتابة كود أولاً', 'error');
        return;
    }
    
    try {
        // Simple Python-like code execution simulation
        const result = executePythonCode(code);
        
        if (result.success) {
            addOutputLine(result.output, 'success');
            checkChallengeCompletion(result.output);
        } else {
            addOutputLine(result.error, 'error');
            loseLife();
        }
        
    } catch (error) {
        addOutputLine('حدث خطأ في تنفيذ الكود: ' + error.message, 'error');
        loseLife();
    }
}

function executePythonCode(code) {
    // Simple Python code execution simulation
    const lines = code.split('\n');
    let output = '';
    let variables = {};
    
    try {
        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#')) continue;
            
            // Handle print statements
            if (line.startsWith('print(')) {
                const content = line.substring(6, line.length - 1);
                if (content.startsWith('"') && content.endsWith('"')) {
                    output += content.substring(1, content.length - 1) + '\n';
                } else if (variables[content]) {
                    output += variables[content] + '\n';
                } else {
                    output += content + '\n';
                }
            }
            // Handle variable assignment
            else if (line.includes('=')) {
                const parts = line.split('=');
                const varName = parts[0].trim();
                let varValue = parts[1].trim();
                
                if (varValue.startsWith('"') && varValue.endsWith('"')) {
                    varValue = varValue.substring(1, varValue.length - 1);
                }
                variables[varName] = varValue;
            }
            // Handle for loops
            else if (line.startsWith('for')) {
                const rangeMatch = line.match(/range\((\d+),\s*(\d+)\)/);
                if (rangeMatch) {
                    const start = parseInt(rangeMatch[1]);
                    const end = parseInt(rangeMatch[2]);
                    for (let i = start; i < end; i++) {
                        output += i + '\n';
                    }
                }
            }
            // Handle if statements
            else if (line.startsWith('if')) {
                const condition = line.substring(3, line.length - 1);
                if (evaluateCondition(condition)) {
                    // Execute the next line (print statement)
                    const nextLine = lines[lines.indexOf(line) + 1];
                    if (nextLine && nextLine.includes('print(')) {
                        const content = nextLine.substring(6, nextLine.length - 1);
                        if (content.startsWith('"') && content.endsWith('"')) {
                            output += content.substring(1, content.length - 1) + '\n';
                        }
                    }
                }
            }
            // Handle function definitions
            else if (line.startsWith('def')) {
                // Skip function definition for now
                continue;
            }
            // Handle function calls
            else if (line.includes('()')) {
                // Simple function call handling
                if (line.includes('تحية()')) {
                    output += 'مرحبا!\n';
                }
            }
        }
        
        return {
            success: true,
            output: output.trim()
        };
        
    } catch (error) {
        return {
            success: false,
            error: 'خطأ في الكود: ' + error.message
        };
    }
}

function evaluateCondition(condition) {
    // Simple condition evaluation
    if (condition.includes('>')) {
        const parts = condition.split('>');
        const left = parts[0].trim();
        const right = parts[1].trim();
        
        if (variables[left]) {
            return parseInt(variables[left]) > parseInt(right);
        }
    }
    return false;
}

function checkChallengeCompletion(output) {
    const challenge = challenges[currentLevel];
    if (!challenge) return;
    
    if (output === challenge.expectedOutput) {
        addOutputLine('🎉 أحسنت! لقد أكملت التحدي بنجاح!', 'success');
        score += 100;
        currentLevel++;
        
        if (currentLevel > Object.keys(challenges).length) {
            addOutputLine('🏆 مبروك! لقد أكملت جميع التحديات!', 'success');
            unlockAchievement('الخبير');
        } else {
            setTimeout(() => {
                loadChallenge(currentLevel);
                addOutputLine('🚀 انتقل إلى المستوى التالي!', 'info');
            }, 2000);
        }
        
        updateStats();
        setupLessons();
    } else {
        addOutputLine('❌ النتيجة غير صحيحة. حاول مرة أخرى!', 'error');
    }
}

function loseLife() {
    lives--;
    updateStats();
    
    if (lives <= 0) {
        addOutputLine('💀 انتهت اللعبة! انقر على "تشغيل" للبدء من جديد', 'error');
        resetGame();
    } else {
        addOutputLine(`💔 خسرت حياة! باقي ${lives} حياة`, 'error');
    }
}

function resetGame() {
    currentLevel = 1;
    score = 0;
    lives = 3;
    updateStats();
    loadChallenge(currentLevel);
    setupLessons();
}

function updateStats() {
    document.getElementById('level').textContent = currentLevel;
    document.getElementById('score').textContent = score;
    document.getElementById('lives').textContent = lives;
}

function clearOutput() {
    const output = document.getElementById('output');
    output.innerHTML = `
        <div class="welcome-message">
            <h4>مرحبا بك في لعبة تعلم البايثون! 🐍</h4>
            <p>اكتب الكود في المحرر واضغط "تشغيل" لترى النتيجة</p>
        </div>
    `;
}

function addOutputLine(text, type = 'info') {
    const output = document.getElementById('output');
    const line = document.createElement('div');
    line.className = `output-line ${type}`;
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

function unlockAchievement(achievementName) {
    const achievement = document.querySelector(`.achievement-item:has(.achievement-title:contains("${achievementName}"))`);
    if (achievement) {
        achievement.classList.remove('locked');
        achievement.classList.add('unlocked');
        addOutputLine(`🏆 مبروك! لقد حصلت على إنجاز "${achievementName}"!`, 'success');
    }
}

// Global variables for code execution
let variables = {};

// Reset variables on each code run
function resetVariables() {
    variables = {};
} 