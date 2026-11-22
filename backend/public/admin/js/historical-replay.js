// Historical replay entry uses the existing upload/resource APIs and course access.
(() => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal historical-replay';
    dialog.setAttribute('aria-labelledby','historical-replay-title');
    dialog.innerHTML = `<form>
        <div class="modal-title"><span id="historical-replay-title">Ajouter un replay</span><button type="button" class="btn-secondary" data-close aria-label="Fermer" style="margin-inline-start:auto">×</button></div>
        <p style="color:#718096;margin-bottom:1rem">Ajoutez une ancienne séance à son mois d’origine, sans créer de réunion Zoom.</p>
        <fieldset style="border:0;padding:0;margin:0">
        <div class="form-group"><label for="history-title">Titre *</label><input id="history-title" required maxlength="500" data-metadata></div>
        <div class="form-group"><label for="history-course">Cours associé *</label><select id="history-course" required data-metadata></select></div>
        <div class="form-row"><div class="form-group"><label for="history-date">Date et heure d’origine (Tunis) *</label><input id="history-date" type="datetime-local" required data-metadata></div>
        <div class="form-group"><label for="history-duration">Durée (minutes)</label><input id="history-duration" type="number" min="1" max="1440" value="90" required data-metadata></div></div>
        <div class="form-group"><label for="history-source">Vidéo *</label><select id="history-source" data-metadata><option value="link">Lien externe (Google Drive…)</option><option value="upload">Téléverser une vidéo</option></select></div>
        <div class="form-group" data-link><label for="history-link">Lien externe *</label><input id="history-link" type="url" required placeholder="https://drive.google.com/file/d/…/view" data-metadata><small>Le fichier Drive doit être accessible à vos élèves.</small></div>
        <div class="form-group" data-upload hidden><label for="history-video">Vidéo MP4, WebM ou MOV (1 Go maximum) *</label><input id="history-video" type="file" accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"></div>
        <div class="form-group"><label for="history-files">Ressources (facultatif)</label><input id="history-files" type="file" multiple><small>PDF, brouillons, exercices Python… 25 Mo maximum par fichier.</small></div>
        </fieldset>
        <p data-status role="status" style="color:#9a3412;overflow-wrap:anywhere"></p>
        <div class="modal-actions"><button type="button" class="btn-secondary" data-close>Fermer</button><button class="btn-primary" type="submit">Ajouter le replay</button></div>
    </form>`;
    const style = document.createElement('style');
    style.textContent = '.historical-replay{border:0;margin:auto;width:calc(100% - 2rem);box-sizing:border-box}.historical-replay::backdrop{background:rgba(0,0,0,.55)}.historical-replay form{display:flex;flex-direction:column;max-height:calc(100dvh - 100px)}.historical-replay fieldset{min-width:0;min-height:0;overflow-y:auto;flex:1}.historical-replay .modal-title,.historical-replay .modal-actions,.historical-replay form>p{flex-shrink:0}.historical-replay input,.historical-replay select{box-sizing:border-box;min-width:0;max-width:100%}@media(max-width:480px){.historical-replay{padding:1rem}.historical-replay .form-row{grid-template-columns:1fr}}';
    document.head.append(style);document.body.append(dialog);
    const form=dialog.querySelector('form'), fieldset=dialog.querySelector('fieldset'), status=dialog.querySelector('[data-status]');
    const field=id=>dialog.querySelector('#history-'+id);
    let requestId, savedId, busy=false, opener, videoSaved=false, uploadedFiles=new Set();
    function close(){if(!busy)dialog.close();}
    dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=close);
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>opener?.focus());
    field('source').onchange=()=>{
        const upload=field('source').value==='upload';
        dialog.querySelector('[data-link]').hidden=upload;dialog.querySelector('[data-upload]').hidden=!upload;
        field('link').required=!upload;field('video').required=upload;
    };
    window.openHistoricalReplay=async trigger=>{
        if(dialog.open)return;
        opener=trigger;form.reset();savedId=null;videoSaved=false;uploadedFiles=new Set();requestId=crypto.randomUUID();
        fieldset.disabled=false;dialog.querySelectorAll('[data-metadata]').forEach(input=>input.disabled=false);
        status.textContent='';field('source').onchange();
        field('date').max=new Date(Date.now()+3600000).toISOString().slice(0,16);
        dialog.showModal();field('title').focus();
        if(!allCourses.length){status.textContent='Chargement des cours…';await loadCourses();}
        field('course').replaceChildren(new Option('Choisir un cours…',''),...allCourses.map(course=>new Option(course.title,course.id)));
        status.textContent=allCourses.length?'':'Aucun cours disponible. Créez d’abord le cours associé.';
    };
    form.onsubmit=async event=>{
        event.preventDefault();if(busy)return;
        const upload=field('source').value==='upload', video=field('video').files[0], files=[...field('files').files];
        const type=video && ({mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'}[video.name.split('.').pop().toLowerCase()]);
        if(upload && !videoSaved && (!video || !type || video.size>1024**3)){status.textContent='Choisissez une vidéo MP4, WebM ou MOV de 1 Go maximum.';return;}
        if(files.some(file=>file.size>25*1024**2)){status.textContent='Chaque ressource doit faire 25 Mo maximum.';return;}
        busy=true;fieldset.disabled=true;form.querySelector('[type=submit]').disabled=true;
        try {
            status.textContent='Enregistrement du replay…';
            if(!savedId){
                const response=await fetch(`${API}/api/live/replays`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                    id:requestId,courseId:field('course').value,title:field('title').value.trim(),
                    startTime:field('date').value+':00+01:00',durationMinutes:Number(field('duration').value),replayUrl:upload?null:field('link').value.trim(),
                })});
                const data=await response.json();if(!response.ok)throw new Error(data.error || 'Enregistrement impossible.');savedId=data.id;
            }
            if(upload && !videoSaved){status.textContent='Transfert de la vidéo…';await uploadReplayFile(savedId,video,type);videoSaved=true;}
            for(const file of files){
                const key=JSON.stringify([file.name,file.size,file.lastModified]);if(uploadedFiles.has(key))continue;
                status.textContent='Ajout de '+file.name+'…';await uploadPracticeFile({liveSessionId:savedId},file);uploadedFiles.add(key);
            }
            await loadSessions();busy=false;dialog.close();showToast('Replay ajouté à sa date d’origine.','success');
        } catch(error){status.textContent=(savedId?'La séance est enregistrée. ':'')+error.message+' Réessayez ici pour reprendre sans créer de doublon.';}
        finally {busy=false;fieldset.disabled=false;form.querySelector('[type=submit]').disabled=false;
            if(savedId)dialog.querySelectorAll('[data-metadata]').forEach(input=>input.disabled=true);}
    };
})();
