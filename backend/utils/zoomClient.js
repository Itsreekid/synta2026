import { downloadRecording } from './recording-download.js';
// =====================================================
// ZOOM SERVER-TO-SERVER OAUTH CLIENT
// Handles token acquisition, 1-hour caching, and
// meeting creation via the Zoom REST API.
//
// Required env vars:
//   ZOOM_ACCOUNT_ID   — from Zoom Marketplace app
//   ZOOM_CLIENT_ID    — from Zoom Marketplace app
//   ZOOM_CLIENT_SECRET — from Zoom Marketplace app
// =====================================================

let _cachedToken = null;
let _tokenExpiresAt = 0;

/**
 * Get a valid Zoom access token, using a cached one if still valid.
 * Zoom S2S tokens last 1 hour (3600s). We refresh 60s before expiry.
 */
export async function getZoomAccessToken() {
  // Return cached token if still valid (with 60s safety buffer)
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;

  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    throw new Error('Missing Zoom credentials: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET must be set in .env');
  }

  const credentials = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Zoom token request failed (${response.status})`);
  }

  const data = await response.json();
  _cachedToken = data.access_token;
  _tokenExpiresAt = Date.now() + data.expires_in * 1000; // expires_in is seconds (3600)

  console.log('[Zoom] New access token acquired, expires in', data.expires_in, 'seconds');
  return _cachedToken;
}

/**
 * Create a scheduled Zoom meeting and return both host and student URLs.
 * IMPORTANT: zoom_start_url is the HOST link — NEVER expose this to students.
 *
 * @param {object} options
 * @param {string} options.topic        - Meeting title
 * @param {string} options.startTime    - ISO 8601 datetime string (e.g. "2026-09-20T20:00:00")
 * @param {number} options.durationMinutes - Meeting duration in minutes
 * @param {string} [options.timezone]   - IANA timezone (default: Africa/Tunis)
 * @returns {{ zoom_meeting_id, zoom_join_url, zoom_start_url, zoom_password }}
 */
export async function createZoomMeeting({ topic, startTime, durationMinutes, isRecurring = false, timezone = 'Africa/Tunis' }) {
  const token = await getZoomAccessToken();

  const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic,
      type: isRecurring ? 3 : 2, // 3: Recurring no fixed time, 2: Scheduled meeting
      start_time: startTime,
      duration: durationMinutes,
      timezone,
      settings: {
        join_before_host: false,
        waiting_room: true,
        mute_upon_entry: true,
        participant_video: false,
        host_video: true,
        auto_recording: 'cloud', // Auto-record to cloud for replay_url
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Zoom meeting creation failed (${response.status})`);
  }

  const data = await response.json();

  return {
    zoom_meeting_id: String(data.id),
    zoom_join_url: data.join_url,   // ✅ Safe for students
    zoom_start_url: data.start_url, // 🔒 Teacher/host only — never send to frontend
    zoom_password: data.password,
  };
}

/**
 * Open an authenticated stream of a cloud recording file. Zoom answers with a
 * redirect to short-lived storage, which is followed without the bearer token.
 * The caller owns the response body and must consume or cancel it.
 */
export async function openZoomRecordingDownload(downloadUrl, signal) {
  const url = new URL(downloadUrl);
  if (url.protocol !== 'https:' || !(url.hostname === 'zoom.us' || url.hostname.endsWith('.zoom.us'))) {
    throw new Error('Unexpected recording download host');
  }
  return downloadRecording(downloadUrl, await getZoomAccessToken(), signal);
}

/**
 * Delete a Zoom meeting by ID (e.g. when a session is cancelled).
 * @param {string} meetingId
 */
export async function deleteZoomMeeting(meetingId) {
  const token = await getZoomAccessToken();

  const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.ok) return;
  const problem = await response.json().catch(() => ({}));
  // Zoom 3001 means the desired state was already reached, including after a retry.
  if (response.status === 404 && problem.code === 3001) return;
  throw new Error(`Zoom meeting cancellation failed (${response.status})`);
}

// Exact occurrence lookup: never substitute the reusable numeric meeting ID.
export async function getZoomOccurrenceRecordings(uuid) {
  checkZoomReadCooldown();
  if(typeof uuid!=='string'||!uuid||uuid.length>512||/^\d+$/.test(uuid))throw new Error('Invalid occurrence UUID');
  let encoded=encodeURIComponent(uuid);
  if(uuid.startsWith('/')||uuid.includes('//'))encoded=encodeURIComponent(encoded);
  const response=await fetch('https://api.zoom.us/v2/meetings/'+encoded+'/recordings',{
    headers:{Authorization:'Bearer '+await getZoomAccessToken()},signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw zoomReadError(response);
  const data=await response.json();
  if(data.uuid!==uuid)throw new Error('Zoom occurrence mismatch');
  return data;
}

let zoomReadBlockedUntil=0;
function zoomReadError(response){
  const error=new Error('Zoom temporarily unavailable');error.status=response.status;
  if(response.status===429){
    const header=response.headers?.get('retry-after');
    const seconds=Number(header);
    const delay=header && Number.isFinite(seconds)?seconds*1000:Math.max(0,Date.parse(header)-Date.now())||60000;
    zoomReadBlockedUntil=Date.now()+Math.max(1000,delay);
  }
  return error;
}
export async function getZoomPastInstances(meetingId){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(String(meetingId)))throw new Error('Invalid meeting ID');
  checkZoomReadCooldown();
  const response=await fetch('https://api.zoom.us/v2/past_meetings/'+encodeURIComponent(meetingId)+'/instances',{
    headers:{Authorization:'Bearer '+await getZoomAccessToken()},signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw zoomReadError(response);
  const data=await response.json();
  return (Array.isArray(data.meetings)?data.meetings:[]).filter(item=>typeof item.uuid==='string' && Number.isFinite(Date.parse(item.start_time)));
}
function checkZoomReadCooldown(){
  if(Date.now()<zoomReadBlockedUntil){const error=new Error('Zoom rate limited');error.status=429;throw error;}
}

// Shared no-fixed-time meetings use the platform's individual session dates.
// A scheduled meeting needs only the existing write permission, not a GET/read scope.
export async function rescheduleZoomMeeting(meetingId,startTime,durationMinutes,{sharedMeeting=false}={}){
  if(sharedMeeting)return;
  let token;
  try{token=await getZoomAccessToken();}catch{throw rescheduleError('authentication');}
  let response;
  try{
    response=await fetch('https://api.zoom.us/v2/meetings/'+encodeURIComponent(meetingId),{
      method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(10000),redirect:'error',
      body:JSON.stringify({start_time:startTime,duration:durationMinutes,timezone:'Africa/Tunis'}),
    });
  }catch{throw rescheduleError('network');}
  if(response.ok)return;
  const problem=await response.json().catch(()=>({}));
  const code=Number.isInteger(problem.code)?problem.code:undefined;
  const reason=response.status===429?'rate_limit':response.status===401||response.status===403||code===4711?'permissions':response.status===404||code===3001?'missing_meeting':'provider_rejected';
  throw rescheduleError(reason,response.status,code);
}
function rescheduleError(reason,httpStatus,zoomCode){
  const error=new Error('Zoom reschedule failed');
  error.reason=reason;error.httpStatus=httpStatus;error.zoomCode=zoomCode;
  return error;
}
