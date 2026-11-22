/* Native media controls enhanced without changing access URLs or page layout. */
window.enhanceLearningPlayer = function (video, { autoplay = false, storageKey = '' } = {}) {
    if (!(video instanceof HTMLVideoElement) || video.dataset.learningPlayer) return;
    video.dataset.learningPlayer = 'true'; video.playsInline = true;
    const wrapper = document.createElement('div'); wrapper.className = 'learning-player';
    video.before(wrapper); wrapper.append(video);
    const center = document.createElement('button'); center.type = 'button'; center.className = 'learning-player-start'; center.textContent = '▶'; center.setAttribute('aria-label','Lire la vidéo');
    const controls = document.createElement('div'); controls.className = 'learning-player-controls'; controls.setAttribute('role','group'); controls.setAttribute('aria-label','Commandes de la vidéo');
    const makeButton = (label,text,handler) => { const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label',label); button.title = label; button.textContent = text; button.addEventListener('click',handler); controls.append(button); return button; };
    const play = () => video.play().catch(()=>{ center.hidden = false; });
    const toggle = () => video.paused ? play() : video.pause();
    const playButton = makeButton('Lire','▶',toggle);
    makeButton('Reculer de 10 secondes','−10 s',()=>video.currentTime=Math.max(0,video.currentTime-10));
    makeButton('Avancer de 10 secondes','+10 s',()=>{if(Number.isFinite(video.duration))video.currentTime=Math.min(video.duration,video.currentTime+10);});
    const timeline = document.createElement('input'); timeline.type = 'range'; timeline.min = '0'; timeline.max = '100'; timeline.step = '.1'; timeline.value = '0'; timeline.setAttribute('aria-label','Position de lecture'); controls.append(timeline);
    const time = document.createElement('span'); time.className = 'learning-player-time'; controls.append(time);
    const format = seconds => { seconds = Math.max(0,Math.floor(seconds || 0)); return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'); };
    timeline.addEventListener('input',()=>{if(Number.isFinite(video.duration))video.currentTime=video.duration*Number(timeline.value)/100;});
    const speed = document.createElement('select'); speed.setAttribute('aria-label','Vitesse de lecture');
    for(const value of [.75,1,1.25,1.5,2])speed.add(new Option(value+'×',value));speed.value='1';speed.onchange=()=>video.playbackRate=Number(speed.value);controls.append(speed);
    const mute = makeButton('Couper le son','♪',()=>{video.muted=!video.muted;});
    const volume = document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.05';volume.value=String(video.volume);volume.className='learning-player-volume';volume.setAttribute('aria-label','Volume');volume.oninput=()=>{video.volume=Number(volume.value);video.muted=false;};controls.append(volume);
    makeButton('Plein écran','⛶',()=>{ if(document.fullscreenElement)document.exitFullscreen?.();else if(wrapper.requestFullscreen)wrapper.requestFullscreen().catch(()=>{});else video.webkitEnterFullscreen?.(); });
    center.onclick=toggle;wrapper.append(center,controls); video.controls=false;
    function sync() {
        const duration=Number.isFinite(video.duration)?video.duration:0;
        timeline.disabled=!duration;timeline.value=String(duration?100*video.currentTime/duration:0);
        time.textContent=format(video.currentTime)+' / '+format(duration);
        center.hidden=!video.paused;playButton.textContent=video.paused?'▶':'Ⅱ';playButton.setAttribute('aria-label',video.paused?'Lire':'Pause');
        mute.setAttribute('aria-label',video.muted?'Activer le son':'Couper le son');mute.setAttribute('aria-pressed',String(video.muted));
    }
    const owner = window.__SYNTA_PROFILE__?.id || 'anonymous';
    const key = storageKey ? 'synta:video:'+owner+':'+storageKey : '';
    let lastSaved = -1;
    function save() { const position=Math.floor(video.currentTime);if(!key||!Number.isFinite(position)||position===lastSaved)return;lastSaved=position;try{localStorage.setItem(key,String(video.ended?0:position));}catch{} }
    video.addEventListener('loadedmetadata',()=>{
        if(key)try{const position=Number(localStorage.getItem(key));if(position>0&&position<video.duration-3&&video.currentTime===0)video.currentTime=position;}catch{}
        sync(); if(autoplay)void play();
    });
    for(const event of ['play','pause','timeupdate','durationchange','volumechange','ended'])video.addEventListener(event,sync);
    video.addEventListener('timeupdate',()=>{if(Math.abs(video.currentTime-lastSaved)>=5)save();});
    video.addEventListener('pause',save);video.addEventListener('ended',save);
    sync();if(video.readyState>=1&&autoplay)void play();
    return wrapper;
};
