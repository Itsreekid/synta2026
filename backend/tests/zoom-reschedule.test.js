
import test from 'node:test';
import assert from 'node:assert/strict';

test('rescheduling uses write-only PATCH and classifies safe errors without exposing Zoom responses',async()=>{
 const originalFetch=globalThis.fetch;
 const names=['ZOOM_ACCOUNT_ID','ZOOM_CLIENT_ID','ZOOM_CLIENT_SECRET'];const old=names.map(k=>process.env[k]);
 names.forEach(k=>process.env[k]='synthetic-only');
 const requests=[];let status=204,code=0;
 globalThis.fetch=async(url,options)=>{
 requests.push({url,options});
 if(url.startsWith('https://zoom.us/oauth/token'))return {ok:true,json:async()=>({access_token:'synthetic-token',expires_in:3600})};
 return {ok:status===204,status,json:async()=>({code,message:'SECRET PROVIDER MESSAGE'})};
 };
 try{
 const {rescheduleZoomMeeting}=await import('../utils/zoomClient.js?reschedule-test');
 await rescheduleZoomMeeting('123','2030-01-01T19:30:00Z',90,{sharedMeeting:true});assert.equal(requests.length,0);
 await rescheduleZoomMeeting('123','2030-01-01T19:30:00Z',90);
 assert.equal(requests.length,2);assert.equal(requests[1].options.method,'PATCH');
 assert.deepEqual(JSON.parse(requests[1].options.body),{start_time:'2030-01-01T19:30:00Z',duration:90,timezone:'Africa/Tunis'});
 for(const [http,zoom,reason]of [[403,4711,'permissions'],[401,124,'permissions'],[404,3001,'missing_meeting'],[429,0,'rate_limit'],[400,0,'provider_rejected']]){
 status=http;code=zoom;await assert.rejects(rescheduleZoomMeeting('123','2030-01-01T19:30:00Z',90),error=>{assert.equal(error.reason,reason);assert.equal(error.httpStatus,http);assert.ok(!error.message.includes('SECRET'));return true;});
 }
 globalThis.fetch=async()=>{throw Error('sensitive network text');};
 await assert.rejects(rescheduleZoomMeeting('123','2030-01-01T19:30:00Z',90),error=>error.reason==='network'&&!error.message.includes('sensitive'));
 }finally{globalThis.fetch=originalFetch;names.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
