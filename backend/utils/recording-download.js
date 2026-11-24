// Validate AND pin DNS for every redirect. Never forward OAuth to storage hosts.
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

export function isPublicAddress(address) {
  if(isIP(address)===4){
    const [a,b]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0));
  }
  // Only global-unicast IPv6; excludes mapped IPv4, loopback, ULA, link local.
  return isIP(address)===6 && /^[23]/i.test(address) && !/^2001:(db8|0:|10:|20:)/i.test(address) && !/^2002:/i.test(address);
}
export async function validatedDestination(value,lookupFn=lookup) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||(url.port && url.port!=='443'))throw new Error('Unsafe recording destination');
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await lookupFn(hostname,{all:true});
  if(!addresses.length||addresses.some(item=>!isPublicAddress(item.address)))throw new Error('Unsafe recording address');
  return {url,address:addresses[0]};
}
export async function downloadRecording(value,token,signal,{lookupFn=lookup,requestFn=request}={}) {
  let current=value;
  for(let redirects=0;redirects<=5;redirects++){
    const {url,address}=await validatedDestination(current,lookupFn);
    const response=await new Promise((resolve,reject)=>{
      const req=requestFn(url,{signal,headers:redirects===0?{Authorization:`Bearer ${token}`}:{},
        lookup(_host,options,callback){callback(null,options?.all?[address]:address.address,address.family);}},resolve);
      req.setTimeout(120000,()=>req.destroy(new Error('Recording connection stalled')));
      req.on('error',reject);req.end();
    });
    if(response.statusCode>=300&&response.statusCode<400&&response.headers.location){
      response.resume();current=new URL(response.headers.location,url).href;continue;
    }
    return new Response(Readable.toWeb(response),{status:response.statusCode,headers:response.headers});
  }
  throw new Error('Too many recording redirects');
}
