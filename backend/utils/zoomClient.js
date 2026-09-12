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
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Zoom token request failed (${response.status}): ${body}`);
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
    const body = await response.text();
    throw new Error(`Zoom meeting creation failed (${response.status}): ${body}`);
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
 * Delete a Zoom meeting by ID (e.g. when a session is cancelled).
 * @param {string} meetingId
 */
export async function deleteZoomMeeting(meetingId) {
  const token = await getZoomAccessToken();

  const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok && response.status !== 204) {
    const body = await response.text();
    console.warn(`[Zoom] Delete meeting ${meetingId} failed (${response.status}): ${body}`);
  }
}
