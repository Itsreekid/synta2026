// Calendar JavaScript
let currentWeekStart = null;
let selectedDate = null;

document.addEventListener('DOMContentLoaded', function() {
    initializeCalendar();
});

async function initializeCalendar() {
    try {
        // Wait for authentication to initialize
        let attempts = 0;
        const maxAttempts = 20;
        
        while (!window.auth && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.auth) {
            console.error('Authentication not initialized');
            return;
        }
        
        // Check authentication
        const authResult = await window.auth.getCurrentUser();
        if (!authResult.success || !authResult.user) {
            window.location.href = '../auth/login.html';
            return;
        }

        // Check if a date was passed via URL
        const urlParams = new URLSearchParams(window.location.search);
        const dateParam = urlParams.get('date');
        
        // Also check sessionStorage for date (when loaded via parent loadPage)
        const sessionDate = sessionStorage.getItem('calendarDate');
        
        if (dateParam) {
            selectedDate = new Date(dateParam);
            currentWeekStart = getWeekStart(selectedDate);
        } else if (sessionDate) {
            selectedDate = new Date(sessionDate);
            currentWeekStart = getWeekStart(selectedDate);
            // Clear the sessionStorage after using it
            sessionStorage.removeItem('calendarDate');
        } else {
            selectedDate = new Date();
            currentWeekStart = getWeekStart(new Date());
        }
        
        // Render the calendar
        renderCalendar();
        
    } catch (error) {
        console.error('Error initializing calendar:', error);
    }
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
}

function renderCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    const weekRangeElement = document.getElementById('current-week-range');
    const eventCountElement = document.getElementById('event-count-text');
    
    // Clear the grid
    calendarGrid.innerHTML = '';
    
    // Calculate week end date
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    // Update week range display
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const weekRangeText = `${currentWeekStart.getDate()} ${monthNames[currentWeekStart.getMonth()]} - ${weekEnd.getDate()} ${monthNames[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
    weekRangeElement.textContent = weekRangeText;
    
    // Day names in French
    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    
    // Today's date for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let totalEventsCount = 0;
    
    // Generate 7 days starting from Monday
    for (let i = 0; i < 7; i++) {
        const currentDay = new Date(currentWeekStart);
        currentDay.setDate(currentDay.getDate() + i);
        
        // Get events for this day
        const dayEvents = getEventsForDate(currentDay);
        totalEventsCount += dayEvents.length;
        
        // Check if this is today
        const isToday = currentDay.getTime() === today.getTime();
        
        // Check if this is the selected date
        const isSelected = selectedDate && currentDay.getTime() === selectedDate.getTime();
        
        // Create day column
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        if (isToday) dayColumn.classList.add('today');
        if (dayEvents.length > 0) {
            dayColumn.classList.add('has-events');
            // Set entire border color to match the first event's color
            dayColumn.style.border = `3px solid ${dayEvents[0].color || '#667eea'}`;
        }
        if (isSelected) dayColumn.style.border = '3px solid #ffc107';
        
        // Day header
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.innerHTML = `
            <div class="day-name">${dayNames[i]}</div>
            <div class="day-date">${currentDay.getDate()}</div>
            <div class="day-month">${monthNames[currentDay.getMonth()]}</div>
        `;
        dayColumn.appendChild(dayHeader);
        
        // Events container
        const dayEventsContainer = document.createElement('div');
        dayEventsContainer.className = 'day-events';
        
        if (dayEvents.length > 0) {
            dayEvents.forEach(event => {
                const eventElement = createEventElement(event, currentDay);
                dayEventsContainer.appendChild(eventElement);
            });
        } else {
            dayEventsContainer.innerHTML = '<div class="no-events">Aucun événement</div>';
        }
        
        dayColumn.appendChild(dayEventsContainer);
        calendarGrid.appendChild(dayColumn);
    }
    
    // Update event count
    if (totalEventsCount === 0) {
        eventCountElement.textContent = 'Aucun événement cette semaine';
    } else if (totalEventsCount === 1) {
        eventCountElement.textContent = '1 événement cette semaine';
    } else {
        eventCountElement.textContent = `${totalEventsCount} événements cette semaine`;
    }
}

function getEventsForDate(date) {
    if (typeof upcomingEvents === 'undefined' || !Array.isArray(upcomingEvents)) {
        return [];
    }
    
    // Format date as YYYY-MM-DD in local timezone
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    return upcomingEvents.filter(event => event.date === dateString);
}

function createEventElement(event, date) {
    const eventElement = document.createElement('div');
    eventElement.className = 'calendar-event';
    eventElement.style.borderLeftColor = event.color || '#667eea';
    
    eventElement.innerHTML = `
        <div class="event-icon">${event.icon || '📅'}</div>
        <div class="event-time">🕐 ${event.time}</div>
        <div class="event-title">${event.title}</div>
        <div class="event-description">${event.description}</div>
    `;
    
    eventElement.onclick = () => showEventDetails(event, date);
    
    return eventElement;
}

function showEventDetails(event, date) {
    const modal = document.getElementById('event-modal');
    const modalBody = document.getElementById('modal-body');
    
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    
    const dateString = `${dayNames[date.getDay()]}, ${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    
    // Generate buttons based on whether zoom link exists
    const zoomButton = event.zoomLink ? `
        <button class="modal-btn modal-btn-primary" onclick="joinZoomSession('${event.zoomLink}')">
            🎥 Rejoindre la session
        </button>
    ` : '';
    
    modalBody.innerHTML = `
        <div class="modal-event-icon">${event.icon || '📅'}</div>
        <h2 class="modal-event-title">${event.title}</h2>
        <div class="modal-event-details">
            <div class="modal-event-detail">
                <strong>📅 Date:</strong>
                <span>${dateString}</span>
            </div>
            <div class="modal-event-detail">
                <strong>🕐 Heure:</strong>
                <span>${event.time}</span>
            </div>
        </div>
        <div class="modal-event-description">
            ${event.description}
        </div>
        <div class="modal-actions">
            ${zoomButton}
            <button class="modal-btn modal-btn-secondary" onclick="addToCalendar('${event.title}', '${event.date}', '${event.time}')">
                Ajouter à mon calendrier
            </button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">
                Fermer
            </button>
        </div>
    `;
    
    modal.style.display = 'block';
}

function closeModal() {
    const modal = document.getElementById('event-modal');
    modal.style.display = 'none';
}

function addToCalendar(title, date, time) {
    // Create an ICS file for calendar download
    const eventDate = new Date(`${date}T${time}`);
    const endDate = new Date(eventDate.getTime() + 60 * 60 * 1000); // 1 hour duration
    
    const formatICSDate = (date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Synta Academy//Calendar//FR
BEGIN:VEVENT
UID:${Date.now()}@syntaacademy.com
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(eventDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${title}
DESCRIPTION:Événement Synta Academy
END:VEVENT
END:VCALENDAR`;
    
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'event.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert('L\'événement a été téléchargé. Ouvrez le fichier pour l\'ajouter à votre calendrier.');
}

function previousWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    renderCalendar();
}

function nextWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    renderCalendar();
}

function goToToday() {
    selectedDate = new Date();
    currentWeekStart = getWeekStart(new Date());
    renderCalendar();
}

function goBack() {
    // Check if we're in an iframe
    if (window.parent && window.parent.loadPage && window.parent !== window) {
        // Navigate back to dashboard within the iframe
        window.parent.loadPage('dashboard');
    } else {
        // Direct navigation fallback
        window.location.href = '../dashboard/dashboard.html';
    }
}

function joinZoomSession(zoomLink) {
    // Open Zoom link in a new tab
    window.open(zoomLink, '_blank');
    closeModal();
}

// Close modal when clicking outside of it
window.onclick = function(event) {
    const modal = document.getElementById('event-modal');
    if (event.target === modal) {
        closeModal();
    }
}
