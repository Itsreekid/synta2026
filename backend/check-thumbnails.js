import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function checkThumbnails() {
    console.log('Fetching courses from Supabase...\n');
    
    const { data: courses, error } = await supabase
        .from('courses')
        .select('id, title, thumbnail_url')
        .eq('is_published', true);
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    console.log(`Found ${courses.length} courses:\n`);
    
    courses.forEach((course, index) => {
        console.log(`${index + 1}. ${course.title}`);
        console.log(`   ID: ${course.id}`);
        console.log(`   Thumbnail URL: ${course.thumbnail_url || 'NULL'}`);
        console.log(`   Type: ${course.thumbnail_url ? (course.thumbnail_url.startsWith('http') ? 'HTTP URL' : 'R2 Key') : 'None'}`);
        console.log('');
    });
}

checkThumbnails().catch(console.error);
