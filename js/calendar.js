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
    
    // Day names in French (full and abbreviated)
    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const dayAbbreviations = ['l', 'm', 'm', 'j', 'v', 's', 'd']; // First letter for each day starting Monday
    
    // Today's date for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let totalEventsCount = 0;
    let selectedDayData = null; // Store selected day's data for expanded card
    let allDaysData = []; // Store all days data for click interactions
    
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
        
        // Store day data
        const dayData = {
            dayName: dayNames[i],
            dayAbbr: dayAbbreviations[i],
            date: currentDay.getDate(),
            month: monthNames[currentDay.getMonth()],
            events: dayEvents,
            dateObj: new Date(currentDay),
            index: i
        };
        allDaysData.push(dayData);
        
        // Set initially selected day (today if in this week, otherwise first day)
        if (isToday) {
            selectedDayData = dayData;
        } else if (!selectedDayData) {
            // If we haven't found today yet and this is the first day, use it
            if (i === 0) {
                selectedDayData = dayData;
            }
        }
        
        // Create day column
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        dayColumn.dataset.dayIndex = i; // Store index for click handling
        
        if (isToday) {
            dayColumn.classList.add('today');
        }
        if (dayEvents.length > 0) {
            dayColumn.classList.add('has-events');
            // Set entire border color to match the first event's color
            dayColumn.style.border = `3px solid ${dayEvents[0].color || '#667eea'}`;
        }
        if (isSelected) dayColumn.style.border = '3px solid #ffc107';
        
        // Add click handler for mobile interaction
        dayColumn.style.cursor = 'pointer';
        dayColumn.addEventListener('click', function(e) {
            // Prevent event bubbling
            if (e.target.closest('.calendar-event')) return;
            
            // Update selected day
            updateExpandedCard(i);
        });
        
        // Day header with full name and abbreviated version
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.innerHTML = `
            <div class="day-name" data-short="${dayAbbreviations[i]}">${dayNames[i]}</div>
            <div class="day-date">${currentDay.getDate()}</div>
            <div class="day-month">${monthNames[currentDay.getMonth()]}</div>
        `;
        dayColumn.appendChild(dayHeader);
        
        // Events container (hidden on mobile for compact view)
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
    
    // Create expanded card (mobile only) - appears below the week row
    if (selectedDayData) {
        const expandedCard = document.createElement('div');
        expandedCard.className = 'day-column expanded-card';
        expandedCard.id = 'expanded-card';
        
        // Add 'today' class if the selected day is today
        if (selectedDayData.dateObj.getTime() === today.getTime()) {
            expandedCard.classList.add('today');
        }
        
        const cardHeader = document.createElement('div');
        cardHeader.className = 'day-header';
        cardHeader.innerHTML = `
            <div class="day-name">${selectedDayData.dayName}</div>
            <div class="day-date">${selectedDayData.date}</div>
            <div class="day-month">${selectedDayData.month}</div>
        `;
        expandedCard.appendChild(cardHeader);
        
        const cardEventsContainer = document.createElement('div');
        cardEventsContainer.className = 'day-events';
        cardEventsContainer.id = 'expanded-card-events';
        
        if (selectedDayData.events.length > 0) {
            selectedDayData.events.forEach(event => {
                const eventElement = createEventElement(event, selectedDayData.dateObj);
                cardEventsContainer.appendChild(eventElement);
            });
        } else {
            cardEventsContainer.innerHTML = '<div class="no-events">Aucun événement</div>';
        }
        
        expandedCard.appendChild(cardEventsContainer);
        calendarGrid.appendChild(expandedCard);
    }
    
    // Update event count
    if (totalEventsCount === 0) {
        eventCountElement.textContent = 'Aucun événement cette semaine';
    } else if (totalEventsCount === 1) {
        eventCountElement.textContent = '1 événement cette semaine';
    } else {
        eventCountElement.textContent = `${totalEventsCount} événements cette semaine`;
    }
    
    // Store allDaysData globally for updateExpandedCard function
    window.calendarDaysData = allDaysData;
}

// Function to update the expanded card when a day is clicked
function updateExpandedCard(dayIndex) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const selectedDay = window.calendarDaysData[dayIndex];
    if (!selectedDay) return;
    
    // Update compact row - remove 'today' class from all, add to selected
    const allDayColumns = document.querySelectorAll('.calendar-grid > .day-column:not(.expanded-card)');
    allDayColumns.forEach((col, index) => {
        col.classList.remove('today');
        if (index === dayIndex) {
            col.classList.add('today');
        }
    });
    
    // Update expanded card
    const expandedCard = document.getElementById('expanded-card');
    if (!expandedCard) return;
    
    // Update today class on expanded card (only if it's actually today)
    if (selectedDay.dateObj.getTime() === today.getTime()) {
        expandedCard.classList.add('today');
    } else {
        expandedCard.classList.remove('today');
    }
    
    // Update header
    const cardHeader = expandedCard.querySelector('.day-header');
    cardHeader.innerHTML = `
        <div class="day-name">${selectedDay.dayName}</div>
        <div class="day-date">${selectedDay.date}</div>
        <div class="day-month">${selectedDay.month}</div>
    `;
    
    // Update events
    const cardEventsContainer = document.getElementById('expanded-card-events');
    cardEventsContainer.innerHTML = '';
    
    if (selectedDay.events.length > 0) {
        selectedDay.events.forEach(event => {
            const eventElement = createEventElement(event, selectedDay.dateObj);
            cardEventsContainer.appendChild(eventElement);
        });
    } else {
        cardEventsContainer.innerHTML = '<div class="no-events">Aucun événement</div>';
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
    
    // Handle both object and string description formats
    let descriptionHTML = '';
    if (typeof event.description === 'object' && event.description.line1) {
        descriptionHTML = `
            <div class="event-description">
                <div>${event.description.line1}</div>
                <div>${event.description.line2 || ''}</div>
            </div>
        `;
    } else {
        descriptionHTML = `<div class="event-description">${event.description}</div>`;
    }
    
    eventElement.innerHTML = `
        <div class="event-icon">${event.icon || '📅'}</div>
        <div class="event-time">🕐 ${event.time}</div>
        <div class="event-title">${event.title}</div>
        ${descriptionHTML}
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
    
    // Parse event date and time
    const eventDateTime = new Date(`${event.date}T${event.time}:00`);
    const now = new Date();
    const isEventLive = now >= eventDateTime;
    
    // Handle both object and string description formats
    let descriptionHTML = '';
    if (typeof event.description === 'object' && event.description.line1) {
        descriptionHTML = `
            <div>${event.description.line1}</div>
            ${event.description.line2 ? `<div style="margin-top: 8px;">${event.description.line2}</div>` : ''}
        `;
    } else {
        descriptionHTML = event.description;
    }
    
    // Generate buttons based on whether zoom link exists and if event is live
    const zoomButton = event.zoomLink ? `
        <button class="modal-btn modal-btn-primary" id="join-btn" onclick="joinZoomSession('${event.zoomLink}')" ${!isEventLive ? 'disabled' : ''}>
            🎥 Rejoindre
        </button>
    ` : '';
    
    // Generate countdown or live badge
    let countdownOrBadge = '';
    if (isEventLive) {
        countdownOrBadge = '<div class="event-live-badge">🔴 البث مباشر الآن</div>';
    } else {
        countdownOrBadge = '<div class="countdown-timer" id="countdown-timer"></div>';
    }
    
    modalBody.innerHTML = `
        <div class="modal-event-icon">${event.icon || '📅'}</div>
        <h2 class="modal-event-title">${event.title}</h2>
        ${countdownOrBadge}
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
            ${descriptionHTML}
        </div>
        <div class="modal-actions">
            ${zoomButton}
            <button class="modal-btn modal-btn-secondary" onclick="addToCalendar('${event.title}', '${event.date}', '${event.time}')">
                Ajouter à calendrier
            </button>
            <button class="modal-btn modal-btn-secondary" onclick="closeModal()">
                Fermer
            </button>
        </div>
    `;
    
    modal.style.display = 'block';
    
    // Start countdown if event is not live yet
    if (!isEventLive) {
        startCountdown(eventDateTime, event.zoomLink);
    }
}

let countdownInterval = null;

function closeModal() {
    const modal = document.getElementById('event-modal');
    modal.style.display = 'none';
    
    // Clear countdown interval when closing modal
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

function startCountdown(eventDateTime, zoomLink) {
    const countdownTimer = document.getElementById('countdown-timer');
    const joinBtn = document.getElementById('join-btn');
    
    if (!countdownTimer) return;
    
    // Clear any existing interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    function updateCountdown() {
        const now = new Date();
        const distance = eventDateTime - now;
        
        // If countdown is finished
        if (distance < 0) {
            clearInterval(countdownInterval);
            countdownTimer.innerHTML = '<div class="event-live-badge">🔴 البث مباشر الآن</div>';
            if (joinBtn) {
                joinBtn.disabled = false;
            }
            return;
        }
        
        // Calculate time units
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        // Display countdown in Arabic
        countdownTimer.innerHTML = `
            <div class="countdown-title">⏰ الوقت المتبقي للبث المباشر</div>
            <div class="countdown-display">
                ${days > 0 ? `
                <div class="countdown-unit">
                    <span class="countdown-value">${days}</span>
                    <span class="countdown-label">يوم</span>
                </div>
                ` : ''}
                <div class="countdown-unit">
                    <span class="countdown-value">${String(hours).padStart(2, '0')}</span>
                    <span class="countdown-label">ساعة</span>
                </div>
                <div class="countdown-unit">
                    <span class="countdown-value">${String(minutes).padStart(2, '0')}</span>
                    <span class="countdown-label">دقيقة</span>
                </div>
                <div class="countdown-unit">
                    <span class="countdown-value">${String(seconds).padStart(2, '0')}</span>
                    <span class="countdown-label">ثانية</span>
                </div>
            </div>
        `;
    }
    
    // Update immediately and then every second
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
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
