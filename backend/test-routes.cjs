const http = require('http');

const testRoute = (path, name) => new Promise(resolve => {
  http.get('http://localhost:3000' + path, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`[${name}] ${path} -> Status: ${res.statusCode}, Content-Length: ${data.length}`);
      if (res.statusCode === 302 || res.statusCode === 301) {
        console.log(`  -> Redirect Location: ${res.headers.location}`);
      }
      resolve();
    });
  }).on('error', err => {
    console.log(`[${name}] Error: ${err.message}`);
    resolve();
  });
});

(async () => {
  console.log('Testing Express Routes...');
  await testRoute('/health', 'Health Check');
  await testRoute('/', 'Public Home');
  await testRoute('/login', 'Login Page');
  await testRoute('/dashboard', 'Dashboard (Protected)');
  await testRoute('/api/events', 'Events API');
  console.log('Done!');
})();
