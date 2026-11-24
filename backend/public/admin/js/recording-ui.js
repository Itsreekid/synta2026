// Presentation only. All imports, permissions and publication remain server-owned.
(() => {
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const number = value => (typeof value==='number'||typeof value==='string'&&value.trim()!=='') && value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value)>=0 ? Number(value) : null;
    const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value) : null;
    const timezone = value => { try { new Intl.DateTimeFormat('fr-FR',{timeZone:value || 'Africa/Tunis'}); return value || 'Africa/Tunis'; } catch { return 'Africa/Tunis'; } };
    const duration = seconds => {
        const n=number(seconds);if(n===null)return 'Durée non renseignée';
        const total=Math.round(n);return [Math.floor(total/3600),Math.floor(total/60)%60,total%60].map(part=>String(part).padStart(2,'0')).join(':');
    };
    const size = bytes => {
        const n=number(bytes);if(n===null)return 'Taille non renseignée';
        const unit=n>=1024**3?'Go':'Mo',amount=n/(unit==='Go'?1024**3:1024**2);
        return amount>0&&amount<.1?'< 0,1 Mo':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(amount)+' '+unit;
    };
    const date = (value,zone) => time(value)?.toLocaleDateString('fr-FR',{timeZone:timezone(zone),day:'numeric',month:'long',year:'numeric'}) || 'Date non renseignée';
    const clock = (value,zone) => time(value)?.toLocaleTimeString('fr-FR',{timeZone:timezone(zone),hour:'2-digit',minute:'2-digit',second:'2-digit'}) || 'Heure non renseignée';
    const normalize = raw => {
        const start=raw.start || raw.recording_start,end=raw.end || raw.recording_end;
        const elapsed=time(start)&&time(end)?(time(end)-time(start))/1000:null;
        return {...raw,start,end,durationSeconds:number(raw.durationSeconds) ?? number(elapsed),size:number(raw.size ?? raw.file_size),
            format:raw.format || raw.file_type || null,type:raw.type || raw.recording_type || null,
            status:raw.delete_requested_at?'deleted':raw.status,zone:timezone(raw.timezone)};
    };
    const statuses={available:'Disponible',pending:'En attente',importing:'Importation',needs_review:'Prêt à publier',published:'Publié',failed:'Échec',deleted:'Supprimé',discarded:'Supprimé'};
    const views={shared_screen_with_speaker_view:'Écran et intervenant','shared_screen_with_speaker_view(CC)':'Écran et intervenant',
        shared_screen_with_gallery_view:'Écran et galerie',shared_screen:'Partage d’écran',speaker_view:'Intervenant',active_speaker:'Intervenant',gallery_view:'Galerie'};
    function summary(records,{discovery=false}={}) {
        const files=records.map(normalize);const knownDuration=files.filter(file=>file.durationSeconds!==null),knownSize=files.filter(file=>file.size!==null);
        return `<div class="zoom-summary"><span><strong>${files.length}</strong> segment${files.length>1?'s':''}</span>
            <span>${knownDuration.length?duration(knownDuration.reduce((sum,file)=>sum+file.durationSeconds,0))+(knownDuration.length<files.length?' connues':' au total'):'Durée non renseignée'}</span>
            <span>${esc(knownSize.length?size(knownSize.reduce((sum,file)=>sum+file.size,0))+(knownSize.length<files.length?' connus':' au total'):'Taille non renseignée')}</span>
            <span>${files.filter(file=>file.status===(discovery?'available':'needs_review')).length} ${discovery?'disponible(s)':'prêt(s) à publier'}</span></div>`;
    }
    function segment(raw,index,{selectable=false,discovery=false}={}) {
        const file=normalize(raw),id=esc(file.id),canSelect=selectable && (discovery?file.status==='available':['needs_review','published'].includes(file.status));
        let preview='';try { const url=new URL(file.preview_url,location.href);if(file.preview_url&&['http:','https:'].includes(url.protocol))preview=url.href; } catch {}
        const transferred=number(file.bytes_transferred),measurable=file.size>0&&transferred!==null;
        const percent=measurable?Math.round(Math.min(1,transferred/file.size)*100):null;
        const progress=file.status==='importing'?`<div class="zoom-progress"><progress max="100" ${measurable?`value="${percent}"`:''} aria-label="Avancement de l’importation"></progress><span>${measurable?percent+' % · '+esc(size(transferred))+' / '+esc(size(file.size)):'Transfert en cours…'}</span><small>Actualiser pour mettre à jour l’avancement.</small></div>`:'';
        return `<article class="zoom-segment" data-search-row data-recording="${id}">
            <div class="zoom-segment-top"><label class="zoom-segment-choice"><input type="checkbox" ${canSelect?`class="${discovery?'discovery-pick':'recording-pick'}"`:'disabled'} value="${id}" ${!discovery&&file.status==='published'?'checked':''} aria-label="Sélectionner la partie ${index+1}"><strong>Partie ${index+1}</strong></label>
            <span class="session-manager-state" data-state="${esc(file.status)}">${esc(statuses[file.status] || file.status)}</span></div>
            <div class="zoom-segment-facts"><strong>${duration(file.durationSeconds)}</strong><span>${esc(size(file.size))}</span>${file.format?`<span class="zoom-format">${esc(file.format)}</span>`:''}</div>
            <p class="zoom-segment-time">${date(file.start,file.zone)} · ${clock(file.start,file.zone)}${file.end?' → '+clock(file.end,file.zone)+(date(file.end,file.zone)!==date(file.start,file.zone)?' ('+date(file.end,file.zone)+')':''):''}</p>
            ${views[file.type]?`<p class="zoom-view">${esc(views[file.type])}</p>`:''}${progress}
            ${file.status==='failed'?'<p class="zoom-failure">Le transfert a échoué. Vous pouvez réessayer ce segment.</p>':''}
            <div class="zoom-segment-actions">${preview?`<a class="btn-secondary" href="${esc(preview)}" target="_blank" rel="noopener noreferrer">Aperçu</a>`:''}
            ${!discovery&&file.status==='failed'?`<button type="button" class="btn-secondary" data-retry-recording="${id}">Réessayer</button>`:''}
            ${!discovery&&['needs_review','failed'].includes(file.status)?`<button type="button" class="zoom-delete" aria-label="Placer la partie ${index+1} dans la Corbeille" data-delete-recording="${id}"><i class="fas fa-trash" aria-hidden="true"></i></button>`:''}</div>
            ${file.last_error||file.type&&!views[file.type]?`<details class="zoom-advanced"><summary>Détails techniques</summary>${file.last_error?`<p>${esc(file.last_error)}</p>`:''}${file.type?`<p>${esc(file.type)}</p>`:''}</details>`:''}
        </article>`;
    }
    window.RecordingUI={esc,number,duration,size,date,clock,normalize,summary,segment,timezone};
})();
