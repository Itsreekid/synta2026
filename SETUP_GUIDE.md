# 🎓 Synta Academy - Complete Setup Guide

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Supabase Setup](#supabase-setup)
3. [Cloudflare R2 Setup](#cloudflare-r2-setup)
4. [Backend Setup](#backend-setup)
5. [Frontend Integration](#frontend-integration)
6. [Testing](#testing)
7. [Deployment](#deployment)

---

## 1. Prerequisites ✅

Before starting, ensure you have:
- Node.js (v18+) installed
- A Supabase account (free tier is fine)
- A Cloudflare account (free R2 tier)
- Basic command line knowledge

---

## 2. Supabase Setup 🗄️

### Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose a name: **synta-academy**
4. Set a strong database password (save it!)
5. Choose region closest to Tunisia (Europe West recommended)

### Step 2: Run Database Schema
1. In Supabase dashboard, go to **SQL Editor**
2. Open the file: `database/schema.sql`
3. Copy all content and paste into SQL Editor
4. Click **RUN**
5. Wait for confirmation (should show success messages)

### Step 3: Get API Keys
1. Go to **Settings → API**
2. Copy these values (you'll need them later):
   - `Project URL`
   - `anon public` key
   - `service_role` key (keep this SECRET!)

### Step 4: Configure Authentication
1. Go to **Authentication → Providers**
2. Enable **Email** provider
3. Configure email templates (optional)
4. Go to **Authentication → URL Configuration**
5. Add your site URL: `http://localhost:5500` (for development)

---

## 3. Cloudflare R2 Setup ☁️

### Step 1: Create R2 Bucket
1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **R2** in the sidebar
3. Click **Create bucket**
4. Name: `synta-content`
5. Location: **Automatic** (recommended)
6. Click **Create bucket**

### Step 2: Generate API Token
1. In R2 dashboard, click **Manage R2 API Tokens**
2. Click **Create API token**
3. Name: `synta-backend-access`
4. Permissions: **Object Read & Write**
5. TTL: **Forever** (or set expiry if you prefer)
6. Click **Create API Token**
7. **COPY AND SAVE** these values immediately:
   - `Access Key ID`
   - `Secret Access Key`
   - `Account ID` (shown at top of R2 page)

> ⚠️ **IMPORTANT**: You cannot see the Secret Access Key again!

---

## 4. Backend Setup 🚀

### Step 1: Install Dependencies
```bash
cd backend
npm install
```

### Step 2: Configure Environment
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your values:
   ```env
   # Server
   PORT=3000
   NODE_ENV=development

   # Supabase (from Step 2.3)
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJxxx...
   SUPABASE_SERVICE_KEY=eyJxxx...  # Keep SECRET!

   # Cloudflare R2 (from Step 3.2)
   CLOUDFLARE_ACCOUNT_ID=xxxxx
   R2_ACCESS_KEY=xxxxx
   R2_SECRET_KEY=xxxxx
   R2_BUCKET=synta-content

   # Security
   JWT_SECRET=change-this-to-a-random-string
   ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
   ```

### Step 3: Start the Backend
```bash
npm start
```

You should see:
```
╔═══════════════════════════════════════════╗
║      🎓 Synta Academy API Server         ║
║      Port: 3000                          ║
║      Environment: development            ║
╚═══════════════════════════════════════════╝
```

### Step 4: Test the API
Open browser and go to: `http://localhost:3000/health`

You should see:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-01T..."
}
```

---

## 5. Frontend Integration 🎨

### Update authentication.js

Add this to your `authentication.js`:

```javascript
// API Base URL
const API_URL = 'http://localhost:3000/api';

// Get user's access token
async function getUserToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

// Fetch with authentication
async function authenticatedFetch(url, options = {}) {
  const token = await getUserToken();
  
  return fetch(`${API_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
}
```

### Update courses.js

Example of fetching course with enrollment check:

```javascript
async function loadCourse(courseId) {
  try {
    // Fetch course details
    const response = await fetch(`${API_URL}/courses/${courseId}`);
    const course = await response.json();

    // Check if user is enrolled
    const enrollResponse = await authenticatedFetch(`/courses/${courseId}/enrollment`);
    const { enrolled } = await enrollResponse.json();

    if (enrolled) {
      // Show full course content
      displayFullCourse(course);
    } else {
      // Show preview only + purchase button
      displayCoursePreview(course);
    }
  } catch (error) {
    console.error('Error loading course:', error);
  }
}
```

### Playing Protected Videos

```javascript
async function playLesson(lessonId) {
  try {
    // Request signed URL from backend
    const response = await authenticatedFetch(`/content/lesson/${lessonId}`);
    
    if (!response.ok) {
      alert('Please enroll in this course to access this lesson');
      return;
    }

    const { videoUrl, pdfUrl } = await response.json();

    // Set video source
    if (videoUrl) {
      videoPlayer.src = videoUrl;
      videoPlayer.play();
    }

    // URL expires in 5 minutes - reload if needed
    setTimeout(() => {
      console.log('Video URL expired, refresh to continue');
    }, 5 * 60 * 1000);

  } catch (error) {
    console.error('Error playing lesson:', error);
  }
}
```

---

## 6. Testing 🧪

### Test 1: User Registration
1. Go to your website
2. Register a new user
3. Check Supabase → Authentication → Users (should see new user)

### Test 2: Free Course Enrollment
1. Create a test course in Supabase:
   ```sql
   INSERT INTO courses (title, description, category, is_free, is_published)
   VALUES ('Test Free Course', 'Testing', 'general', true, true);
   ```
2. Try enrolling via API or frontend
3. Check `enrollments` table

### Test 3: Content Access
1. Upload a test video to R2 (manually for now)
2. Create a lesson in database with the R2 key
3. Try accessing via `/api/content/lesson/:id`
4. Should get a signed URL

---

## 7. Uploading Content to R2 📤

### Option A: Manual Upload (For Now)
1. Go to Cloudflare R2 dashboard
2. Click on `synta-content` bucket
3. Click **Upload**
4. Upload your video/PDF
5. Note the path, e.g., `courses/bac-info/module1/lesson1/video.mp4`
6. Add this path to your lesson's `video_key` in database

### Option B: Automated Upload (Later)
Create an admin panel where instructors can upload directly:
- Frontend file picker
- Backend receives file
- Uploads to R2 using `uploadToR2()` function
- Stores key in database

---

## 8. Security Checklist ✅

Before going live:

- [ ] Change all default passwords
- [ ] Regenerate JWT_SECRET to a random 64-character string
- [ ] Enable RLS policies in Supabase
- [ ] Add CORS restrictions (only your domain)
- [ ] Use HTTPS in production
- [ ] Never expose `SUPABASE_SERVICE_KEY` or `R2_SECRET_KEY`
- [ ] Set up environment variables on hosting platform
- [ ] Enable rate limiting on API
- [ ] Add watermark to videos (optional)

---

## 9. Next Steps 🚀

1. **Payment Integration**
   - Add Stripe or local payment gateway
   - Implement webhook for automatic enrollment

2. **Admin Dashboard**
   - Course management interface
   - Upload videos/PDFs directly
   - View analytics

3. **Student Features**
   - Progress tracking UI
   - Certificates on completion
   - Quizzes and assignments

4. **Optimization**
   - Video transcoding for different qualities
   - CDN for faster delivery
   - Caching strategies

---

## 🆘 Troubleshooting

### "Unauthorized" errors
- Check if token is being sent correctly
- Verify Supabase keys are correct
- Check token expiry

### Videos not loading
- Verify R2 keys are correct
- Check if lesson has `video_key` set
- Test R2 connectivity

### Database errors
- Check RLS policies aren't too restrictive
- Verify foreign keys exist
- Check Supabase logs

---

## 📞 Support

If stuck:
1. Check console for errors
2. Verify all environment variables
3. Test API endpoints with Postman
4. Check Supabase logs

---

**Ready to build! 🎉**
