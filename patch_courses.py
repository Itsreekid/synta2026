import sys

file_path = r'c:\Work\Synta\Website\synta academy new\backend\public\js\courses.js'

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
except UnicodeDecodeError:
    with open(file_path, 'r', encoding='latin-1') as f:
        content = f.read()

target = '''document.addEventListener('turbo:load', async function() {
    if (!document.getElementById('courses-list')) return; // Structural DOM check
    // Check if API client is loaded
    if (!window.SyntaAPI) {
        console.error('Client API non charg. Veuillez inclure api-client.js avant courses.js');
        return;
    }
    
    try {
        // Wait for Supabase to be ready
        await window.SyntaAPI.waitForSupabase();
        loadCourses();
        setupFilters();'''

replacement = '''document.addEventListener('turbo:load', async function() {
    if (!document.getElementById('courses-list')) return; // Structural DOM check
    // Check if API client is loaded
    if (!window.SyntaAPI) {
        console.error('Client API non charg. Veuillez inclure api-client.js avant courses.js');
        return;
    }
    
    // Page-level execution guard
    if (!window.appUserState) {
        document.addEventListener('appStateHydrated', initializeCourses, { once: true });
    } else {
        initializeCourses();
    }
});

async function initializeCourses() {
    try {
        // Wait for Supabase to be ready
        await window.SyntaAPI.waitForSupabase();
        loadCourses();
        setupFilters();'''

target_alt = target.replace('charg', 'chargé')
replacement_alt = replacement.replace('charg', 'chargé')

if target in content:
    content = content.replace(target, replacement)
elif target_alt in content:
    content = content.replace(target_alt, replacement_alt)
else:
    print('Could not find target block!')
    sys.exit(1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Patched courses.js successfully')
