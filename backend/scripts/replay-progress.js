// Private loopback-only local monitor. No platform routes or media serving.
import http from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const defaultFolder=fileURLToPath(new URL('../../Replays Zoom/',import.meta.url));
async function smallText(path){try{if((await stat(path)).size>5*1024*1024)return '';return await readFile(path,'utf8');}catch{return '';}}

export async function readReplayProgress(folder=defaultFolder){
    const root=resolve(folder),output=join(root,'Compresses');
    const json=await smallText(join(root,'.progress-state.json'));
    if(json){try{return {...JSON.parse(json),precise:true};}catch{}}
    // Compatibility with a watcher already encoding: do not restart its video.
    const log=await smallText(join(root,'surveillance.log'));
    const start=log.lastIndexOf('Compression : ');
    if(start<0)return {phase:'waiting',file:'',precise:false};
    const current=log.slice(start),match=/Compression : (.+) \((\d+) Mo\)/.exec(current);
    const percents=[...current.matchAll(/(?:^|\n)\s*(\d+) %/g)];
    const percent=percents.length?Number(percents.at(-1)[1]):null;
    const reportMatch=/Termin[ée].*?Rapport : (.+)/.exec(current);
    if(reportMatch){
        const path=resolve(reportMatch[1].trim()),rel=relative(output,path);
        if(rel&&!rel.startsWith('..')&&!isAbsolute(rel)){
            try{const report=JSON.parse(await smallText(path));const result=report.files?.at(-1);if(result)return {phase:result.status==='failed'?'failed':'complete',file:match?.[1]||'',result,precise:false};}catch{}
        }
    }
    return {phase:percent===100?'verifying':'compressing',file:match?.[1]||'',percent,originalBytes:Number(match?.[2]||0)*1048576,precise:false};
}

export async function createReplayProgressServer(folder=defaultFolder,{token=randomBytes(24).toString('hex')}={}){
    const html=await readFile(new URL('./replay-progress.html',import.meta.url),'utf8');
    let lastSeen=Date.now();
    const server=http.createServer(async(req,res)=>{
        const host=`127.0.0.1:${server.address().port}`,base='/'+token;
        if(req.headers.host!==host||(req.headers.origin&&req.headers.origin!==`http://${host}`)){res.writeHead(403);return res.end();}
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'");
        if(req.method!=='GET'){res.writeHead(405);return res.end();}
        lastSeen=Date.now();
        if(req.url===base||req.url===base+'/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
        if(req.url===base+'/status'){
            try{res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify(await readReplayProgress(folder)));}
            catch{res.writeHead(500);return res.end('{"error":"Etat indisponible"}');}
        }
        res.writeHead(404);res.end();
    });
    await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
    const url=`http://127.0.0.1:${server.address().port}/${token}`;
    const timer=setInterval(()=>{if(Date.now()-lastSeen>180000)server.close();},30000);timer.unref();
    server.on('close',()=>clearInterval(timer));
    return {server,url};
}

export async function openReplayProgress(){
    const infoPath=join(defaultFolder,'.progress-ui.json');
    try {
        const previous=JSON.parse(await smallText(infoPath));
        if(/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{48}$/.test(previous.url)){
            const response=await fetch(previous.url+'/status',{signal:AbortSignal.timeout(1000)});
            if(response.ok){spawn('explorer.exe',[previous.url],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});return;}
        }
    }catch{}
    const {url}=await createReplayProgressServer();await writeFile(infoPath,JSON.stringify({url}));
    console.log('Progression locale : '+url);
    if(process.platform==='win32')spawn('explorer.exe',[url],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))openReplayProgress().catch(error=>{console.error(error.message);process.exitCode=1;});
