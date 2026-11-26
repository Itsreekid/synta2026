/* Campaign discovery UI. Scores, ownership and reservations are always server-authoritative. */
document.addEventListener('DOMContentLoaded',()=>{
    const config=window.__SESSION__;
    if(!config)return;
    const $=id=>document.getElementById(id),slug=config.slug,path='/session/'+slug;
    const panels=['start-panel','identity-panel','quiz-panel','result-panel'];
    let meta,mode='guest',attempt,questions=[],answers={
    }
    ,orders={
    }
    ,index=0,busy=false,verified=false;
    const classNames={
        '1ere':'1ère année','2eme':'2ème année','3eme':'3ème année',bac:'Baccalauréat',other:'Autre'
    }
    ;
    const date=value=>new Intl.DateTimeFormat('fr-FR',{
        dateStyle:'full',timeStyle:'short',timeZone:'Africa/Tunis'
    }
    ).format(new Date(value));
    const notice=(id,text)=>{
        const node=$(id);
        node.textContent=text||'';
        node.hidden=!text;
    }
    ;
    const show=id=>{
        const label=$('occurrence-select').closest('label');
        if(id==='result-panel')$('result-panel').insertBefore(label,$('reservation-confirmation'));
        else if(id==='identity-panel')$('identity-panel').insertBefore(label,$('identity-form'));
        document.querySelector('.campaign-shell').classList.toggle('is-playing',id!=='start-panel');
        panels.forEach(name=>$(name).hidden=name!==id);
        $('experience').scrollIntoView({
            block:'nearest',behavior:'smooth'
        }
        );
    }
    ;
    async function request(url,body){
        const response=await fetch('/api/session'+url,{
            credentials:'include',cache:'no-store',...(body&&{
                method:'POST',headers:{
                    'Content-Type':'application/json'
                }
                ,body:JSON.stringify(body)
            }
            )
        }
        );
        const data=await response.json().catch(()=>null);
        if(!response.ok)throw Object.assign(new Error(data?.error||'Le serveur est momentanément indisponible. Réessaie.'),{
            status:response.status,data
        }
        );
        return data;
    }
    function key(){
        return 'synta-free-draft:'+(meta?.campaign?.id||slug)+':'+(attempt?.id||'verified');
    }
    function store(){
        try{
            sessionStorage.setItem(key(),JSON.stringify({
                answers,index,orders,savedAt:Date.now()
            }
            ));
        }
        catch{
        }
    }
    function restore(){
        try{
            // Campaign UUID survives renames. Recover older slug-keyed drafts only
            // for this exact server-issued attempt, never another campaign's quiz.
            const oldKey=attempt?.id?Object.keys(sessionStorage).find(name=>name.startsWith('synta-free-draft:')&&name.endsWith(':'+attempt.id)):null;
            const data=JSON.parse(sessionStorage.getItem(key())||(oldKey&&sessionStorage.getItem(oldKey))||(!attempt?.id&&sessionStorage.getItem('synta-free-draft:'+slug+':verified'))||'null');
            if(data&&Date.now()-data.savedAt<48*3600000){
                const ids=new Set(questions.map(q=>q.id));
                answers=Object.fromEntries(Object.entries(data.answers||{
                }
                ).filter(([id])=>ids.has(id)));
                orders=data.orders||{
                }
                ;
                index=Math.min(Math.max(Number(data.index)||0,0),Math.max(0,questions.length-1));
            }
        }
        catch{
        }
    }
    function currentOccurrence(){
        return $('occurrence-select').value||null;
    }
    function prepareIdentity(){
        show('identity-panel');
        const c=meta.campaign;
        const fixed=[];
        for(const [id,value]of [['profile-class',c.target_class],['profile-branch',c.target_branch]]){
            if(value){
                $(id).value=value;
                $(id).disabled=true;
                $(id).closest('label').hidden=true;
                fixed.push($(id).selectedOptions[0].textContent);
            }
        }
        $('campaign-profile-info').textContent='Parcours de la séance : '+fixed.join(' · ');
        $('campaign-profile-info').hidden=!fixed.length;
        $('full_name').focus();
    }
    function present(result){
        attempt=mode==='guest'?{
            ...attempt,...result
        }
        :attempt;
        show('result-panel');
        const total=Number(result.total||result.quiz_total)||0,score=Number(result.score)||0;
        const level=result.level||(result.tier==='elite'?'advanced':result.tier==='challenger'?'intermediate':'beginner');
        const levels={
            beginner:['Débutant','Tu as posé les premières bases. Chaque exercice compte.','Commence par les notions essentielles et essaie les leçons en aperçu gratuit.'],intermediate:['Intermédiaire','Tu as déjà des acquis sur lesquels construire.','Consolide les notions moins familières avec des exemples et des exercices.'],advanced:['Avancé','De bons repères sur ce défi. Continue à approfondir.','Mets tes acquis en pratique et prépare tes questions pour la séance.']
        }
        ;
        const info=levels[level]||levels.beginner;
        $('success-tier-name').textContent=info[0];
        $('success-score').textContent=score+' / '+total;
        $('result-percent').textContent=total?(result.percentage??Math.round(score*1000/total)/10)+' %':'';
        $('result-message').textContent=info[1];
        $('result-recommendation').textContent=info[2];
        $('save-result').textContent=config.member?'Enregistrer et réserver ma séance gratuite':verified?'Créer mon compte et réserver':'Enregistrer mon résultat et réserver ma séance gratuite';
        $('save-result').hidden=config.preview;
        $('retry-challenge').hidden=verified;
        notice('reservation-confirmation','');
    }
    async function start(restart=false){
        if(busy)return;
        busy=true;
        $('challenge-start').disabled=true;
        notice('experience-error','');
        try{
            if(config.preview)throw new Error('Utilise un compte étudiant pour participer.');
            if(meta.funnel){
                mode='guest';
                const data=await request('/guest/start',{
                    slug,restart
                }
                );
                attempt=data.attempt;
                questions=data.questions;
                if(attempt.submitted){
                    present(attempt);
                    return;
                }
            }
            else if(config.member){
                mode='member';
                questions=(await request('/questions?slug='+encodeURIComponent(slug))).questions;
            }
            else if(verified){
                mode='verified';
                questions=(await request('/questions?slug='+encodeURIComponent(slug))).questions;
            }
            else{
                prepareIdentity();
                return;
            }
            if(!questions.length)throw new Error('Le défi est en préparation. Reviens bientôt.');
            answers={
            }
            ;
            orders={
            }
            ;
            index=0;
            restore();
            show('quiz-panel');
            render();
        }
        catch(error){
            notice('experience-error',error.message);
        }
        finally{
            busy=false;
            $('challenge-start').disabled=false;
        }
    }
    function answered(q){
        return answers[q.id]!==undefined&&(!Array.isArray(answers[q.id])||answers[q.id].length===q.options?.length);
    }
    function render(){
        const q=questions[index],mount=$('question-container');
        mount.replaceChildren();
        notice('quiz-error','');
        $('quiz-progress-text').textContent='Question '+(index+1)+' sur '+questions.length;
        const percentage=index/questions.length*100;
        $('quiz-progress-bar').style.width=percentage+'%';
        document.querySelector('.progress-track').setAttribute('aria-valuenow',String(Math.round(percentage)));
        const title=document.createElement('h2');
        title.className='question-text';
        title.dir='auto';
        title.textContent=q.text;
        mount.append(title);
        if(!Array.isArray(q.options)||!q.options.length){
            notice('quiz-error','Cette question est en préparation. Contacte Synta Academy.');
            return;
        }
        const options=q.options.map(value=>({
            id:typeof value==='object'&&value!==null?value.id:value,label:typeof value==='object'&&value!==null?value.label:value
        }
        ));
        if(q.type==='drag_drop'){
            const hint=document.createElement('p');
            hint.className='hint';
            hint.textContent='Place les éléments dans le bon ordre. Glisse-les ou utilise les flèches Monter et Descendre.';
            mount.append(hint);
            if(!orders[q.id])orders[q.id]=options.map(o=>o.id).sort(()=>Math.random()-.5);
            if(Array.isArray(answers[q.id]))orders[q.id]=answers[q.id].slice();
            const list=document.createElement('ol');
            list.className='order-list';
            let dragging=null;
            const move=(from,to)=>{
                const values=orders[q.id];
                if(to<0||to>=values.length)return;
                values.splice(to,0,...values.splice(from,1));
                answers[q.id]=values.slice();
                store();
                render();
                const rows=$('question-container').querySelectorAll('.order-row');
                rows[to]?.querySelector('button')?.focus();
            }
            ;
            orders[q.id].forEach((id,i)=>{
                const row=document.createElement('li');
                row.className='order-row';
                row.draggable=true;
                const text=document.createElement('span');
                text.dir='auto';
                text.textContent=(i+1)+'. '+(options.find(o=>o.id===id)?.label||id);
                row.append(text);
                for(const [delta,symbol,label]of [[-1,'↑','Monter'],[1,'↓','Descendre']]){
                    const button=document.createElement('button');
                    button.type='button';
                    button.textContent=symbol;
                    button.setAttribute('aria-label',label+' l’élément '+(i+1));
                    button.disabled=i+delta<0||i+delta>=options.length;
                    button.onclick=()=>move(i,i+delta);
                    button.onkeydown=event=>{
                        if(['ArrowUp','ArrowDown'].includes(event.key)){
                            event.preventDefault();
                            move(i,i+(event.key==='ArrowUp'?-1:1));
                        }
                    }
                    ;
                    row.append(button);
                }
                row.ondragstart=event=>{
                    dragging=i;
                    event.dataTransfer.setData('text/plain',String(i));
                }
                ;
                row.ondragover=event=>event.preventDefault();
                row.ondrop=event=>{
                    event.preventDefault();
                    if(dragging!==null)move(dragging,i);
                }
                ;
                list.append(row);
            }
            );
            mount.append(list);
            const confirm=document.createElement('button');
            confirm.className='button secondary';
            confirm.type='button';
            confirm.textContent='Valider cet ordre';
            confirm.onclick=()=>{
                answers[q.id]=orders[q.id].slice();
                store();
                navigation();
            }
            ;
            mount.append(confirm);
        }
        else{
            options.forEach(option=>{
                const label=document.createElement('label');
                label.className='option-card';
                const input=document.createElement('input');
                input.type='radio';
                input.name='answer';
                input.checked=answers[q.id]===option.id;
                input.onchange=()=>{
                    answers[q.id]=option.id;
                    store();
                    navigation();
                }
                ;
                const text=document.createElement('span');
                text.dir='auto';
                text.textContent=option.label;
                label.append(input,text);
                mount.append(label);
            }
            );
        }
        navigation();
        mount.focus({
            preventScroll:true
        }
        );
        store();
    }
    function navigation(){
        const last=index===questions.length-1;
        $('btn-prev').hidden=index===0;
        $('btn-next').hidden=last;
        $('btn-submit').hidden=!last;
        $('btn-next').disabled=!answered(questions[index]);
        $('btn-submit').disabled=!questions.every(answered);
    }
    $('btn-prev').onclick=()=>{
        if(index>0){
            index--;
            render();
        }
    }
    ;
    $('btn-next').onclick=()=>{
        if(index<questions.length-1){
            index++;
            render();
        }
    }
    ;
    $('btn-submit').onclick=async()=>{
        if(busy)return;
        busy=true;
        $('btn-submit').disabled=true;
        notice('quiz-error','');
        try{
            let data;
            if(mode==='guest'){
                data=await request('/guest/submit',{
                    slug,answers
                }
                );
                present(data.attempt);
            }
            else{
                data=await request(mode==='member'?'/member/submit':'/submit',{
                    slug,answers,track:$('profile-class').value,branch:$('profile-branch').value
                }
                );
                present(data.participant||data);
            }
            try{
                sessionStorage.removeItem(key());
            }
            catch{
            }
        }
        catch(error){
            if(error.status===409&&error.data?.participant)present(error.data.participant);
            else notice('quiz-error',error.message);
        }
        finally{
            busy=false;
            $('btn-submit').disabled=false;
        }
    }
    ;
    $('challenge-start').onclick=()=>start();
    $('retry-challenge').onclick=()=>{
        try{
            sessionStorage.removeItem(key());
        }
        catch{
        }
        start(true);
    }
    ;
    $('save-result').onclick=async()=>{
        if(verified){
            $('password-modal').showModal();
            return;
        }
        if(!config.member){
            prepareIdentity();
            return;
        }
        if(busy)return;
        busy=true;
        $('save-result').disabled=true;
        try{
            let data;
            if(meta.funnel)data=await request(attempt?.fromAccount?'/member/reserve':'/guest/claim',{
                slug,occurrenceId:currentOccurrence()
            }
            );
            else data={
                reserved:false
            }
            ;
            notice('reservation-confirmation',data.reserved?'Ta séance est réservée : '+date(data.session.scheduled_at)+'. Retrouve-la dans ton calendrier.':data.message||'Ton résultat est enregistré. La prochaine date sera annoncée dans ton espace.');
            $('member-session-link').hidden=false;
            $('save-result').hidden=true;
        }
        catch(error){
            notice('experience-error',error.message);
        }
        finally{
            busy=false;
            $('save-result').disabled=false;
        }
    }
    ;
    $('identity-form').onsubmit=async event=>{
        event.preventDefault();
        if(verified){
            mode='verified';
            questions=(await request('/questions?slug='+encodeURIComponent(slug))).questions;
            show('quiz-panel');
            render();
            return;
        }
        const button=$('identity-submit');
        if(button.disabled)return;
        button.disabled=true;
        notice('identity-error','');
        try{
            await request('/register',{
                slug,full_name:$('full_name').value.trim(),email:$('email').value.trim(),phone:$('phone').value.trim(),track:$('profile-class').value,branch:$('profile-branch').value,occurrenceId:currentOccurrence()
            }
            );
            notice('identity-notice','Si cette adresse peut être utilisée, un lien de confirmation vient d’être envoyé. Ton résultat reste enregistré pendant la vérification. Tu as déjà un compte ? Connecte-toi avec cette adresse.');
        }
        catch(error){
            notice('identity-error',error.message);
        }
        finally{
            button.disabled=false;
        }
    }
    ;
    $('close-password').onclick=()=>$('password-modal').close();
    $('password-form').onsubmit=async event=>{
        event.preventDefault();
        const button=$('btn-confirm-password');
        if(button.disabled)return;
        if($('modal-password').value!==$('modal-password-confirm').value){
            notice('modal-error','Les deux mots de passe doivent être identiques.');
            return;
        }
        button.disabled=true;
        try{
            const saved=await request('/set-password',{password:$('modal-password').value});
            $('password-modal').close();
            notice('reservation-confirmation',saved.reserved?'Ton compte est prêt. Ta séance est réservée : '+date(saved.session.scheduled_at)+'.':'Ton compte et ton résultat sont enregistrés. Retrouve la suite dans ton tableau de bord.');
            $('save-result').hidden=true;$('member-session-link').hidden=false;
            setTimeout(()=>window.location.assign('/dashboard'),1800);
        }
        catch(error){
            notice('modal-error',error.message);
        }
        finally{
            button.disabled=false;
        }
    }
    ;
    async function boot(){
        try{
            meta=await request('/campaign?slug='+encodeURIComponent(slug));
            $('challenge-count').textContent=meta.count+' questions';
            $('challenge-duration').textContent='Environ '+meta.minutes+' minutes';
            $('campaign-target').textContent=[meta.campaign.subject,classNames[meta.campaign.target_class],meta.campaign.target_branch].filter(Boolean).join(' · ');
            $('challenge-start').textContent='Commencer le défi gratuit';
            $('challenge-start').disabled=config.preview||meta.count===0;
            $('guest-note').textContent=meta.funnel?'Essaie le défi, puis crée ton compte pour garder ton résultat.':'Confirme ton e-mail avant de commencer : le mode invité est en cours de préparation.';
            const select=$('occurrence-select');
            select.replaceChildren();
            for(const occurrence of meta.occurrences)select.add(new Option(date(occurrence.scheduled_at),occurrence.id));
            if(!select.options.length)select.add(new Option('Date bientôt annoncée',''));
            try{
                const saved=sessionStorage.getItem('synta-free-selection:'+meta.campaign.id)||sessionStorage.getItem('synta-free-selection:'+slug);
                if([...select.options].some(option=>option.value===saved))select.value=saved;
            }
            catch{
            }
            select.disabled=meta.occurrences.length<2;
            $('upcoming-date').textContent=meta.occurrences[0]?date(meta.occurrences[0].scheduled_at):'Date bientôt annoncée';
            select.onchange=()=>{
                $('upcoming-date').textContent=select.selectedOptions[0].textContent;
                try{
                    sessionStorage.setItem('synta-free-selection:'+meta.campaign.id,select.value);
                }
                catch{
                }
            }
            ;
            const params=new URLSearchParams(location.hash.slice(1)),proof=params.get('placement');
            if(proof)history.replaceState(null,'',location.pathname+location.search);
            if(proof||!config.member){
                try{
                    const data=await request(proof?'/verify':'/status',proof?{
                        token:proof
                    }
                    :null);
                    if(data.registration.slug&&data.registration.slug!==slug){
                        location.replace('/session/'+encodeURIComponent(data.registration.slug));
                        return;
                    }
                    verified=true;
                    mode='verified';
                    if(data.registration.completed){
                        present({
                            ...data.registration,total:data.registration.quiz_total
                        }
                        );
                    }
                    else{
                        prepareIdentity();
                        for(const id of ['full_name','email','phone']){
                            $(id).required=false;
                            $(id).closest('label').hidden=true;
                        }
                        $('identity-submit').textContent='Commencer le défi';
                    }
                    return;
                }
                catch(error){
                    if(proof)throw error;
                    if(![401,404].includes(error.status))throw error;
                }
            }
            if(!meta.funnel&&config.member){
                const data=await request('/member/status?slug='+encodeURIComponent(slug));
                if(data.participant)present(data.participant);
            }
            if(meta.funnel){
                try{
                    const data=await request('/guest/status?slug='+encodeURIComponent(slug));
                    attempt=data.attempt;
                    questions=data.questions;
                    if(attempt.submitted){
                        present(attempt);
                        if(config.member&&!attempt.claimed){
                            await $('save-result').onclick();
                            if($('save-result').hidden)setTimeout(()=>location.assign('/dashboard'),1800);
                        }
                    }
                    else{
                        restore();
                        if(Object.keys(answers).length){
                            show('quiz-panel');
                            render();
                        }
                    }
                }
                catch(error){
                    if(error.status!==401)throw error;
                    if(config.member){
                        const saved=await request('/member/result?slug='+encodeURIComponent(slug));
                        if(saved.attempt){
                            attempt=saved.attempt;
                            present(attempt);
                        }
                    }
                }
            }
        }
        catch(error){
            notice('experience-error',error.message);
            $('challenge-start').textContent='Réessayer';
            $('challenge-start').disabled=false;
            $('challenge-start').onclick=boot;
        }
    }
    boot();
}
);
