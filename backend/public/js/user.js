// User Page JavaScript

document.addEventListener('DOMContentLoaded', function () {
    // Note: Authentication is handled server-side. 
    // User balance is pre-rendered in HTML by EJS.
    
    // Update notification badge with event count
    updateNotificationBadge();

    // Set up iframe resize listener
    setupIframeResize();

    // Close mobile menu when clicking outside
    document.addEventListener('click', function (event) {
        const sidebar = document.getElementById('app-sidebar');
        const menuToggle = document.querySelector('.mobile-menu-toggle');
        const profileDropdown = document.getElementById('profileDropdown');
        const profilePicture = document.querySelector('.profile-picture');
        const notificationDropdown = document.getElementById('notificationDropdown');
        const notificationIcon = document.querySelector('.notification-icon');

        // Close sidebar if clicking outside
        if (sidebar && menuToggle &&
            !sidebar.contains(event.target) &&
            !menuToggle.contains(event.target) &&
            sidebar.classList.contains('active')) {
            closeMobileMenu();
        }

        // Close profile dropdown if clicking outside
        if (profileDropdown && profilePicture &&
            !profileDropdown.contains(event.target) &&
            !profilePicture.contains(event.target) &&
            profileDropdown.classList.contains('active')) {
            profileDropdown.classList.remove('active');
        }

        // Close notification dropdown if clicking outside
        if (notificationDropdown && notificationIcon &&
            !notificationDropdown.contains(event.target) &&
            !notificationIcon.contains(event.target) &&
            notificationDropdown.classList.contains('active')) {
            notificationDropdown.classList.remove('active');
        }
    });
});



// Toggle profile dropdown
function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Toggle notifications
function toggleNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');

        // Load events if dropdown is being opened
        if (dropdown.classList.contains('active')) {
            loadUserNotifications();
        }
    }
}

// Fetch and update unread notification badge
async function updateNotificationBadge() {
    const badge = document.getElementById('notificationCount');
    if (!badge) return;

    try {
        const res = await fetch('/api/user/notifications', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const unreadCount = data.notifications.filter(n => !n.is_read).length;
        
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    } catch (error) {
        console.error('Error fetching unread notifications:', error);
    }
}

// Presentation only: old stored messages remain unchanged and render as text.
function notificationPresentation(notification){
    const title=String(notification.title||'');
    const message=String(notification.message||'').replace(/\s*\((?:heure de )?Tunis\)/gi,'').replace(/, heure de Tunis/gi,'')
        .replace(/^(La séance «[\s\S]*?»),?\s*initialement prévue le[\s\S]*?, est reportée au\s*/,'$1 est reportée au ');
    const label=title+' '+String(notification.type||'');
    const kind=/séance|session|replay|cours|reportée/i.test(label)?'session':/paiement|solde|portefeuille|transaction|rembours/i.test(label)?'payment':/warning|échéance|expire|expiration|alerte/i.test(label)?'warning':/success|confirm|validé|réussi/i.test(label)?'success':'info';
    const paths={session:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2m3 10h3m-3 3h6',payment:'M3 6h17v14H3V6Zm0 0V4h14v2m0 6h4v4h-4v-4Z',warning:'m12 3 10 18H2L12 3Zm0 6v5m0 3v1',success:'m5 12 4 4L19 6',info:'M18 8a6 6 0 0 0-12 0v7l-2 3h16l-2-3V8m-8 13h4'};
    const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="'+paths[kind]+'"/></svg>';
    return {kind,message,icon};
}

// Load notifications into dropdown
async function loadUserNotifications() {
    const eventsList = document.getElementById('notificationEventsList');
    if (!eventsList) return;

    eventsList.innerHTML = '<div class="loading" style="padding: 1rem; text-align: center;">Chargement...</div>';

    try {
        const res = await fetch('/api/user/notifications', { credentials: 'include' });
        if (!res.ok) throw new Error('Network error');
        const data = await res.json();
        const notifications = data.notifications;

        if (notifications.length === 0) {
            eventsList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #64748b;">Aucune notification</div>';
            return;
        }

        eventsList.innerHTML = notifications.map((notif,index)=>{
            const presentation=notificationPresentation(notif);
            return '<button type="button" class="notification-event-item '+(!notif.is_read?'is-unread':'')+'" data-notification-index="'+index+'">'+
                '<span class="notification-kind notification-kind--'+presentation.kind+'" aria-hidden="true">'+presentation.icon+'</span>'+
                '<span class="event-info"><span class="event-title" data-notification-title></span><span class="notification-message" data-notification-message dir="auto"></span><span class="notification-date" data-notification-date></span></span>'+
                (!notif.is_read?'<span class="notification-unread-dot" aria-label="Non lue"></span>':'')+'</button>';
        }).join('');
        for (const element of eventsList.querySelectorAll('[data-notification-index]')) {
            const notification = notifications[Number(element.dataset.notificationIndex)];
            element.querySelector('[data-notification-title]').textContent = notification.title;
            element.querySelector('[data-notification-message]').textContent = notificationPresentation(notification).message;
            const date=new Date(notification.created_at);
            element.querySelector('[data-notification-date]').textContent=Number.isFinite(date.getTime())?date.toLocaleString('fr-FR',{timeZone:'Africa/Tunis',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
            element.addEventListener('click', () => markNotificationRead(notification.id, notification.link));
        }
    } catch (error) {
        eventsList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #ef4444;">Erreur de chargement</div>';
    }
}

async function markNotificationRead(id, link) {
    try {
        await fetch(`/api/user/notifications/${id}/read`, { method: 'POST', credentials: 'include' });
        updateNotificationBadge();
        if (link && link !== 'null' && link !== '') {
            const destination = new URL(link, location.href);
            if (destination.origin === location.origin) window.location.href = destination.href;
            else loadUserNotifications();
        } else {
            loadUserNotifications();
        }
    } catch (err) {
        console.error(err);
    }
}

// Toggle mobile menu
function toggleMobileMenu() {
    const sidebar = document.getElementById('app-sidebar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const overlay = document.getElementById('sidebar-overlay');

    if(sidebar) sidebar.classList.toggle('active');
    if(menuToggle) menuToggle.classList.toggle('active');
    if(overlay) overlay.classList.toggle('active');
}

// Close mobile menu
function closeMobileMenu() {
    const sidebar = document.getElementById('app-sidebar');
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        if(menuToggle) menuToggle.classList.remove('active');
        if(overlay) overlay.classList.remove('active');
    }
}

// Load page and close sidebar on mobile
function loadPageAndCloseSidebar(pageName) {
    loadPage(pageName);
    closeMobileMenu();
}


// Page navigation function
function loadPage(pageName) {
    const iframe = document.querySelector('iframe[name="Principal"]');
    if (!iframe) return;

    // Show loading state
    iframe.classList.add('loading');

    // Update navigation active state
    updateActiveNavigation(pageName);

    // Load the page in iframe
    const pagePath = `pages/${pageName}/${pageName}.html`;
    iframe.src = pagePath;

    // Remove loading state after iframe loads
    iframe.onload = function () {
        iframe.classList.remove('loading');
    };
}

// Page navigation function with date parameter
function loadPageWithDate(pageName, date) {
    const iframe = document.querySelector('iframe[name="Principal"]');
    if (!iframe) return;

    // Show loading state
    iframe.classList.add('loading');

    // Update navigation active state
    updateActiveNavigation(pageName);

    // Load the page in iframe with date parameter
    const pagePath = `pages/${pageName}/${pageName}.html?date=${date}`;
    iframe.src = pagePath;

    // Remove loading state after iframe loads
    iframe.onload = function () {
        iframe.classList.remove('loading');
    };
}

// Update active navigation link
function updateActiveNavigation(pageName) {
    // Remove active class from all links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });

    // Add active class to clicked link - updated to match new onclick pattern
    const activeLink = document.querySelector(`[onclick*="'${pageName}'"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}



// Logout function
async function logout() {
    try {
        if (window.auth) {
            const result = await window.auth.signOut();
            if (result.success) {
                showAuthMessage('تم تسجيل الخروج بنجاح...');
                setTimeout(() => {
                    redirectToLogin();
                }, 2000);
            } else {
                console.error('Logout failed:', result.error);
                showAuthMessage('حدث خطأ أثناء تسجيل الخروج. يرجى المحاولة مرة أخرى.');
            }
        } else {
            // If auth is not available, just redirect
            redirectToLogin();
        }
    } catch (error) {
        console.error('Logout error:', error);
        showAuthMessage('حدث خطأ أثناء تسجيل الخروج. يرجى المحاولة مرة أخرى.');
    }
}

// Redirect to login page
function redirectToLogin() {
    window.location.href = '/login';
}

// Show authentication message
function showAuthMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 123, 26, 0.9);
        color: white;
        padding: 20px 30px;
        border-radius: 10px;
        font-family: 'Tajawal', sans-serif;
        font-size: 16px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        text-align: center;
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    // Auto remove after 3 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 3000);
}

// Setup iframe resize functionality
function setupIframeResize() {
    const iframe = document.querySelector('iframe[name="Principal"]');
    if (!iframe) return;

    let resizeObserver = null;

    // Resize iframe on load and setup ResizeObserver
    iframe.addEventListener('load', function () {
        resizeIframe();

        // Dynamically monitor height changes inside the iframe content document body
        try {
            if (iframe.contentWindow && iframe.contentWindow.document && iframe.contentWindow.document.body) {
                if (resizeObserver) {
                    resizeObserver.disconnect();
                }

                resizeObserver = new ResizeObserver(() => {
                    resizeIframe();
                });

                resizeObserver.observe(iframe.contentWindow.document.body);
            }
        } catch (e) {
            console.log('Cannot observe iframe body (cross-origin restriction or page loading):', e);
        }
    });

    // Resize iframe when parent window resizes
    window.addEventListener('resize', function () {
        resizeIframe();
    });
}

// Resize iframe to fit content
function resizeIframe() {
    const iframe = document.querySelector('iframe[name="Principal"]');
    if (!iframe || !iframe.contentWindow) return;

    try {
        // Get the height of the content inside the iframe
        const height = iframe.contentWindow.document.body.scrollHeight;
        if (height > 0) {
            iframe.style.height = height + 'px';
        }
    } catch (e) {
        // Cross-origin restriction or other error
        console.log('Cannot access iframe content (cross-origin restriction)');
    }
}

// Global functions for iframe communication / header onclick handlers
window.loadPage = loadPage;
window.loadPageWithDate = loadPageWithDate;
window.logout = logout;
window.resizeIframe = resizeIframe;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.toggleNotifications = toggleNotifications;
window.toggleProfileDropdown = toggleProfileDropdown; 

// One persistent, server-backed popup controller across Turbo page navigation.
(() => {
 if(window.syntaImportantPopup)return;
 window.syntaImportantPopup=true;
 let dialog=null,current=null,busy=false,saving=false,lastCheck=0,opener=null;
 window.syntaImportantPopupController={pause:()=>{if(saving)return false;close();return true;}};
 function close(){if(dialog){dialog.remove();dialog=null;}current=null;}
 function create(){
  dialog=document.createElement('dialog');dialog.className='important-notification';
  dialog.setAttribute('aria-labelledby','important-notification-title');dialog.setAttribute('aria-describedby','important-notification-message');
  dialog.innerHTML='<button type="button" class="important-close" aria-label="Fermer et confirmer la lecture">×</button><div class="important-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2m3 10h3m-3 3h6"/></svg></div><h2 id="important-notification-title">Séance reportée</h2><p id="important-notification-message" dir="auto"></p><div class="important-actions"><button type="button" class="important-calendar">Voir le calendrier</button><button type="button" class="important-understood">J’ai compris</button></div><p class="important-error" role="alert"></p>';
  document.body.append(dialog);
  dialog.querySelector('.important-close').onclick=()=>acknowledge(false);
  dialog.querySelector('.important-understood').onclick=()=>acknowledge(false);
  dialog.querySelector('.important-calendar').onclick=()=>acknowledge(true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();acknowledge(false);});
 }
 async function acknowledge(navigate){
  if(saving||!current)return;saving=true;
  const item=current;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   const response=await fetch('/api/user/notifications/'+encodeURIComponent(item.id)+'/acknowledge',{method:'POST',credentials:'include'});
   if(!response.ok)throw Error('Confirmation impossible. Vérifiez votre connexion et réessayez.');
   if(dialog&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)await dialog.animate([{opacity:1},{opacity:0}],{duration:100}).finished.catch(()=>{});
   close();opener?.isConnected&&opener.focus();
   if(navigate){window.location.assign(item.link);return;}
  }catch(error){if(dialog){dialog.querySelector('.important-error').textContent=error.message;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  finally{saving=false;}
  if(!dialog)check(true);
 }
 async function check(force=false){
  if(busy||saving||document.visibilityState==='hidden'||!document.getElementById('app-header-top'))return;
  await window.syntaLiveReminders?.refresh();
  if(window.syntaLiveReminders?.hasPriority())return;
  if(!force&&Date.now()-lastCheck<2000)return;
  if(document.querySelector('dialog[open]:not(.important-notification)'))return;
  busy=true;lastCheck=Date.now();
  try{
   const response=await fetch('/api/user/notifications/important',{credentials:'include',cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();if(document.visibilityState==='hidden')return;
   const item=data.notifications?.[0];
   if(!item){close();return;}
   if(dialog&&current?.id===item.id)return;
   close();if(document.querySelector('dialog[open]'))return;
   current=item;opener=document.activeElement;create();
   dialog.querySelector('#important-notification-message').textContent=item.message;
   dialog.showModal();dialog.querySelector('.important-calendar').focus();
  }catch{}finally{busy=false;}
 }
 document.addEventListener('DOMContentLoaded',()=>check());
 document.addEventListener('turbo:load',()=>check(true));
 document.addEventListener('turbo:before-cache',close);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')close();else check(true);});
 document.addEventListener('close',()=>check(),true);
 document.addEventListener('synta:popup-available',()=>check(true));
 window.addEventListener('pageshow',()=>check(true));window.addEventListener('focus',()=>check());
 if(document.readyState!=='loading')check();
})();
