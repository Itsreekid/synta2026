/* Optional verification: current signed-in account only; no email/user ID in requests. */
document.addEventListener('DOMContentLoaded',async()=>{
    const panel=document.getElementById('email-verification-reminder');
    if(!panel)return;
    const button=document.getElementById('send-email-verification');
    const feedback=document.getElementById('email-verification-feedback');
    try{
        const response=await fetch('/api/auth/verification/status',{credentials:'include',cache:'no-store'});
        if(!response.ok)return;
        panel.hidden=(await response.json()).emailVerified!==false;
    }catch{return;}
    button.addEventListener('click',async()=>{
        if(button.disabled)return;
        button.disabled=true;
        feedback.textContent='Envoi du lien…';
        try{
            const response=await fetch('/api/auth/verification/reminder',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});
            const data=await response.json().catch(()=>null);
            if(!response.ok)throw new Error(data?.error||'Envoi indisponible. Réessaie plus tard.');
            feedback.textContent=data.alreadyVerified?'Ton adresse e-mail est déjà confirmée.':'Consulte ta boîte mail et clique sur le lien de confirmation. Pense à vérifier les spams.';
            button.textContent=data.alreadyVerified?'E-mail confirmé':'Lien envoyé';
        }catch(error){feedback.textContent=error.message;button.disabled=false;}
    });
});
