// Launcher for the local folder watcher + browser monitor. Never imported by server.js.
import { mkdir, readFile } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openReplayProgress } from './replay-progress.js';

const folder=fileURLToPath(new URL('../../Replays Zoom/',import.meta.url));
await mkdir(join(folder,'Compresses'),{recursive:true});
let running=false;
try{const pid=Number(await readFile(join(folder,'.watcher.lock'),'utf8'));if(Number.isInteger(pid)&&pid>0){try{process.kill(pid,0);running=true;}catch(error){running=error.code==='EPERM';}}}catch{}
if(!running){
    const out=openSync(join(folder,'surveillance.log'),'a'),errors=openSync(join(folder,'erreurs.log'),'a');
    try{const child=spawn(process.execPath,[fileURLToPath(new URL('./watch-replays.js',import.meta.url))],{detached:true,windowsHide:true,stdio:['ignore',out,errors]});child.on('error',error=>console.error(error.message));child.unref();}
    finally{closeSync(out);closeSync(errors);}
}
await openReplayProgress();
