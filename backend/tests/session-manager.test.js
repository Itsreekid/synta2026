import {createSessionManagerFixture} from './fixtures/session-manager-fixture.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { withTimedOfferBrowser } from './timed-offer-browser.js';

test('recording recovery and accurate feature errors at mobile and desktop widths',{
    skip:!process.env.TIMED_QA_CHROME,timeout:60000,
},async()=>{
    const fixture=await createSessionManagerFixture();
    fixture.recordings.push({...fixture.recordings[1],id:'other-occurrence-file',zoom_meeting_uuid:'a-different-occurrence'});
    const trashed={...fixture.recordings[1],id:'trashed-file',delete_requested_at:new Date().toISOString()};fixture.recordings.push(trashed);
    try{
        await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+fixture.server.address().port,async({open,evaluate,until,errors})=>{
            for(const width of [360,390,1440]){
                trashed.delete_requested_at=new Date().toISOString();
                await open('/admin/pages/sessions.html','synthetic-admin',width);
                await until(()=>evaluate('allSessions.length===3'),'loaded');
                await evaluate(`openSessionManager('${fixture.emptyId}')`);
                await until(()=>evaluate("Boolean(document.querySelector('[data-recover]')) && !document.querySelector('[data-refresh]').disabled"),'recovery ready');
                await evaluate("document.querySelector('[data-recover]').click()");
                await until(()=>evaluate("Boolean(document.querySelector('[data-results] input'))"),'historical metadata');
                assert.ok(await evaluate("document.querySelector('.session-manager').getBoundingClientRect().right<=innerWidth"));
                assert.ok(await evaluate("document.querySelector('.session-manager-body').scrollWidth<=document.querySelector('.session-manager-body').clientWidth+1"),'recovery panel must not scroll horizontally');
                await evaluate("document.querySelector('[data-results] input').checked=true;document.querySelector('[data-recovery] .btn-primary').click()");
                await until(()=>evaluate("document.querySelector('[data-recovery] [role=status]').textContent.includes('ajouté')"),'import selected');
                await evaluate(`openSessionManager('${fixture.multiId}')`);
                await until(()=>evaluate("!document.querySelector('[data-refresh]').disabled"),'segments refreshed');
                await evaluate("(()=>{const checks=[...document.querySelectorAll('.recording-pick')];checks[0].checked=true;checks[0].dispatchEvent(new Event('change'));const other=checks.find(input=>input.value==='other-occurrence-file');other.checked=true;other.dispatchEvent(new Event('change'));})()");
                assert.equal(await evaluate("document.querySelectorAll('.recording-pick:checked').length"),1,'UI prevents mixed-occurrence selection');
                await evaluate("document.querySelector('[data-trash]').click()");
                await until(()=>evaluate("Boolean(document.querySelector('[data-trash-list] button'))"),'trash loaded');
                await evaluate("document.querySelector('[data-trash-list] button').click()");
                await until(()=>evaluate("document.querySelector('.session-manager-notice').textContent.includes('restauré')"),'trash restored');
                const searches=fixture.calls.filter(call=>call.path==='/live/admin/recordings/discover').length;
                await evaluate("document.querySelector('[data-refresh]').click()");
                await until(()=>evaluate("!document.querySelector('[data-refresh]').disabled"),'local refresh');
                assert.equal(fixture.calls.filter(call=>call.path==='/live/admin/recordings/discover').length,searches,'Actualiser never calls Zoom discovery');
                fixture.setFeaturesFailure(true);
                await open('/admin/pages/sessions.html','synthetic-admin',width);
                await until(()=>evaluate('allSessions.length===3'),'loaded with failed features');
                await evaluate(`openSessionManager('${fixture.emptyId}')`);
                await until(()=>evaluate("document.getElementById('manager-replays').textContent.includes('erreur API ou réseau')"),'accurate network error');
                assert.equal(await evaluate("document.getElementById('manager-replays').textContent.includes('Migration')"),false);
                fixture.setFeaturesFailure(false);fixture.setImportStatus('disabled');
                await open('/admin/pages/sessions.html','synthetic-admin',width);
                await until(()=>evaluate('allSessions.length===3'),'disabled loaded');
                await evaluate(`openSessionManager('${fixture.emptyId}')`);
                await until(()=>evaluate("document.getElementById('manager-replays').textContent.includes('désactivés')"),'disabled imports message');
                assert.equal(await evaluate("Boolean(document.querySelector('[data-recover]'))"),false);
                fixture.setImportStatus('ready');
            }
            assert.equal(fixture.calls.filter(call=>call.path==='/live/admin/recordings/recover').length,3);
            // The deliberately failed readiness fetch is an expected network error.
            assert.deepEqual(errors.filter(error=>!String(error).includes('503')&&!String(error).includes('Failed to load resource')),[]);
        });
    }finally{await new Promise(resolve=>fixture.server.close(resolve));}
});

test('session management dialog uses existing replay and resource actions on desktop and phones', {
    skip: !process.env.TIMED_QA_CHROME, timeout: 60000,
}, async () => {
    const fixture=await createSessionManagerFixture();
    const {server,calls,multiId,emptyId,singleId}=fixture;
    try {
        await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,'http://127.0.0.1:'+server.address().port,async({open,evaluate,until,errors,screenshot,pressKey})=>{
            for(const width of [1440,360,390]) {
                await open('/admin/pages/sessions.html','synthetic-admin',width);
                await until(()=>evaluate('allSessions.length===3 && allCourses.length===1'),'sessions loaded');
                assert.equal(await evaluate("document.querySelectorAll('.session-card .recording-pick').length"),0);
                assert.equal(await evaluate("document.querySelectorAll('.session-card [data-delete-session]').length"),3);
                assert.equal(await evaluate("document.querySelector('[data-manage-session]').textContent.trim()"),'');
                assert.equal(await evaluate("document.querySelector('.session-card .btn-host').getAttribute('aria-label')"),'Lancer (Hôte)');
                await evaluate(`document.querySelector('#card-${emptyId} [data-manage-session]').click()`);
                await until(()=>evaluate("document.querySelector('.session-manager-notice').textContent===''") ,'manager loaded');
                assert.match(await evaluate("document.getElementById('manager-replays').textContent"),/Aucun replay publié/);
                assert.equal(await evaluate("document.querySelector('.session-manager').getBoundingClientRect().right<=innerWidth"),true);
                assert.equal(await evaluate("document.querySelector('.session-manager').getBoundingClientRect().height<=innerHeight"),true);
                await evaluate("document.querySelector('[data-tab=details]').click()");
                assert.match(await evaluate("document.getElementById('manager-details').textContent"),/Python.*Zoom Meeting ID/s);
                assert.ok(await evaluate("document.querySelector('#manager-details a').getAttribute('href').endsWith('/host')"));
                await evaluate("document.querySelector('.session-manager-close').focus()");
                await pressKey('Escape',27);
                await until(()=>evaluate("!document.querySelector('.session-manager').open"),'Escape closes dialog');
                await until(()=>evaluate("document.activeElement.hasAttribute('data-manage-session')"),'focus returns to session card');
                await evaluate(`openSessionManager('${singleId}')`);
                await until(()=>evaluate("document.querySelector('.session-manager-notice').textContent===''") ,'single import loaded');
                assert.match(await evaluate("document.getElementById('manager-replays').textContent"),/Zoom → R2.*Partie 1/s);
                assert.match(await evaluate("document.getElementById('manager-replays').textContent"),/30 min/);
                if(process.env.SESSION_MANAGER_SCREENSHOTS) await screenshot(process.env.SESSION_MANAGER_SCREENSHOTS+'-'+width+'.png');
                await evaluate("document.querySelector('.session-manager').close()");
            }
            await evaluate(`openSessionManager('${multiId}')`);
            await until(()=>evaluate("document.querySelector('[data-refresh]').disabled===false"),'multi session loaded');
            await until(()=>evaluate("document.querySelectorAll('#manager-replays .recording-pick').length===2"),'review segments');
            assert.equal(await evaluate("document.querySelector('#session-manager-title b')===null"),true);
            assert.match(await evaluate("document.getElementById('manager-replays').textContent"),/À vérifier.*Échec.*En attente.*Import en cours/s);
            await evaluate("document.querySelector('#manager-replays input[type=search]').value='Échec';document.querySelector('#manager-replays input[type=search]').dispatchEvent(new Event('input'))");
            assert.equal(await evaluate("document.querySelectorAll('#manager-replays [data-search-row]:not([hidden])').length"),1);
            await evaluate("document.querySelector('#manager-replays input[type=search]').value='';document.querySelector('#manager-replays input[type=search]').dispatchEvent(new Event('input'));document.querySelectorAll('#manager-replays .recording-pick').forEach(input=>input.checked=true);document.querySelector('[data-publish]').click()");
            await until(()=>evaluate("document.getElementById('manager-replays').textContent.includes('Partie 2')"),'published selection');
            assert.equal(calls.filter(call=>call.path==='/live/admin/recordings/publish').at(-1).body.importIds.length,2);
            await evaluate("document.querySelectorAll('#manager-replays .recording-pick').forEach(input=>input.checked=true);window.confirm=()=>false;document.querySelector('[data-publish]').click()");
            assert.equal(calls.filter(call=>call.path==='/live/admin/recordings/publish').length,1,'replacement cancelled');
            await evaluate("window.confirm=()=>true;[...document.querySelectorAll('#manager-replays button')].find(button=>button.textContent==='Réessayer').click()");
            await until(()=>evaluate("!document.querySelector('#manager-replays [data-state=failed]')"),'retry import');
            await evaluate("document.querySelector('[data-tab=resources]').click()");
            assert.match(await evaluate("document.getElementById('manager-resources').textContent"),/Ajouter des fichiers \(1\)/);
            assert.equal(await evaluate("document.querySelector('#manager-resources strong b')===null"),true);
            await evaluate("document.querySelector('#manager-resources [data-remove]').click()");
            await until(()=>evaluate("document.getElementById('manager-resources').textContent.includes('Ajouter des fichiers (0)')"),'resource removed');
            // Browser File APIs exercise the existing upload handlers without an OS file chooser.
            await evaluate(`(() => { const original=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type!=='file')return original.call(this);const dt=new DataTransfer();dt.items.add(new File(['synthetic'],this.accept.includes('video/')?'replay.mp4':'exercice.py',{type:this.accept.includes('video/')?'video/mp4':'text/plain'}));this.files=dt.files;this.dispatchEvent(new Event('change'));};})()`);
            await evaluate("document.querySelector('#manager-resources [data-add]').click()");
            await until(()=>evaluate("document.getElementById('manager-resources').textContent.includes('Ajouter des fichiers (1)')"),'resource upload');
            await evaluate("document.querySelector('[data-tab=replays]').click();document.querySelector('[data-upload]').click()");
            await until(()=>evaluate("document.getElementById('manager-replays').textContent.includes('Vidéo téléversée')"),'manual MP4 upload');
            assert.ok(calls.some(call=>call.path===`/live/${multiId}/replay-upload-url` && call.body.contentType==='video/mp4'));
            await evaluate("document.querySelector('[data-external]').click();document.getElementById('session-replay-link').value='https://drive.google.com/file/d/synthetic/view';document.querySelector('[data-link-form]').requestSubmit()");
            await until(()=>evaluate("document.getElementById('manager-replays').textContent.includes('Replay publié · Lien externe')"),'external replay saved');
            assert.ok(calls.some(call=>call.path===`/live/${multiId}/replay` && call.body.replayUrl?.includes('drive.google.com')));
            if(process.env.SESSION_MANAGER_SCREENSHOTS) await screenshot(process.env.SESSION_MANAGER_SCREENSHOTS+'-390.png');
            fixture.setRecordingsFailure(true);
            await evaluate("document.querySelector('[data-refresh]').click()");
            await until(()=>evaluate("document.querySelector('.session-manager-notice').textContent.includes('Impossible')"),'recording load error');
            fixture.setRecordingsFailure(false);
            await evaluate("document.querySelector('[data-refresh]').click()");
            await until(()=>evaluate("document.querySelector('.session-manager-notice').textContent===''") ,'recordings recovered');
            await evaluate("document.querySelector('.session-manager').close()");
            await evaluate("window.confirm=message=>{window.lastConfirmation=message;return true;}");
            await evaluate(`document.querySelector('#card-${emptyId} [data-delete-session]').click()`);
            await until(()=>evaluate(`!document.getElementById('card-${emptyId}')`),'completed session removed without opening manager');
            assert.ok(calls.some(call=>call.path===`/live/${emptyId}` && call.method==='DELETE'));
            assert.match(await evaluate('window.lastConfirmation'),/replay.*Drive et R2/s);
            for(const width of [1440,360,390]) {
                // Exercise both historical source modes using the actual admin form.
                await open('/admin/pages/sessions.html','synthetic-admin',width);
                await until(()=>evaluate('allCourses.length===1'),'historical courses loaded');
                await evaluate('openHistoricalReplay()');
                await evaluate("document.getElementById('history-title').value='Ancienne séance';document.getElementById('history-date').value='2025-10-12T20:00';document.getElementById('history-course').selectedIndex=1;document.getElementById('history-link').value='https://drive.google.com/file/d/old/view';document.querySelector('.historical-replay form').requestSubmit()");
                await until(()=>evaluate("!document.querySelector('.historical-replay').open"),'historical Drive saved');
                const entry=calls.filter(call=>call.path==='/live/replays').at(-1);
                assert.equal(entry.body.startTime,'2025-10-12T20:00:00+01:00');
                await evaluate(`openSessionManager('${entry.body.id}')`);
                await until(()=>evaluate("document.querySelector('[data-refresh]').disabled===false"),'historical manager loaded');
                await evaluate("document.querySelector('[data-tab=details]').click();document.querySelector('[data-edit-details]').click();document.getElementById('session-edit-title').value='Titre corrigé';document.getElementById('session-edit-date').value='2025-10-11T19:30';document.getElementById('session-edit-description').value='<b>Texte seulement</b>';document.querySelector('.session-details-form').requestSubmit()");
                await until(()=>evaluate("document.querySelector('#session-manager-title').textContent==='Titre corrigé'"),'metadata saved');
                assert.equal(await evaluate("document.querySelector('#manager-details b')"),null);
                assert.match(await evaluate("document.querySelector('#manager-details').textContent"),/19:30/);
                await evaluate("document.querySelector('.session-manager').close()");
                await evaluate('openHistoricalReplay()');
                assert.equal(await evaluate("document.querySelector('.historical-replay').getBoundingClientRect().right<=innerWidth"),true);
                await until(()=>evaluate("getComputedStyle(document.querySelector('.historical-replay')).opacity==='1'"),'historical dialog animation complete');
                assert.equal(await evaluate("document.querySelector('.historical-replay [type=submit]').getBoundingClientRect().bottom<=innerHeight"),true);
                if(process.env.HISTORICAL_REPLAY_SCREENSHOTS)await screenshot(process.env.HISTORICAL_REPLAY_SCREENSHOTS+'-'+width+'.png');
                await evaluate("(()=>{document.getElementById('history-title').value='Ancienne vidéo';document.getElementById('history-date').value='2025-10-13T20:00';document.getElementById('history-course').selectedIndex=1;document.getElementById('history-source').value='upload';document.getElementById('history-source').dispatchEvent(new Event('change'));const dt=new DataTransfer();dt.items.add(new File(['synthetic'],'old.mp4',{type:'video/mp4'}));document.getElementById('history-video').files=dt.files;const files=new DataTransfer();files.items.add(new File(['print(1)'],'old.py'));document.getElementById('history-files').files=files.files;document.querySelector('.historical-replay form').requestSubmit();})()");
                await until(()=>evaluate("!document.querySelector('.historical-replay').open"),'historical upload and resource saved');
                assert.ok(calls.some(call=>call.path==='/admin/resources' && call.body.fileName==='old.py'));
            }
            assert.deepEqual(errors,[]);
        });
    } finally {await new Promise(resolve=>server.close(resolve));}
});
