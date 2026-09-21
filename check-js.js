const fs = require('fs');
const content = fs.readFileSync('backend/views/pages/code/index.ejs', 'utf8');

// The main script block is the second script tag in index.ejs
const scriptContent = content.split('<script>')[1].split('</script>')[0];
fs.writeFileSync('backend/scratch-check.js', scriptContent);

try {
    require('./backend/scratch-check.js');
} catch (e) {
    console.error(e);
}
