import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { compressionArgs, validateOutput, optimizeReplays, mediaTool, runMediaTool, probeMedia } from '../scripts/optimize-replays.js';
import { createReplayWatcher } from '../scripts/watch-replays.js';
import { readReplayProgress, createReplayProgressServer } from '../scripts/replay-progress.js';
import { withTimedOfferBrowser } from './timed-offer-browser.js';

test('local progress UI reads running and completed states without serving media',async()=>{
    const folder=await mkdtemp(join(tmpdir(),'synta-compression-ui-'));await mkdir(join(folder,'Compresses'));
    let server;
    try{
        await writeFile(join(folder,'surveillance.log'),'Compression : test.mp4 (101 Mo)…\n  20 %\n');
        assert.equal((await readReplayProgress(folder)).percent,20);
        const live=await createReplayProgressServer(folder,{token:'synthetic-progress'});server=live.server;
        assert.equal((await fetch(live.url+'/status')).status,200);
        assert.equal((await fetch(live.url+'/status',{method:'POST'})).status,405);
        assert.equal((await fetch(live.url+'/status',{headers:{Origin:'https://example.invalid'}})).status,403);
        assert.equal((await fetch(live.url+'/video.mp4')).status,404);
        const update=state=>writeFile(join(folder,'.progress-state.json'),JSON.stringify(state));
        await update({phase:'compressing',file:'<b>video</b>.mp4',percent:42,originalBytes:1000000});
        if(process.env.TIMED_QA_CHROME)await withTimedOfferBrowser(process.env.TIMED_QA_CHROME,new URL(live.url).origin,async({open,evaluate,until,errors,screenshot})=>{
            for(const width of [1440,390]){
                await open('/synthetic-progress','local',width);
                await until(()=>evaluate("document.getElementById('percent').textContent==='42 %'"),'live percentage');
                assert.equal(await evaluate("document.querySelector('#file b')"),null);
                assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
                if(process.env.REPLAY_PROGRESS_SCREENSHOTS)await screenshot(process.env.REPLAY_PROGRESS_SCREENSHOTS+'-'+width+'.png');
            }
            await update({phase:'verifying',file:'test.mp4',percent:100});
            await evaluate("document.getElementById('refresh').click()");
            await until(()=>evaluate("document.getElementById('badge').textContent.includes('Vérification')"),'verification distinct from finish');
            await update({phase:'complete',file:'test.mp4',result:{status:'optimized',originalBytes:1000000,optimizedBytes:400000,savedPercent:60}});
            await evaluate("document.getElementById('refresh').click()");
            await until(()=>evaluate("document.getElementById('panel').classList.contains('done')"),'finished state');
            assert.equal(await evaluate("document.getElementById('saved').textContent"),'60 %');assert.deepEqual(errors,[]);
        });
    }finally{if(server)await new Promise(resolve=>server.close(resolve));assert.equal(dirname(resolve(folder)),resolve(tmpdir()));await rm(folder,{recursive:true,force:true});}
});

test('watched folder waits for stable copies, ignores outputs and remembers completed files',async()=>{
    const folder=await mkdtemp(join(tmpdir(),'synta-compression-watch-'));
    let clock=0;const calls=[];
    const options={stableMs:1000,now:()=>clock,log:()=>{},processFile:async file=>{calls.push(file);return {files:[{status:'optimized'}]};}};
    try {
        const input=join(folder,'session.mp4');await writeFile(input,'copy in progress');
        const watcher=await createReplayWatcher(folder,options);
        await writeFile(join(watcher.output,'ignore.mp4'),'output');
        await watcher.scan();clock=500;await watcher.scan();assert.equal(calls.length,0);
        await writeFile(input,'finished copying a larger video');clock=1000;await watcher.scan();assert.equal(calls.length,0);
        clock=2000;await watcher.scan();await watcher.scan();assert.deepEqual(calls,[input]);
        const restarted=await createReplayWatcher(folder,options);await restarted.scan();assert.equal(calls.length,1);
        const next=join(folder,'next.mov');await writeFile(next,'next video');await restarted.scan();clock=3000;await restarted.scan();assert.deepEqual(calls,[input,next]);
    } finally {
        assert.equal(dirname(resolve(folder)),resolve(tmpdir()));
        await rm(folder,{recursive:true,force:true});
    }
});

test('compression settings are bounded, local, non-overwriting and preserve size/duration/audio requirements',()=>{
    const args=compressionArgs('input & strange.mp4','output.mp4');
    assert.ok(args.includes('-n'));assert.ok(args.includes('file,pipe'));assert.ok(args.includes('libx264'));
    assert.ok(!args.includes('-vf'));assert.ok(!args.includes('-r'));assert.ok(args.includes('+faststart'));
    for(const option of [{crf:45},{threads:0},{threads:100},{preset:'injected'}]) assert.throws(()=>compressionArgs('a','b',option));
    const source={duration:100,width:1920,height:1080,audioTracks:1,rotation:0};
    assert.doesNotThrow(()=>validateOutput(source,{...source,codec:'h264'}));
    for(const wrong of [{duration:95},{width:1280},{height:720},{audioTracks:0},{codec:'hevc'}])assert.throws(()=>validateOutput(source,{...source,codec:'h264',...wrong}));
});

test('real FFmpeg batch compresses synthetic media, rejects corruption and never overwrites originals', {
    skip:process.env.REPLAY_COMPRESSION_QA!=='true',timeout:120000,
},async t=>{
    const directory=await mkdtemp(join(tmpdir(),'synta-compression-'));
    const source=join(directory,'sources');await mkdir(source);
    try {
        const video=join(source,'séance & 100%.mp4');
        await runMediaTool(mediaTool('ffmpeg'),['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1920x1080:rate=15:duration=3',
            '-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-crf','0','-preset','ultrafast','-threads','2','-c:a','pcm_s16le','-f','mov',video]);
        const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
        const originalHash=await hash(video);
        const report=await optimizeReplays(source,{recursive:true,log:()=>{}});
        const result=report.files[0];assert.equal(result.status,'optimized',JSON.stringify(result));
        assert.ok(result.optimizedBytes<result.originalBytes);assert.equal(await hash(video),originalHash);
        const watchFolder=join(directory,'drop folder');await mkdir(watchFolder);
        const dropped=join(watchFolder,'dropped.mp4');await writeFile(dropped,await readFile(video));
        const watcher=await createReplayWatcher(watchFolder,{stableMs:0,log:()=>{}});
        await watcher.scan();await watcher.scan();
        const watched=join(watcher.output,'dropped.mp4.optimized.mp4');
        assert.ok((await readFile(watched)).length<result.originalBytes);
        assert.equal(await hash(dropped),originalHash);
        const before=await probeMedia(video),after=await probeMedia(result.output);validateOutput(before,after);
        assert.equal(after.width,1920);assert.equal(after.height,1080);assert.equal(after.audioTracks,1);
        const bytes=await readFile(result.output);assert.ok(bytes.indexOf('moov')<bytes.indexOf('mdat'),'MP4 metadata precedes video data');
        const repeated=await optimizeReplays(source,{recursive:true,log:()=>{}});assert.equal(repeated.files.length,1);
        assert.equal(repeated.files[0].status,'exists');assert.equal(await hash(result.output),result.outputSha256);
        await assert.rejects(optimizeReplays(source,{output:source,log:()=>{}}),/distinct/);
        const corrupt=join(source,'broken.mp4');await writeFile(corrupt,'not a recording');
        const failure=await optimizeReplays(corrupt,{log:()=>{}});assert.equal(failure.files[0].status,'failed');
        assert.equal(await readFile(corrupt,'utf8'),'not a recording');
        assert.ok(!(await readdir(join(source,'replay-output'))).some(name=>name.endsWith('.partial.mp4')));
        // A highly compressed input should be kept rather than replaced with a larger CRF-23 copy.
        const small=join(source,'already-small.mp4');
        await runMediaTool(mediaTool('ffmpeg'),['-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=15:duration=2','-c:v','libx264','-crf','45','-preset','slow','-threads','2',small]);
        const noGain=await optimizeReplays(small,{log:()=>{}});assert.equal(noGain.files[0].status,'keep_original');
        t.diagnostic(JSON.stringify({syntheticInputBytes:result.originalBytes,syntheticOutputBytes:result.optimizedBytes,savedPercent:result.savedPercent,
            sourceDurationSeconds:before.duration,outputDurationSeconds:after.duration,sourceResolution:[before.width,before.height],outputResolution:[after.width,after.height]}));
    } finally {
        assert.equal(dirname(resolve(directory)),resolve(tmpdir()),'cleanup remains inside the disposable temp root');
        assert.ok(directory.includes('synta-compression-'));
        await rm(directory,{recursive:true,force:true});
    }
});
