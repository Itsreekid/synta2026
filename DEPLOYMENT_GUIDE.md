# 🚀 Deployment Guide - Synta Academy

## ✅ What Changed

Your app now **uses Supabase directly** instead of requiring a backend server. This means:

- ✅ **No backend deployment needed**
- ✅ **No DNS configuration needed**  
- ✅ **Faster performance** (direct connection to Supabase)
- ✅ **Free hosting** (Netlify + Supabase free tiers)
- ✅ **Simpler architecture**

## 📝 Files Updated

1. **`js/api-client.js`** - Completely rewritten to use Supabase JS Client directly
2. **`pages/courses/courses.html`** - Added Supabase CDN script
3. **`pages/courses/course-details.html`** - Added Supabase CDN script

## 🔧 How It Works Now

```
Frontend (Netlify) → Supabase (Database + Auth)
```

**Before:**
```
Frontend (Netlify) → Backend API (❌ Not deployed) → Supabase
```

**Now:**
```
Frontend (Netlify) → Supabase directly ✅
```

## 📦 Deployment Steps for Netlify

### 1. Push to GitHub

```bash
git add .
git commit -m "Switch to Supabase direct integration"
git push origin main
```

### 2. Deploy to Netlify

Since you're already using Netlify, just push your changes to GitHub and Netlify will auto-deploy.

### 3. Configure Your Domain (Hostinger)

In your Hostinger DNS settings, make sure you have:

**For `syntaacademy.com`:**
- Type: A Record or CNAME
- Host: @ (or leave blank)
- Points to: Your Netlify site (e.g., `your-site.netlify.app`)

**For `www.syntaacademy.com`:**
- Type: CNAME
- Host: www
- Points to: Your Netlify site

### 4. In Netlify Dashboard

1. Go to **Domain Settings**
2. Add your custom domain: `syntaacademy.com`
3. Enable HTTPS (automatic with Netlify)

## 🔐 Security: Supabase Row Level Security (RLS)

Your database needs RLS policies enabled. Here's what you need:

### Enable RLS on All Tables

Run this in your Supabase SQL Editor:

```sql
-- Enable RLS
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

-- Public read for published courses
CREATE POLICY "Public can view published courses"
ON courses FOR SELECT
TO public
USING (is_published = true);

-- Public read for modules (if course is published)
CREATE POLICY "Public can view modules of published courses"
ON modules FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM courses 
    WHERE courses.id = modules.course_id 
    AND courses.is_published = true
  )
);

-- Public read for lessons (if course is published)
CREATE POLICY "Public can view lessons of published courses"
ON lessons FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM courses 
    JOIN modules ON modules.course_id = courses.id
    WHERE modules.id = lessons.module_id 
    AND courses.is_published = true
  )
);

-- Users can view their own enrollments
CREATE POLICY "Users can view own enrollments"
ON enrollments FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create enrollments
CREATE POLICY "Users can create enrollments"
ON enrollments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can view own progress
CREATE POLICY "Users can view own progress"
ON lesson_progress FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can update own progress
CREATE POLICY "Users can manage own progress"
ON lesson_progress FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

## 🧪 Testing After Deployment

1. **Visit your site**: `https://syntaacademy.com`
2. **Open browser console** (F12)
3. **Go to the courses page**: `/pages/courses/courses.html`
4. **Check console** - you should see:
   ```
   ✅ Synta API initialized (Supabase direct mode)
   ```

5. **Test these features:**
   - ✅ Browse courses (no login needed)
   - ✅ View course details
   - ✅ Register/Login
   - ✅ Enroll in courses
   - ✅ Track progress

## 🐛 Troubleshooting

### Error: "Supabase library not loaded"
**Solution:** Make sure the Supabase CDN script is loaded before `api-client.js`:
```html
<script src="https://unpkg.com/@supabase/supabase-js@2"></script>
<script src="../../js/api-client.js"></script>
```

### Error: "Failed to fetch courses"
**Solution:** 
1. Check Supabase RLS policies (see above)
2. Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `api-client.js` and `authentication.js` match your project

### Courses load but enrollments don't work
**Solution:** User needs to be logged in. Check authentication flow in `authentication.js`

## 📊 What You Don't Need Anymore

- ❌ `backend/` folder (can keep for reference, but not used in production)
- ❌ Backend hosting (Render, Railway, etc.)
- ❌ `api.syntaacademy.com` subdomain
- ❌ Environment variables for backend

## ✨ Benefits of This Architecture

1. **Simpler**: No backend to maintain
2. **Faster**: Direct connection to database
3. **Cheaper**: Only pay for Supabase (free tier is generous)
4. **Secure**: RLS protects your data at the database level
5. **Scalable**: Supabase handles millions of requests
6. **Real-time ready**: Can easily add real-time features with Supabase

## 📚 Next Steps

1. ✅ Deploy to Netlify
2. ✅ Configure DNS in Hostinger
3. ✅ Apply RLS policies in Supabase
4. ✅ Test all features
5. 🎉 Launch your academy!

---

**Need help?** Check the Supabase docs: https://supabase.com/docs
