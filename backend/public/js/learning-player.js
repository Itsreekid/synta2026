/* Video.js 10 adapter: preserve the native media element and existing API listeners. */
(function () {
    const BASE = '/vendor/videojs/10.6.0/';
    let library;
    const load = () => library ||= import(BASE+'locales/fr.js').then(()=>Promise.all([import(BASE+'video.js'),import(BASE+'orientation-support.js')]));
    window.enhanceLearningPlayer = function (video, { autoplay = false, storageKey = '' } = {}) {
        if (!(video instanceof HTMLVideoElement) || video.dataset.learningPlayer) return;
        // No native controls while the Video.js skin loads (avoids a flash of the browser's controls);
        // they come back only if the skin fails or takes unusually long.
        video.dataset.learningPlayer='loading';video.playsInline=true;video.controls=false;video.removeAttribute('controls');
        const slowSkin=setTimeout(()=>{if(video.dataset.learningPlayer==='loading')video.controls=true;},8000);
        const wrapper=document.createElement('div');wrapper.className='learning-player';video.before(wrapper);wrapper.append(video);
        const owner=window.__SYNTA_PROFILE__?.id || 'anonymous';
        const key=storageKey ? 'synta:video:'+owner+':'+storageKey : '';
        let lastSaved=-1;
        function save(){const position=Math.floor(video.currentTime);if(!key||!Number.isFinite(position)||position===lastSaved)return;lastSaved=position;try{localStorage.setItem(key,String(video.ended?0:position));}catch{}}
        const play=()=>video.play().catch(()=>{});
        video.addEventListener('loadedmetadata',()=>{
            if(key)try{const position=Number(localStorage.getItem(key));if(position>0&&position<video.duration-3&&video.currentTime===0)video.currentTime=position;}catch{}
            if(autoplay)void play();
        });
        video.addEventListener('timeupdate',()=>{if(Math.abs(video.currentTime-lastSaved)>=5)save();});
        video.addEventListener('pause',save);video.addEventListener('ended',save);
        load().then(([, { createScreenOrientationLock }])=>{
            if(!video.isConnected)return;
            const player=document.createElement('video-player');player.lang='fr';player.setAttribute('default-playback-rates','0.75 1 1.25 1.5 1.75 2');
            const locale=document.createElement('media-i18n');locale.lang='fr';
            const skin=document.createElement('video-skin');skin.className='synta-video-skin';
            // Move, never replace, the video: lesson progress, resources, quiz and signed-link recovery keep their listeners.
            const position=video.currentTime || Number(video.dataset.resumePosition) || 0;
            const rate=video.playbackRate;
            const keepPlaying=!video.paused || autoplay;
            // Safari can reload media when a video is reparented; preserve the source's current state.
            video.addEventListener('loadedmetadata',()=>{
                if(position>0 && position<video.duration)video.currentTime=position;
                video.playbackRate=rate;
                if(keepPlaying)void play();
            },{once:true});
            wrapper.append(locale);locale.append(player);player.append(skin);
            if(typeof skin.moveBefore==='function')skin.moveBefore(video,null);else skin.append(video);
            clearTimeout(slowSkin);video.controls=false;video.dataset.learningPlayer='ready';
            // The library attaches its native adapter asynchronously after custom-element connection.
            // Restore after that first attachment as well as after a reparent-triggered metadata load.
            requestAnimationFrame(()=>{
                if(video.isConnected && position>0 && position<video.duration && video.paused)video.currentTime=position;
                if(video.isConnected)video.playbackRate=rate;
            });
            // Narrow overrides for the pinned stock skin; all behavior remains Video.js-owned.
            const mobileStyle=document.createElement('style');
            // Controls shade only the bottom ~24% so slide content stays readable; no top shade.
            mobileStyle.textContent=`.media-skin.media-skin{--media-controls-bottom-gradient-height:24%;--media-controls-gradient:linear-gradient(to top,#000000b3,#00000059 55%,transparent);--media-controls-top-gradient:none}
            media-tooltip.synta-hidden-tooltip{display:none!important}
            @media(max-width:600px){
                media-volume-popover,media-mute-button,media-pip-button,media-cast-button,media-airplay-button{display:none!important}
                [data-controls-visible] .video-controls-center{opacity:1!important;visibility:visible!important}
                [data-controls-visible] .video-controls-center-play{opacity:1!important;min-width:56px!important;min-height:56px!important}
                .video-controls-compact-primary>media-play-button{display:none!important}
            }`;
            skin.shadowRoot.append(mobileStyle);
            // The play button's floating "Lecture K" chip covered the slide; the same hint now lives
            // in the button's native tooltip. Other buttons keep their tooltips.
            const movePlayHint=()=>{
                for(const button of skin.shadowRoot.querySelectorAll('media-play-button')){
                    button.title='Lecture / Pause (K ou Espace)';
                    const id=button.id||button.getAttribute('aria-describedby');
                    if(id)for(const tip of skin.shadowRoot.querySelectorAll('media-tooltip'))if(tip.getAttribute('trigger')===id)tip.classList.add('synta-hidden-tooltip');
                }
            };
            movePlayHint();requestAnimationFrame(movePlayHint);
            const lock=createScreenOrientationLock(), controller=new AbortController();
            function syncFullscreen(){
                const fullscreen=document.fullscreenElement || document.webkitFullscreenElement;
                const active=Boolean(fullscreen && (wrapper.contains(fullscreen) || skin.shadowRoot.contains(fullscreen) || fullscreen.contains(video))) || Boolean(video.webkitDisplayingFullscreen) || video.webkitPresentationMode==='fullscreen';
                wrapper.classList.toggle('is-fullscreen',active);
                if(active)void lock.lock('landscape');else lock.unlock();
            }
            for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,syncFullscreen,{signal:controller.signal});
            for(const event of ['webkitbeginfullscreen','webkitendfullscreen','webkitpresentationmodechanged'])video.addEventListener(event,syncFullscreen,{signal:controller.signal});
            // Video.js custom elements release their store/listeners when disconnected.
            const observer=new MutationObserver(()=>{if(!wrapper.isConnected){save();controller.abort();lock.unlock();observer.disconnect();}});
            observer.observe(document.body,{childList:true,subtree:true});
            if(video.readyState>=1&&autoplay)void play();
        }).catch(()=>{clearTimeout(slowSkin);video.controls=true;video.dataset.learningPlayer='fallback';if(video.readyState>=1&&autoplay)void play();});
        return wrapper;
    };
})();
