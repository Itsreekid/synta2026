// Local folder watcher only. Not imported or started by the website.
import { mkdir, readdir, stat, readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { optimizeReplays, mediaTool, runMediaTool } from './optimize-replays.js';

export async function createReplayWatcher(folder, { stableMs=30000, now=Date.now, processFile=optimizeReplays, log=console.log }={}) {
    const root=resolve(folder), output=join(root,'Compresses'), statePath=join(root,'.compression-state.json');
    await mkdir(output,{recursive:true});
    let completed={};try {completed=JSON.parse(await readFile(statePath,'utf8'));}catch{}
    const observations=new Map();let scanning=false;
    async function filesIn(directory) {
        const files=[];
        for(const item of await readdir(directory,{withFileTypes:true})) {
            const path=join(directory,item.name);
            if(item.isSymbolicLink() || path===output || item.name==='replay-output')continue;
            if(item.isDirectory())files.push(...await filesIn(path));
            else if(item.isFile() && /\.(mp4|mov|webm|mkv)$/i.test(item.name))files.push(path);
        }
        return files.sort();
    }
    async function scan() {
        if(scanning)return;
        scanning=true;
        try {
            const present=new Set();
            for(const path of await filesIn(root)) {
                present.add(path);
                const info=await stat(path), signature=`${info.size}:${info.mtimeMs}`;
                if(!info.size || completed[path]===signature)continue;
                const seen=observations.get(path);
                if(!seen || seen.signature!==signature){observations.set(path,{signature,since:now()});continue;}
                if(now()-seen.since<stableMs)continue;
                // Preserve subfolders and don't run simultaneous encoders.
                log('Nouvelle video stable : '+relative(root,path));
                const result=await processFile(path,{output:join(output,relative(root,dirname(path))),log});
                const current=await stat(path);
                if(current.size===info.size && current.mtimeMs===info.mtimeMs){
                    completed[path]=signature;
                    const temporary=statePath+'.'+randomUUID()+'.tmp';
                    await writeFile(temporary,JSON.stringify(completed));await rename(temporary,statePath);
                }
                if(result.files?.some(file=>file.status==='failed'))log('Video non traitee : original conserve. Corrigez/renommez le fichier pour reessayer.');
                log('Copies a envoyer : '+output);
            }
            for(const path of observations.keys())if(!present.has(path))observations.delete(path);
        } finally {scanning=false;}
    }
    return {scan,root,output};
}

export async function watch(folder) {
    const watcher=await createReplayWatcher(folder);
    const lockPath=join(watcher.root,'.watcher.lock');
    let lock;
    try {lock=await open(lockPath,'wx');}
    catch(error){
        if(error.code!=='EEXIST')throw error;
        const pid=Number(await readFile(lockPath,'utf8').catch(()=>''));
        if(Number.isInteger(pid)&&pid>0){
            let alive=true;
            try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')alive=false;else if(error.code!=='EPERM')throw error;}
            if(alive)throw Object.assign(new Error('La surveillance est deja active. Vous pouvez ajouter vos videos au dossier.'),{code:'WATCHER_ALREADY_RUNNING'});
        }
        else if(Date.now()-(await stat(lockPath)).mtimeMs<10000)throw new Error('La surveillance demarre deja. Reessayez dans quelques secondes.');
        await unlink(lockPath);lock=await open(lockPath,'wx');
    }
    await lock.writeFile(String(process.pid));await lock.close();
    try {
        await runMediaTool(mediaTool('ffmpeg'),['-version'],{timeout:10000});
        await runMediaTool(mediaTool('ffprobe'),['-version'],{timeout:10000});
    } catch(error){await unlink(lockPath).catch(()=>{});throw error;}
    console.log('SURVEILLANCE ACTIVE : '+watcher.root+'\nAjoutez vos videos ici. Attente de 30 secondes apres la copie.\nResultats : '+watcher.output+'\nFermez cette fenetre pour arreter la surveillance.');
    const scan=()=>watcher.scan().catch(error=>console.error('Surveillance : '+error.message));
    await scan();const timer=setInterval(scan,10000);
    const stop=async()=>{clearInterval(timer);await unlink(lockPath).catch(()=>{});process.exit(0);};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
    watch(process.argv[2] || fileURLToPath(new URL('../../Replays Zoom/',import.meta.url))).catch(error=>{console.error(error.message);process.exitCode=error.code==='WATCHER_ALREADY_RUNNING'?0:1;});
}
