import './loadEnv.js';
import { getZoomAccessToken } from './utils/zoomClient.js';

try {
  console.log('Testing Zoom S2S OAuth...');
  console.log('Account ID:', process.env.ZOOM_ACCOUNT_ID);
  const token = await getZoomAccessToken();
  console.log('✅ Zoom S2S token acquired successfully!');
  console.log('Token preview:', token.substring(0, 50) + '...');
} catch (e) {
  console.error('❌ Failed:', e.message);
}
