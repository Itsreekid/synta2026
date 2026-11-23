import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { withTimedOfferBrowser } from './timed-offer-browser.js';

test('Video.js mobile gestures, speeds, captions and simulated fullscreen/orientation lifecycle', {
    skip: !process.env.TIMED_QA_CHROME, timeout: 120000,
}, async () => {
    const app=express();let blockVendor=false;
    app.use('/vendor',(_req,res,next)=>blockVendor ? res.sendStatus(503) : next());
    app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
    app.get('/mobile-player',(_req,res)=>res.send(`<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/vendor/videojs/10.6.0/global.css"><link rel="stylesheet" href="/css/learning-player.css"><style>body{margin:0;padding:8px;background:#f5f8fc}.frame{position:relative;aspect-ratio:16/9;width:100%}</style><div class="frame"><video id="media" playsinline></video></div><script src="/js/learning-player.js"></script>`));
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    try {
        await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,errors,command,screenshot,pressKey})=>{
            for(const width of [320,375,390,430,768,1440]) {
                await open('/mobile-player','synthetic',width);
                await command('Emulation.setTouchEmulationEnabled',{enabled:width<1000,maxTouchPoints:1});
                await evaluate(`(()=>{
                    window.__SYNTA_PROFILE__={id:'qa'};window.qa={position:40,paused:true,locks:[],unlocks:0,plays:0};
                    const v=document.querySelector('video');
                    Object.defineProperties(v,{duration:{get:()=>120},readyState:{get:()=>4},currentTime:{get:()=>qa.position,set:n=>{qa.position=n;v.dispatchEvent(new Event('timeupdate'));}},paused:{get:()=>qa.paused},seekable:{get:()=>({length:1,start:()=>0,end:()=>120})}});
                    v.play=async()=>{qa.plays++;qa.paused=false;v.dispatchEvent(new Event('play'));v.dispatchEvent(new Event('playing'));};
                    v.pause=()=>{qa.paused=true;v.dispatchEvent(new Event('pause'));};
                    Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async type=>{qa.locks.push(type);}});
                    Object.defineProperty(screen.orientation,'unlock',{configurable:true,value:()=>{qa.unlocks++;}});
                    // Headless Chrome rejects real fullscreen even for a plain native element.
                    // Simulate the browser presentation API to test Video.js and orientation lifecycle only.
                    Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>qa.fullscreen || null});
                    Element.prototype.requestFullscreen=async function(){qa.fullscreen=this;document.dispatchEvent(new Event('fullscreenchange'));};
                    document.exitFullscreen=async()=>{qa.fullscreen=null;document.dispatchEvent(new Event('fullscreenchange'));};
                    localStorage.setItem('synta:video:qa:resume','25');qa.position=0;
                    enhanceLearningPlayer(v,{storageKey:'resume'});v.dispatchEvent(new Event('loadedmetadata'));
                    window.root=()=>document.querySelector('video-skin').shadowRoot;
                })()`);
                await until(()=>evaluate('document.querySelector("video").dataset.learningPlayer==="ready"'),'Video.js ready');
                assert.equal(await evaluate('document.querySelector("video").currentTime'),25,'device resume retained');
                assert.deepEqual(await evaluate('String(document.querySelector("video-player").defaultPlaybackRates).split(" ").map(Number)'),[.75,1,1.25,1.5,1.75,2]);
                await evaluate('root().querySelector(".video-controls-center-play").click()');
                await until(()=>evaluate('qa.plays===1'),'library play control');
                assert.equal(await evaluate('root().querySelector(".video-controls-center-play").getBoundingClientRect().width>=44'),true,'touch Play/Pause target');
                assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
                assert.equal(await evaluate('root().querySelector("media-container").getBoundingClientRect().right<=innerWidth'),true);
                // Exercise the actual generated rate menu items, not direct assignment to playbackRate.
                await until(()=>evaluate('root().querySelector("media-playback-rate-radio-group")?.querySelectorAll("media-menu-radio-item").length===6'),'speed items');
                await evaluate('root().querySelector(".video-controls-settings-button").click()');
                await evaluate(`Array.from(root().querySelectorAll('media-menu-item')).find(item=>item.querySelector('media-text[token="menu.speed"]')).click()`);
                await until(()=>evaluate('root().querySelector("media-playback-rate-radio-group").closest("media-menu-content").hasAttribute("data-open")'),'speed submenu opens');
                await evaluate('Array.from(root().querySelector("media-playback-rate-radio-group").querySelectorAll("media-menu-radio-item")).find(el=>el.textContent.trim()==="1.75×" || el.textContent.trim()==="1.75x" || el.textContent.trim()==="1.75").click()');
                assert.equal(await evaluate('document.querySelector("video").playbackRate'),1.75);
                await evaluate('root().querySelector(".video-controls-settings-button").click()');
                await until(()=>evaluate('!Array.from(root().querySelectorAll("media-menu-content")).some(el=>el.hasAttribute("data-open"))'),'settings close');
                await evaluate('Array.from(root().querySelectorAll("media-seek-button")).find(el=>el.getAttribute("seconds")==="10").click()');
                assert.equal(await evaluate('qa.position'),35);
                await evaluate('Array.from(root().querySelectorAll("media-seek-button")).find(el=>el.getAttribute("seconds")==="-10").click()');
                assert.equal(await evaluate('qa.position'),25);
                if(process.env.PLAYER_QA_SCREENSHOTS)await screenshot(process.env.PLAYER_QA_SCREENSHOTS+'-playing-'+width+'.png');
                const box=await evaluate('root().querySelector("media-container").getBoundingClientRect().toJSON()');
                await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
                const tap=async(x,y)=>{await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
                const doubleTap=async x=>{await tap(x,box.y+box.height*.5);await new Promise(r=>setTimeout(r,70));await tap(x,box.y+box.height*.5);await new Promise(r=>setTimeout(r,400));};
                await evaluate('root().activeElement?.blur();document.activeElement?.blur()');
                await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:box.bottom+100});
                await until(()=>evaluate('!root().querySelector("media-container").hasAttribute("data-controls-visible")'),'controls hide after inactivity');
                await tap(box.x+box.width*.97,box.y+box.height*.5);
                await until(()=>evaluate('root().querySelector("media-container").hasAttribute("data-controls-visible")'),'single tap reveals controls');
                await new Promise(r=>setTimeout(r,400));
                await doubleTap(box.x+box.width*.97);
                assert.equal(await evaluate('qa.position'),35,'right double tap seeks 10 seconds');
                await doubleTap(box.x+box.width*.03);
                assert.equal(await evaluate('qa.position'),25,'left double tap seeks back');
                await evaluate('document.querySelector("video").pause()');
                assert.equal(await evaluate('localStorage.getItem("synta:video:qa:resume")'),'25');
                await evaluate('root().querySelector("media-fullscreen-button").focus()');
                await pressKey('Enter',13);
                await until(()=>evaluate('!!document.fullscreenElement'),'fullscreen entry');
                assert.deepEqual(await evaluate('qa.locks'),['landscape']);
                await evaluate('root().querySelector("media-fullscreen-button").click()');
                await until(()=>evaluate('!document.fullscreenElement && qa.unlocks>0'),'fullscreen exit and unlock');
                assert.equal(await evaluate('getComputedStyle(document.body).transform'),'none','page never CSS-rotates');
                // Rejected orientation locks must not prevent fullscreen or a reliable exit.
                await evaluate('Object.defineProperty(screen.orientation,"lock",{configurable:true,value:async()=>{throw new DOMException("Unsupported","NotSupportedError");}})');
                await command('Runtime.evaluate',{expression:'root().querySelector("media-fullscreen-button").click()',userGesture:true});
                await until(()=>evaluate('!!document.fullscreenElement'),'fullscreen despite rejected lock');
                await evaluate('document.exitFullscreen()');
                await until(()=>evaluate('!document.fullscreenElement'),'exit after rejected lock');
                assert.equal(await evaluate('(()=>{const b=root().querySelector(".video-controls-settings-button"),r=b.getBoundingClientRect();return r.width>=(innerWidth<1000?44:32) && r.left>=0 && r.right<=innerWidth;})()'),true,'settings remain touch-accessible within viewport');
                if(process.env.PLAYER_QA_SCREENSHOTS)await screenshot(process.env.PLAYER_QA_SCREENSHOTS+'-controls-'+width+'.png');
                // Existing native caption tracks remain available to Video.js.
                await evaluate('const track=document.querySelector("video").addTextTrack("captions","Français","fr");track.addCue(new VTTCue(0,100,"Variables et valeurs"));track.mode="hidden"');
                await until(()=>evaluate('root().querySelector("media-captions-button").getAttribute("data-availability")==="available"'),'caption controls available');
                await evaluate('root().querySelector("media-captions-button").click()');
                await until(()=>evaluate('document.querySelector("video").textTracks[0].mode==="showing"'),'caption track selected by player');
                await evaluate('document.querySelector(".learning-player").remove()');
                await new Promise(r=>setTimeout(r,30));
                assert.equal(await evaluate('document.querySelector("video-player")'),null,'player scope removed');
                if(width===375) {
                    // Simulate Safari's native presentation API; this is not a physical iPhone test.
                    await evaluate(`(()=>{
                        Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});
                        Object.defineProperty(document,'webkitFullscreenEnabled',{configurable:true,value:false});
                        Object.defineProperty(screen.orientation,'lock',{configurable:true,value:undefined});
                        HTMLVideoElement.prototype.webkitSetPresentationMode=function(mode){this.webkitPresentationMode=mode;this.dispatchEvent(new Event('webkitpresentationmodechanged'));};
                        const v=document.createElement('video');v.webkitPresentationMode='inline';document.querySelector('.frame').append(v);enhanceLearningPlayer(v);
                    })()`);
                    await until(()=>evaluate('document.querySelector("video").dataset.learningPlayer==="ready"'),'native presentation fallback player');
                    await evaluate('root().querySelector("media-fullscreen-button").click()');
                    await until(()=>evaluate('document.querySelector("video").webkitPresentationMode==="fullscreen"'),'simulated iOS entry');
                    await evaluate('root().querySelector("media-fullscreen-button").click()');
                    await until(()=>evaluate('document.querySelector("video").webkitPresentationMode==="inline"'),'simulated iOS exit');
                    assert.equal(await evaluate('getComputedStyle(document.body).transform'),'none');
                }
                await command('Emulation.setTouchEmulationEnabled',{enabled:false});
            }
            assert.deepEqual(errors,[]);
        });
        blockVendor=true;
        await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,errors})=>{
            await open('/mobile-player','synthetic',375);
            await evaluate('enhanceLearningPlayer(document.querySelector("video"))');
            await until(()=>evaluate('document.querySelector("video").dataset.learningPlayer==="fallback"'),'library failure fallback');
            assert.equal(await evaluate('document.querySelector("video").controls'),true);
            assert.deepEqual(errors,[]);
        });
    } finally {await new Promise(resolve=>server.close(resolve));}
});
