const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'backend', 'public', 'css', 'calendar.css');
let css = fs.readFileSync(cssPath, 'utf8');

// 1. Remove all 'Tajawal' fonts
css = css.replace(/font-family:\s*'Tajawal',\s*sans-serif;/g, '');

// 2. Replace colors with orange theme
css = css.replace(/#667eea/g, 'var(--orange-primary, #f97316)');
css = css.replace(/#764ba2/g, '#f97316');
css = css.replace(/#5568d3/g, '#ea580c');
css = css.replace(/#ffc107/g, '#f97316');
css = css.replace(/#ffead0/g, '#fff7ed');
css = css.replace(/#ffe4c4/g, '#ffedd5');
css = css.replace(/#1e3448/g, '#94a3b8');

// 3. Completely rewrite mobile styles
const mobileRegex = /@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\}(?=\s*@media|\s*$)/g;

const newMobileCSS = `@media (max-width: 480px) {
    .calendar-container {
        padding: 0 5px;
    }

    .calendar-header {
        padding: 15px;
        flex-direction: column;
        align-items: stretch;
    }

    .calendar-header h1 {
        font-size: 1.5rem;
        text-align: center;
    }

    .header-controls {
        display: flex;
        flex-direction: row;
        justify-content: center;
        gap: 8px;
    }
    
    .header-controls button {
        flex: 1;
        padding: 10px;
        font-size: 0.9rem;
    }

    .week-calendar {
        padding: 10px 0;
        background: transparent;
        box-shadow: none;
    }

    /* Horizontal scroll for the week! 10/10 UX */
    .calendar-grid {
        display: flex;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        padding-bottom: 15px;
        gap: 15px;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none; /* Firefox */
    }
    
    .calendar-grid::-webkit-scrollbar {
        display: none; /* Safari and Chrome */
    }

    .day-column {
        flex: 0 0 85%;
        scroll-snap-align: center;
        min-height: 400px;
        background: white;
        border-radius: 15px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        padding: 20px;
    }

    .day-header {
        border-bottom: 2px solid #f1f5f9;
        margin-bottom: 15px;
    }

    .day-name {
        font-size: 1.1rem;
        color: #334155;
    }

    .day-date {
        font-size: 2.5rem;
        color: #0f172a;
    }

    .day-month {
        font-size: 1rem;
        color: #64748b;
    }
    
    .calendar-event {
        padding: 15px;
    }
    
    .event-title {
        font-size: 1rem;
    }
    
    .event-description {
        font-size: 0.85rem;
    }
}
`;

css = css.replace(mobileRegex, newMobileCSS);
fs.writeFileSync(cssPath, css);

const jsPath = path.join(__dirname, 'backend', 'public', 'js', 'calendar.js');
let js = fs.readFileSync(jsPath, 'utf8');

// Strip out expanded card logic and `updateExpandedCard` since we use horizontal scrolling
const expandedCardLogic = /\/\/ Create expanded card.*?if \(selectedDayData\) \{[\s\S]*?calendarGrid\.appendChild\(expandedCard\);\s*\}/s;
js = js.replace(expandedCardLogic, '// Expanded card logic removed for horizontal scroll UX');

const updateExpandedCardLogic = /\/\/ Function to update the expanded card when a day is clicked\s*function updateExpandedCard\(dayIndex\) \{[\s\S]*?\}/s;
js = js.replace(updateExpandedCardLogic, `// Function to update the expanded card when a day is clicked\nfunction updateExpandedCard(dayIndex) {\n    // Deprecated for horizontal scroll\n}`);

// Find the scroll-to-today logic inside renderCalendar
js = js.replace(/window\.calendarDaysData = allDaysData;/g, 
`window.calendarDaysData = allDaysData;
    
    // Auto-scroll to today if on mobile
    if (window.innerWidth <= 480) {
        setTimeout(() => {
            const todayCol = document.querySelector('.day-column.today');
            if (todayCol) {
                todayCol.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            } else {
                const firstCol = document.querySelector('.day-column');
                if (firstCol) firstCol.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }, 100);
    }`);

fs.writeFileSync(jsPath, js);
console.log('Successfully updated Calendar styles and scripts!');
