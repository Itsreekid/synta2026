import dotenv from 'dotenv';

dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || 'https://syntaacademy-production.up.railway.app';

async function testThumbnailEndpoint() {
    const thumbnailKeys = [
        'Courses-th/algo2.gif',
        'Courses-th/soon1.jpg'
    ];
    
    console.log(`Testing thumbnail endpoint at: ${BACKEND_URL}\n`);
    
    for (const key of thumbnailKeys) {
        console.log(`\nTesting: ${key}`);
        console.log('=' .repeat(60));
        
        const url = `${BACKEND_URL}/api/content/thumbnail/${encodeURIComponent(key)}`;
        console.log(`URL: ${url}`);
        
        try {
            const response = await fetch(url);
            console.log(`Status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Success!');
                console.log('Signed URL:', data.url.substring(0, 100) + '...');
                console.log('Expires in:', data.expiresIn, 'seconds');
            } else {
                const errorText = await response.text();
                console.log('❌ Failed!');
                console.log('Error:', errorText);
            }
        } catch (err) {
            console.log('❌ Exception!');
            console.error('Error:', err.message);
        }
    }
}

testThumbnailEndpoint().catch(console.error);
