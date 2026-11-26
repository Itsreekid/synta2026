/* Occurrence controls extend Configuration de la Session; existing campaign/quiz tools stay intact. */
(()=>{
    const panel=document.createElement('section');
    panel.className='card';
    panel.id='campaign-funnel-manager';
    panel.setAttribute('aria-labelledby','campaign-funnel-title');
    panel.style.cssText='padding:22px;margin:22px 0;border:1px solid #dbe5ed;border-radius:16px;background:white';
    panel.hidden=true;
    const mount=document.querySelector('main')||document.querySelector('.container')||document.body;
    mount.append(panel);
    let selected,generation=0;
    const statusLabel={scheduled:'À venir',live:'En direct',completed:'Terminée',cancelled:'Annulée',reserved:'Réservée'};
    const levelLabel={beginner:'Débutant',intermediate:'Intermédiaire',advanced:'Avancé'};
    const endpoint=id=>'/api/session/admin/campaigns/'+encodeURIComponent(id);
    async function api(url,method,body){
        const response=await fetch(url,{
            credentials:'include',...(method&&{
                method,headers:{
                    'Content-Type':'application/json'
                }
                ,body:JSON.stringify(body)
            }
            )
        }
        );
        const data=await response.json().catch(()=>null);
        if(!response.ok)throw new Error(data?.error||'Serveur indisponible.');
        return data;
    }
    const date=value=>new Intl.DateTimeFormat('fr-FR',{
        timeZone:'Africa/Tunis',dateStyle:'full',timeStyle:'short'
    }
    ).format(new Date(value));
    const local=value=>new Date(Date.parse(value)+3600000).toISOString().slice(0,16);
    window.loadCampaignFunnel=async id=>{
        selected=id;
        const version=++generation;
        panel.hidden=true;
        try{
            const data=await api(endpoint(id)+'/occurrences');
            if(version!==generation)return;
            panel.replaceChildren();
            panel.hidden=false;
            const heading=document.createElement('h2');
            heading.id='campaign-funnel-title';
            heading.textContent='Dates et réservations · lien permanent';
            panel.append(heading);
            const note=document.createElement('p');
            note.textContent='Chaque date possède sa réunion Zoom et ses réservations. Les anciens résultats restent conservés. Présence : non mesurée. Conseil : 5 à 8 questions pour un défi découverte.';
            panel.append(note);
            const status=document.createElement('p');
            status.setAttribute('role','status');
            panel.append(status);
            const policy=document.createElement('form');
            policy.style.cssText='display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin:18px 0';
            policy.innerHTML='<label><input type="checkbox" name="reuse" style="width:auto"> Autoriser la réutilisation d’un résultat pour une autre date</label><label>Intermédiaire à partir de (%)<input type="number" name="intermediate" min="1" max="99" required style="max-width:100px"></label><label>Avancé à partir de (%)<input type="number" name="advanced" min="2" max="100" required style="max-width:100px"></label><button class="btn" type="submit">Enregistrer les règles</button>';
            policy.elements.reuse.checked=data.policy.allow_result_reuse;
            policy.elements.intermediate.value=data.policy.diagnostic_rules.intermediate;
            policy.elements.advanced.value=data.policy.diagnostic_rules.advanced;
            panel.append(policy);
            policy.onsubmit=async event=>{
                event.preventDefault();
                const b=policy.querySelector('button');
                b.disabled=true;
                try{
                    await api(endpoint(id)+'/funnel-settings','PUT',{
                        reuse:policy.elements.reuse.checked,intermediate:Number(policy.elements.intermediate.value),advanced:Number(policy.elements.advanced.value)
                    }
                    );
                    status.textContent='Règles enregistrées. Les anciens résultats ne changent pas.';
                }
                catch(error){
                    status.textContent=error.message;
                }
                finally{
                    b.disabled=false;
                }
            }
            ;
            const form=document.createElement('form');
            form.style.cssText='display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:20px 0';
            form.innerHTML='<label>Nouvelle date (heure locale)<input name="start" type="datetime-local" required></label><label>Durée (min)<input name="duration" type="number" min="15" max="480" value="60" required style="max-width:100px"></label><button type="submit" class="btn btn-primary">Ajouter une séance Zoom</button>';
            let requestId=crypto.randomUUID();
            panel.append(form);
            form.onsubmit=async event=>{
                event.preventDefault();
                const b=form.querySelector('button');
                b.disabled=true;
                try{
                    await api(endpoint(id)+'/occurrences','POST',{
                        id:requestId,startTime:new Date(form.elements.start.value+':00+01:00').toISOString(),duration:Number(form.elements.duration.value)
                    }
                    );
                    requestId=crypto.randomUUID();
                    await window.loadCampaignFunnel(id);
                }
                catch(error){
                    status.textContent=error.message;
                }
                finally{
                    b.disabled=false;
                }
            }
            ;
            const history=document.createElement('details'),historyTitle=document.createElement('summary');
            historyTitle.textContent='Tentatives et résultats récents · '+data.attempts.length;
            history.append(historyTitle);
            for(const attempt of data.attempts){
                const p=document.createElement('p');
                p.textContent=(attempt.name||'Invité')+' · '+(attempt.submitted_at?attempt.score+'/'+attempt.total+' · '+(levelLabel[attempt.level]||attempt.level):'En cours')+' · '+date(attempt.created_at);
                history.append(p);
            }
            panel.append(history);
            const list=document.createElement('div');
            list.style.cssText='max-height:440px;overflow:auto';
            panel.append(list);
            if(!data.occurrences.length){
                const empty=document.createElement('p');
                empty.textContent='Aucune date créée.';
                list.append(empty);
            }
            for(const occurrence of data.occurrences){
                const card=document.createElement('article');
                card.style.cssText='padding:16px;border:1px solid #dbe5ed;border-radius:12px;margin-bottom:12px';
                const title=document.createElement('strong');
                title.textContent=date(occurrence.scheduled_at)+' · '+occurrence.duration_minutes+' min';
                const detail=document.createElement('p');
                const participants=data.participants.filter(row=>row.live_session_id===occurrence.id);
                detail.textContent=(statusLabel[occurrence.status]||occurrence.status)+' · '+participants.length+' réservations'+(occurrence.free_reservation_required?'':' · accès historique conservé');
                card.append(title,detail);
                if(participants.length){
                    const names=document.createElement('details'),summary=document.createElement('summary');
                    summary.textContent='Voir les réservations';
                    names.append(summary);
                    participants.forEach(person=>{
                        const p=document.createElement('p');
                        p.textContent=person.name+' · '+(statusLabel[person.status]||person.status)+(person.score!=null?' · '+person.score+'/'+person.total+' · '+(levelLabel[person.level]||person.level):'');
                        names.append(p);
                    }
                    );
                    card.append(names);
                }
                if(occurrence.has_zoom&&occurrence.status!=='cancelled'){
 const host=document.createElement('a');host.className='btn btn-success';host.textContent='Démarrer Zoom';host.href='/admin/sessions/'+encodeURIComponent(occurrence.id)+'/host';host.target='_blank';host.rel='noopener noreferrer';card.append(host);
}
                if(occurrence.status==='scheduled'&&Date.parse(occurrence.scheduled_at)>Date.now()){
                    const input=document.createElement('input');
                    input.type='datetime-local';
                    input.value=local(occurrence.scheduled_at);
                    input.setAttribute('aria-label','Nouvelle date');
                    input.style.cssText='max-width:240px;display:inline-block;margin:8px';
                    card.append(input);
                    for(const [action,label]of [['rescheduled','Reporter et notifier'],['cancelled','Annuler cette date']]){
                        const button=document.createElement('button');
                        button.type='button';
                        button.className='btn';
                        button.textContent=label;
                        button.onclick=async()=>{
                            if(!confirm(label+' ? Les autres dates restent inchangées.'))return;
                            button.disabled=true;
                            try{
                                await api(endpoint(id)+'/occurrences/'+occurrence.id,'PATCH',{
                                    action,expectedStartTime:occurrence.scheduled_at,startTime:new Date(input.value+':00+01:00').toISOString()
                                }
                                );
                                await window.loadCampaignFunnel(id);
                            }
                            catch(error){
                                status.textContent=error.message;
                            }
                            finally{
                                button.disabled=false;
                            }
                        }
                        ;
                        card.append(button);
                    }
                }
                list.append(card);
            }
        }
        catch(error){
            if(version!==generation)return;
            if(!error.message.includes('bientôt disponible')){
                panel.hidden=false;
                panel.textContent=error.message;
            }
        }
    }
    ;
}
)();
