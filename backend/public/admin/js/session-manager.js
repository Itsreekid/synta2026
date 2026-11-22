(() => {
    let sessionId;
    let selectedTab = 'replays';
    let opener;
    const dialog = document.createElement('dialog');
    dialog.className = 'session-manager';
    dialog.setAttribute('aria-labelledby', 'session-manager-title');
    dialog.innerHTML = `<header class="session-manager-header"><div><p>Gérer la séance</p><h2 id="session-manager-title" dir="auto"></h2></div><button type="button" class="session-manager-close" aria-label="Fermer la gestion de la séance">×</button></header>
        <nav class="session-manager-tabs" role="tablist" aria-label="Gestion de la séance">
            <button id="manager-tab-replays" type="button" role="tab" data-tab="replays" aria-controls="manager-replays">Replays</button>
            <button id="manager-tab-resources" type="button" role="tab" data-tab="resources" aria-controls="manager-resources">Ressources</button>
            <button id="manager-tab-details" type="button" role="tab" data-tab="details" aria-controls="manager-details">Détails</button>
        </nav>
        <p class="session-manager-notice" role="status" aria-live="polite"></p>
        <div class="session-manager-body">
            <section id="manager-replays" class="session-manager-panel" role="tabpanel" aria-labelledby="manager-tab-replays"></section>
            <section id="manager-resources" class="session-manager-panel" role="tabpanel" aria-labelledby="manager-tab-resources"></section>
            <section id="manager-details" class="session-manager-panel" role="tabpanel" aria-labelledby="manager-tab-details"></section>
        </div>
        <footer class="session-manager-footer"><button type="button" class="btn-secondary" data-refresh>Actualiser</button><button type="button" class="btn-secondary" data-close>Fermer</button></footer>`;
    document.body.append(dialog);
    const notice = dialog.querySelector('[role=status]');
    const tabs = [...dialog.querySelectorAll('[role=tab]')];
    function selectTab(name) {
        selectedTab = name;
        for (const tab of tabs) {
            const selected = tab.dataset.tab === name;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            document.getElementById('manager-' + tab.dataset.tab).hidden = !selected;
        }
    }
    for (const tab of tabs) tab.onclick = () => selectTab(tab.dataset.tab);
    dialog.querySelector('[role=tablist]').onkeydown = event => {
        const index = tabs.indexOf(document.activeElement);
        const next = { ArrowRight:(index+1)%tabs.length, ArrowLeft:(index+tabs.length-1)%tabs.length, Home:0, End:tabs.length-1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        selectTab(tabs[next].dataset.tab);
        tabs[next].focus();
    };
    dialog.querySelector('.session-manager-close').onclick = () => dialog.close();
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
        document.documentElement.classList.remove('session-manager-open');
        if (opener?.isConnected) opener.focus();
        else document.querySelector(`#card-${sessionId} [data-manage-session]`)?.focus();
    });
    window.sessionManagerNotice = (message, type) => {
        if (!dialog.open) return;
        notice.textContent = message;
        notice.dataset.type = type;
    };
    const safeLink = value => {
        try { const url = new URL(value, location.href); return ['http:','https:'].includes(url.protocol) ? escT(url.href) : ''; }
        catch { return ''; }
    };
    const states = { pending:'En attente', importing:'Import en cours', published:'Publié', needs_review:'À vérifier', failed:'Échec' };
    function searchList(panel) {
        const input = panel.querySelector('input[type=search]');
        if (!input) return;
        input.oninput = () => {
            const query = input.value.trim().toLocaleLowerCase('fr');
            let found = 0;
            for (const row of panel.querySelectorAll('[data-search-row]')) {
                row.hidden = !row.textContent.toLocaleLowerCase('fr').includes(query);
                if (!row.hidden) found++;
            }
            panel.querySelector('[data-no-results]').hidden = found > 0;
        };
    }
    function renderReplays(session) {
        const panel = document.getElementById('manager-replays');
        const source = { zoom:'Zoom → R2', external:'Lien externe', upload:'Vidéo téléversée' }[session.replay_source] || 'Replay associé';
        const preview = session.replay_preview_url && safeLink(session.replay_preview_url);
        const segments = allRecordings.filter(recording => recording.live_session_id === session.id)
            .sort((a,b) => new Date(a.recording_start)-new Date(b.recording_start) || a.id.localeCompare(b.id));
        let part = 0;
        panel.innerHTML = `<div class="session-manager-source"><strong>${session.replay_url ? 'Replay publié · ' + source : 'Aucun replay publié'}</strong>
            ${preview ? `<a class="btn-secondary" href="${preview}" target="_blank" rel="noopener noreferrer">Voir le replay publié</a>` : '<p>Ajoutez un enregistrement ou un lien pour cette séance.</p>'}</div>
            <div class="session-manager-actions"><button type="button" class="btn-secondary" data-upload>Téléverser le replay</button><button type="button" class="btn-secondary" data-external>Lien externe</button></div>
            <h3>Enregistrements Zoom</h3>
            ${!liveFeatures.recordings ? '<p class="session-manager-empty">Les imports automatiques sont disponibles après activation de leur migration. Les actions manuelles sont accessibles ci-dessus.</p>' : recordingsLoadError ? '<p class="session-manager-empty">Impossible de charger les segments. Utilisez Actualiser pour réessayer.</p>' : !segments.length ? '<p class="session-manager-empty">Aucun segment importé pour cette séance.</p>' : `
            <input class="session-manager-search" type="search" aria-label="Rechercher un segment" placeholder="Rechercher un segment…">
            <div class="session-manager-list" id="recordings-${session.id}">${segments.map(recording => `<article class="session-manager-item" data-search-row>
                <span class="session-manager-state" data-state="${escT(recording.status)}">${escT(states[recording.status] || recording.status)}${recording.status === 'published' && session.replay_source === 'zoom' ? ' · Partie ' + (++part) : ''}</span>
                ${segmentLine(recording,{selectable:true})}</article>`).join('')}</div><p data-no-results hidden>Aucun segment correspondant.</p>
            ${segments.some(recording => ['needs_review','published'].includes(recording.status)) ? '<button type="button" class="btn-primary" data-publish>Publier la sélection</button>' : ''}`}`;
        panel.querySelector('[data-upload]').onclick = () => uploadReplay(session.id);
        panel.querySelector('[data-external]').onclick = () => {
            if (panel.querySelector('[data-link-form]')) return;
            const form = document.createElement('form');
            form.dataset.linkForm = '';
            form.innerHTML = '<label for="session-replay-link">Lien externe du replay</label><input id="session-replay-link" class="session-manager-search" type="url" placeholder="https://drive.google.com/…"><p>Vérifiez les autorisations du fichier. Laissez vide pour retirer le replay.</p><div class="session-manager-actions"><button type="submit" class="btn-primary">Enregistrer le lien</button><button type="button" class="btn-secondary">Annuler</button></div>';
            const input = form.querySelector('input');
            input.value = session.replay_source === 'external' ? session.replay_url : '';
            form.querySelector('[type=button]').onclick = () => form.remove();
            form.onsubmit = async event => {
                event.preventDefault();
                const submit = form.querySelector('[type=submit]');
                submit.disabled = true;
                try { await updateReplay(session.id,input.value.trim()); }
                finally { submit.disabled = false; }
            };
            panel.querySelector('.session-manager-actions').after(form);
            input.focus();
        };
        const publish = panel.querySelector('[data-publish]');
        if (publish) publish.onclick = () => publishRecordings(session.id);
        panel.querySelectorAll('.recording-pick').forEach((checkbox,index) => checkbox.setAttribute('aria-label', 'Sélectionner le segment ' + (index+1)));
        searchList(panel);
    }
    function renderResources(session) {
        const panel = document.getElementById('manager-resources');
        const resources = session.resources || [];
        panel.innerHTML = `<div class="session-manager-actions"><button type="button" class="btn-secondary" data-add>Ajouter des fichiers (${resources.length})</button></div>
            ${resources.length ? `<input class="session-manager-search" type="search" aria-label="Rechercher un fichier" placeholder="Rechercher un fichier…"><div class="session-manager-list">${resources.map(resource=>`<article class="session-manager-item" data-search-row><strong dir="auto">${escT(resource.title || resource.file_name)}</strong><p>${escT(resource.file_name)} · ${formatSize(resource.file_size)}</p><div class="session-manager-actions">
            ${resource.url && safeLink(resource.url) ? `<a class="btn-secondary" href="${safeLink(resource.url)}" target="_blank" rel="noopener noreferrer">Télécharger</a>` : ''}
            ${resource.preview_url && safeLink(resource.preview_url) ? `<a class="btn-secondary" href="${safeLink(resource.preview_url)}" target="_blank" rel="noopener noreferrer">Ouvrir</a>` : ''}
            <button type="button" class="btn-danger" data-remove="${escT(resource.id)}" aria-label="Supprimer ${escT(resource.file_name)}">Supprimer</button></div></article>`).join('')}</div><p data-no-results hidden>Aucun fichier correspondant.</p>` : '<p class="session-manager-empty">Aucun fichier ajouté à cette séance.</p>'}`;
        panel.querySelector('[data-add]').onclick = () => uploadSessionFiles(session.id);
        panel.querySelectorAll('[data-remove]').forEach(button => button.onclick = async () => {
            try { await deleteSessionResource(button.dataset.remove); }
            catch { window.sessionManagerNotice('Impossible de supprimer ce fichier. Réessayez.', 'error'); }
        });
        searchList(panel);
    }
    function renderDetails(session) {
        const names = (ids, items) => (ids || []).map(id=>items.find(item=>item.id===id)?.title || id).join(', ') || 'Aucun';
        const date = new Date(session.scheduled_at);
        const end = date.getTime() + session.duration_minutes*60000;
        const status = Date.now()>end ? 'Terminée' : Date.now()>=date ? 'En direct' : 'Planifiée';
        const rows = [
            ['Titre',session.title],['Date et heure',date.toLocaleString('fr-FR',{timeZone:'Africa/Tunis',dateStyle:'full',timeStyle:'short'})+' (Tunis)'],
            ['Durée',session.duration_minutes+' min'],['Statut',status],
            ['Offres',names(session.offer_ids?.length ? session.offer_ids : [session.offer_id,...(session.additional_offer_ids || [])].filter(Boolean),allOffers)],
            ['Cours',names(session.course_ids?.length ? session.course_ids : [session.course_id].filter(Boolean),allCourses)],
            ['Étudiants invités',(session.invited_students || []).map(student=>student.name || student.email).join(', ') || (session.granted_student_ids || []).join(', ') || 'Aucun'],
            ['Participants restreints',session.audience_student_ids?.length ? session.audience_student_ids.join(', ') : 'Tous les étudiants admissibles'],
            ['Zoom Meeting ID',session.zoom_meeting_id || 'Non associé'],['Description',session.description || 'Aucune description'],
        ];
        document.getElementById('manager-details').innerHTML = `<dl>${rows.map(([label,value])=>`<dt>${escT(label)}</dt><dd dir="auto">${escT(value)}</dd>`).join('')}</dl>
            ${!session.zoom_meeting_id && session.course_id && !session.offer_id ? '<div class="session-manager-actions"><button type="button" class="btn-primary" data-edit-details>Modifier</button></div>' : ''}
            ${session.has_host_link ? `<div class="session-manager-actions"><a class="btn-host" href="/admin/sessions/${encodeURIComponent(session.id)}/host" target="_blank" rel="noopener noreferrer">Lancer (Hôte)</a></div>` : ''}`;
        document.querySelector('#manager-details [data-edit-details]')?.addEventListener('click',()=>editDetails(session));
    }
    function editDetails(session){
        const panel=document.getElementById('manager-details');
        panel.innerHTML=`<form class="session-details-form"><div class="form-group"><label for="session-edit-title">Titre *</label><input id="session-edit-title" required maxlength="500"></div>
            <div class="form-row"><div class="form-group"><label for="session-edit-date">Date et heure (Tunis) *</label><input id="session-edit-date" type="datetime-local" required></div><div class="form-group"><label for="session-edit-duration">Durée (minutes) *</label><input id="session-edit-duration" type="number" min="1" max="1440" required></div></div>
            <div class="form-group"><label for="session-edit-course">Cours associé *</label><select id="session-edit-course" required></select><small>Changer de cours déplace ce replay et ses ressources vers ce cours.</small></div>
            <div class="form-group"><label for="session-edit-description">Description</label><textarea id="session-edit-description" rows="4" maxlength="10000"></textarea></div>
            <div class="session-manager-actions"><button class="btn-primary" type="submit">Enregistrer les modifications</button><button class="btn-secondary" type="button" data-cancel-edit>Annuler</button></div><p data-edit-error role="alert"></p></form>`;
        const input=name=>panel.querySelector('#session-edit-'+name);
        input('title').value=session.title||'';
        input('date').value=new Date(new Date(session.scheduled_at).getTime()+3600000).toISOString().slice(0,16);
        input('duration').value=session.duration_minutes;input('description').value=session.description||'';
        input('course').replaceChildren(...allCourses.map(course=>new Option(course.title,course.id)));
        input('course').value=session.course_id;
        panel.querySelector('[data-cancel-edit]').onclick=()=>renderDetails(session);
        panel.querySelector('form').onsubmit=async event=>{
            event.preventDefault();const controls=[...panel.querySelectorAll('input,select,textarea,button')];
            const body={title:input('title').value.trim(),startTime:input('date').value+':00+01:00',durationMinutes:Number(input('duration').value),courseId:input('course').value,description:input('description').value};
            controls.forEach(control=>control.disabled=true);
            try{
                const response=await fetch(`${API}/api/live/${encodeURIComponent(session.id)}/details`,{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
                const data=await response.json();if(!response.ok)throw new Error(data.error||'Enregistrement impossible.');
                await loadSessions();window.sessionManagerNotice('Modifications enregistrées.','success');
            }catch(error){panel.querySelector('[data-edit-error]').textContent=error.message;controls.forEach(control=>control.disabled=false);}
        };
        input('title').focus();
    }
    window.refreshSessionManager = () => {
        if (!dialog.open) return;
        const session = allSessions.find(item=>item.id===sessionId);
        if (!session) { notice.textContent='Cette séance est indisponible. Fermez puis actualisez la liste.';return; }
        dialog.querySelector('h2').textContent = session.title;
        renderReplays(session);
        renderResources(session);
        renderDetails(session);
        selectTab(selectedTab);
    };
    async function refresh() {
        const button = dialog.querySelector('[data-refresh]');
        button.disabled = true;
        notice.textContent = 'Chargement de la séance…';
        await loadSessions();
        if (dialog.open) {
            notice.textContent = sessionsLoadError || recordingsLoadError || '';
            notice.dataset.type = notice.textContent ? 'error' : '';
        }
        button.disabled = false;
    }
    dialog.querySelector('[data-refresh]').onclick = refresh;
    window.openSessionManager = (id, trigger) => {
        sessionId=id;opener=trigger;selectedTab='replays';notice.textContent='';
        dialog.showModal();
        document.documentElement.classList.add('session-manager-open');
        window.refreshSessionManager();
        dialog.querySelector('.session-manager-close').focus();
        void refresh();
    };
})();
