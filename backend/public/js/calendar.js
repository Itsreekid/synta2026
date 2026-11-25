// Calendar JavaScript
var currentWeekStart = null;
var selectedDate = null;
var userClass = null;
var userBranch = null;
var sessionDetailsRequest = 0;

document.addEventListener('DOMContentLoaded', function () {
    initializeCalendar();
});

function calendarEventFromSession(ev){
    const d=new Date(ev.scheduled_at),localDate=new Date(d.getTime()-d.getTimezoneOffset()*60000);
    return {...ev,date:localDate.toISOString().split('T')[0],time:d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),description:ev.course?.title||ev.course_title||ev.description||'',zoomLink:ev.join_url||''};
}
function calendarRevision(events){return JSON.stringify(events.map(e=>[e.id,e.title,e.description,e.scheduled_at,e.duration_minutes,e.status,calendarSessionState(e).key]));}
var calendarDataRevision='';

async function initializeCalendar() {
    try {
        // Authentication is verified server-side.
        // We get the user profile from the pre-hydrated global state.
        if (window.__SYNTA_PROFILE__) {
            userClass = window.__SYNTA_PROFILE__.user_class;
            userBranch = window.__SYNTA_PROFILE__.user_branch;
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

        // Fetch events from the server
        try {
            const res = await fetch('/api/live/upcoming', { credentials: 'include' });
            if (res.ok) {
                const apiEvents = await res.json();
                window.upcomingEvents = apiEvents.map(calendarEventFromSession);
            } else {
                window.upcomingEvents = [];
            }
        } catch (e) {
            console.error('Failed to load events', e);
            window.upcomingEvents = [];
        }

        // Render the calendar
        renderCalendar();
        const focusId=urlParams.get('session');
        if(focusId){const event=window.upcomingEvents.find(item=>item.id===focusId);if(event)showEventDetails(event,new Date(event.scheduled_at));}
        const replayId = urlParams.get('replay');
        if (replayId) {
            const response = await fetch('/api/live/session/' + encodeURIComponent(replayId), { credentials: 'include' });
            const session = await response.json();
            if (!response.ok) throw new Error(session.error || 'Replay indisponible.');
            const date = new Date(session.scheduled_at);
            showEventDetails({ ...session, time: date.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}), zoomLink: session.join_url }, date);
        }

    } catch (error) {
        console.error('Error initializing calendar:', error);
        document.getElementById('event-count-text').textContent = error.message || 'Impossible de charger le calendrier.';
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

    // Remove any existing expanded card outside the grid
    const existingExpandedCard = document.getElementById('expanded-card');
    if (existingExpandedCard) {
        existingExpandedCard.remove();
    }

    // Calculate week end date
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Update week range display
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    weekRangeElement.textContent = formatWeekRange(currentWeekStart, weekEnd, monthNames);

    // Day names in French (full and abbreviated)
    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    // Two letters: a single letter makes Mardi and Mercredi identical.
    const dayAbbreviations = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

    // Keep the highlighted day inside the week on screen. A date opened from a
    // link wins; otherwise today; otherwise Monday.
    if (!isDateInWeek(selectedDate, currentWeekStart)) {
        const todayInWeek = new Date();
        todayInWeek.setHours(0, 0, 0, 0);
        selectedDate = isDateInWeek(todayInWeek, currentWeekStart) ? todayInWeek : new Date(currentWeekStart);
    }

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

        // Check if this is the selected date (compare the calendar day, not the clock time)
        const isSelected = sameDay(currentDay, selectedDate);

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

        if (isSelected) selectedDayData = dayData;

        // Create day column
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        dayColumn.dataset.dayIndex = i; // Store index for click handling

        if (isToday) {
            dayColumn.classList.add('today');
        }
        if (dayEvents.length > 0) {
            dayColumn.classList.add('has-events');
        }
        if (isSelected) {
            dayColumn.classList.add('selected');
        }

        // Add click handler for mobile interaction
        dayColumn.style.cursor = 'pointer';
        dayColumn.addEventListener('click', function (e) {
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
        dayHeader.tabIndex=0;dayHeader.setAttribute('role','button');dayHeader.setAttribute('aria-pressed',String(isSelected));
        dayHeader.setAttribute('aria-label',currentDay.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})+' · '+dayEvents.length+' séance(s)');
        if(isToday)dayHeader.setAttribute('aria-current','date');
        dayHeader.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();updateExpandedCard(i);}});
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
            dayEventsContainer.innerHTML = '<div class="empty-state-card"><i class="fas fa-calendar-day"></i><p>Aucune session prévue ce jour</p></div>';
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
            cardEventsContainer.innerHTML = '<div class="empty-state-card"><i class="fas fa-calendar-day"></i><p>Aucune session prévue ce jour</p></div>';
        }

        expandedCard.appendChild(cardEventsContainer);
        calendarGrid.parentNode.appendChild(expandedCard);
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
    layoutWeekTimetable(allDaysData);
    calendarDataRevision=calendarRevision(window.upcomingEvents||[]);
}

function layoutWeekTimetable(days) {
    const grid = document.getElementById('calendar-grid');
    grid.querySelector('.calendar-hours')?.remove();
    const minutes = event => {
        const [hour, minute] = event.time.split(':').map(Number);
        return hour * 60 + minute;
    };
    const events = days.flatMap(day => day.events);
    const firstHour = Math.max(0, Math.min(8, ...events.map(event => Math.floor(minutes(event) / 60))));
    const lastHour = Math.min(24, Math.max(22, ...events.map(event => Math.ceil((minutes(event) + (Number(event.duration_minutes) || 60)) / 60))));
    grid.style.setProperty('--calendar-hours', lastHour - firstHour);
    const rail = document.createElement('div');
    rail.className = 'calendar-hours';
    rail.setAttribute('aria-hidden', 'true');
    for (let hour = firstHour; hour < lastHour; hour++) {
        const label = document.createElement('span');
        label.textContent = String(hour).padStart(2, '0') + ':00';
        rail.append(label);
    }
    grid.prepend(rail);
    days.forEach((day, index) => {
        const elements = [...grid.querySelector(`[data-day-index="${index}"] .day-events`).children];
        const placed = day.events.map((event, position) => ({ element: elements[position],
            start: minutes(event), end: Math.min(1440, minutes(event) + Math.max(1, Number(event.duration_minutes) || 60)) }))
            .sort((a, b) => a.start - b.start || a.end - b.end);
        let group = [];
        let groupEnd = -1;
        const commit = () => {
            const lanes = [];
            for (const item of group) {
                let lane = lanes.findIndex(end => end <= item.start);
                if (lane < 0) lane = lanes.length;
                lanes[lane] = item.end;
                item.lane = lane;
            }
            for (const item of group) {
                item.element.style.setProperty('--event-top', (item.start - firstHour * 60) * 1.5 + 'px');
                item.element.style.setProperty('--event-height', (item.end - item.start) * 1.5 - 4 + 'px');
                item.element.style.setProperty('--event-left', item.lane / lanes.length * 100 + '%');
                item.element.style.setProperty('--event-width', 100 / lanes.length + '%');
                item.element.dataset.overlap=String(lanes.length>1);
                item.element.classList.toggle('is-short',item.end-item.start<55);
                item.element.classList.toggle('is-compact',item.end-item.start<90);
                item.element.classList.toggle('is-tiny',item.end-item.start<30);
            }
        };
        for (const item of placed) {
            if (item.start >= groupEnd) { commit(); group = []; }
            group.push(item);
            groupEnd = Math.max(groupEnd, item.end);
        }
        commit();
    });
    if (window.matchMedia('(min-width: 1200px)').matches) {
        const focusMinute = events.length ? Math.min(...events.map(minutes)) : firstHour * 60;
        grid.parentElement.scrollTop = Math.max(0, (focusMinute - firstHour * 60 - 60) * 1.5);
    }
}

// Function to update the expanded card when a day is clicked
function updateExpandedCard(dayIndex) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selectedDay = window.calendarDaysData[dayIndex];
    if (!selectedDay) return;

    selectedDate = new Date(selectedDay.dateObj);
    selectedDate.setHours(0, 0, 0, 0);

    // Update compact row - remove 'selected' class from all, add to selected
    const allDayColumns = document.querySelectorAll('.calendar-grid > .day-column:not(.expanded-card)');
    allDayColumns.forEach((col, index) => {
        col.classList.remove('selected');
        col.querySelector('.day-header')?.setAttribute('aria-pressed',String(index===dayIndex));
        if (index === dayIndex) {
            col.classList.add('selected');
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
        cardEventsContainer.innerHTML = '<div class="empty-state-card"><i class="fas fa-calendar-day"></i><p>Aucune session prévue ce jour</p></div>';
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

    return upcomingEvents.filter(event => {
        if (event.date !== dateString) return false;

        // Apply targeting filter
        const matchesClass = !event.target_classes ||
            event.target_classes.length === 0 ||
            event.target_classes.includes('all') ||
            (userClass && event.target_classes.includes(userClass));

        const matchesBranch = !event.target_branches ||
            event.target_branches.length === 0 ||
            event.target_branches.includes('all') ||
            (userBranch && event.target_branches.includes(userBranch));

        return matchesClass && matchesBranch;
    });
}

function calendarSessionState(event,now=Date.now()){
    const start=Date.parse(event.scheduled_at||event.date+'T'+event.time+':00');
    const end=event.ends_at?Date.parse(event.ends_at):start+(Number(event.duration_minutes)||60)*60000;
    if(['completed','cancelled'].includes(event.status)||now>=end)return {key:'ended',label:'Terminée'};
    if(now>=start)return {key:'live',label:'En direct'};
    if(event.status==='rescheduled')return {key:'rescheduled',label:'Reportée'};
    return {key:'upcoming',label:'À venir'};
}

// FIX #7: Build event elements with safe DOM APIs (no innerHTML with user data)
function createEventElement(event, date) {
    const eventElement = document.createElement('div');
    const state=calendarSessionState(event);
    eventElement.className = 'calendar-event state-'+state.key;
    eventElement.dataset.sessionId=event.id||'';

    const timeEl = document.createElement('div');
    timeEl.className = 'event-time';
    timeEl.textContent = event.time;

    const titleEl = document.createElement('div');
    titleEl.className = 'event-title';
    titleEl.textContent = event.title; // textContent prevents XSS

    const descEl = document.createElement('div');
    descEl.className = 'event-description';
    if (typeof event.description === 'object' && event.description?.line1) {
        const line1 = document.createElement('div');
        line1.textContent = event.description.line1;
        const line2 = document.createElement('div');
        line2.textContent = event.description.line2 || '';
        descEl.appendChild(line1);
        descEl.appendChild(line2);
    } else {
        descEl.textContent = event.description || '';
    }

    const metaEl = document.createElement('div');
    metaEl.className = 'event-meta';
    metaEl.appendChild(timeEl);
    const status=document.createElement('span');status.className='event-status';status.textContent=state.label;metaEl.append(status);

    eventElement.appendChild(metaEl);
    eventElement.appendChild(titleEl);
    eventElement.appendChild(descEl);
    if(Number(event.duration_minutes)>0){const duration=document.createElement('span');duration.className='event-duration';duration.textContent=event.duration_minutes+' min';eventElement.append(duration);}
    eventElement.tabIndex = 0;
    eventElement.setAttribute('role', 'button');
    eventElement.setAttribute('aria-label', [event.title,event.time,state.label,typeof event.description==='string'?event.description:''].filter(Boolean).join(' · ')+'. Voir les détails');
    eventElement.title = [event.time,event.title,typeof event.description==='string'?event.description:'',state.label,event.duration_minutes?event.duration_minutes+' min':''].filter(Boolean).join(' · ');

    // FIX #7: Use addEventListener instead of onclick attribute (prevents attribute injection)
    const openDetails = async () => {
        const request = ++sessionDetailsRequest;
        if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(event.id || '')) {
            showEventDetails(event, date);
            return;
        }
        try {
            const response = await fetch('/api/live/session/' + encodeURIComponent(event.id), { credentials: 'include' });
            const details = await response.json();
            if (!response.ok) throw new Error(details.error || 'Séance indisponible.');
            if (request === sessionDetailsRequest) showEventDetails({ ...event, ...details, zoomLink: details.join_url }, date);
        } catch (error) {
            if (request === sessionDetailsRequest) document.getElementById('event-count-text').textContent = error.message || 'Séance indisponible.';
        }
    };
    eventElement.addEventListener('click', openDetails);
    eventElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDetails();
        }
    });

    return eventElement;
}

function previousWeek() {
    shiftWeek(-7);
}

function nextWeek() {
    shiftWeek(7);
}

function shiftWeek(days) {
    currentWeekStart.setDate(currentWeekStart.getDate() + days);
    if (selectedDate) selectedDate.setDate(selectedDate.getDate() + days);
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

function sameDay(a, b) {
    return a instanceof Date && b instanceof Date && !isNaN(a) && !isNaN(b)
        && a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function isDateInWeek(date, weekStart) {
    if (!sameDay(date, date) || !(weekStart instanceof Date)) return false;
    const start = new Date(weekStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const day = new Date(date);
    day.setHours(12, 0, 0, 0);
    return day >= start && day < end;
}

function formatWeekRange(start, end, monthNames) {
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    if (sameMonth) {
        return `${start.getDate()} – ${end.getDate()} ${monthNames[start.getMonth()]} ${start.getFullYear()}`;
    }
    const startYear = start.getFullYear() === end.getFullYear() ? '' : ` ${start.getFullYear()}`;
    return `${start.getDate()} ${monthNames[start.getMonth()]}${startYear} – ${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
}

// Reuse the existing authorized reminder refresh instead of adding calendar polling.
document.addEventListener('synta:live-sessions',event=>{
 if(!window.calendarDaysData||!Array.isArray(event.detail))return;
 const next=event.detail.map(calendarEventFromSession);if(calendarRevision(next)===calendarDataRevision)return;
 const scroll=document.querySelector('.week-calendar'),top=scroll?.scrollTop||0;
 const active=document.activeElement,day=active?.closest('[data-day-index]')?.dataset.dayIndex,id=active?.dataset.sessionId;
 window.upcomingEvents=next;renderCalendar();
 if(scroll&&matchMedia('(min-width:1200px)').matches)scroll.scrollTo({top,behavior:'instant'});
 if(id)document.querySelector('.calendar-grid [data-session-id="'+CSS.escape(id)+'"]')?.focus({preventScroll:true});
 else if(day)document.querySelector('[data-day-index="'+CSS.escape(day)+'"] .day-header')?.focus({preventScroll:true});
});
