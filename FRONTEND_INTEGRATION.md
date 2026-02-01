# Frontend Backend Integration Guide

## ✅ What Was Updated

### New Files Created:
1. **js/api-client.js** - Main API client for backend communication
2. **js/course-details.js** - Course details page logic
3. **pages/courses/course-details.html** - Course details page

### Updated Files:
1. **js/courses.js** - Now fetches courses from backend API
2. **pages/courses/courses.html** - Added API client script and filters

## 🚀 How It Works

### API Client (`api-client.js`)
The API client provides functions to:
- Fetch courses from backend
- Check enrollment status
- Purchase/enroll in courses
- Get signed URLs for protected content (videos/PDFs)
- Track lesson progress

### Course Listing (`courses.js`)
- Fetches all published courses from backend
- Shows enrollment status and progress for logged-in users
- Supports filtering by category, level, and search
- Handles enrollment (free courses) and payment redirect (paid courses)

### Course Details (`course-details.js`)
- Shows full course structure (modules and lessons)
- Displays user progress if enrolled
- Generates signed URLs for video/PDF content
- Tracks video watch progress
- Marks lessons as completed

## 🔐 Authentication

The API client automatically includes the authentication token from:
- `sessionStorage.getItem('supabase.auth.token')`
- `localStorage.getItem('supabase.auth.token')`

Make sure your authentication system stores the token in one of these locations.

## 📡 Backend API Endpoints Used

### Courses
- `GET /api/courses` - List all courses
- `GET /api/courses/:id` - Course details with modules/lessons
- `GET /api/courses/my-enrollments` - User's enrolled courses
- `GET /api/courses/:id/progress` - User's progress in course

### Enrollment
- `POST /api/enrollment/purchase` - Purchase a paid course
- `POST /api/enrollment/free` - Enroll in free course
- `GET /api/enrollment/check/:courseId` - Check access

### Content (Protected)
- `GET /api/content/lesson/:id/video` - Get signed video URL
- `GET /api/content/lesson/:id/pdf` - Get signed PDF URL
- `POST /api/content/lesson/:id/progress` - Update lesson progress

## 🎯 Usage Examples

### In HTML Files
```html
<!-- Always include api-client.js before other scripts -->
<script src="../../js/api-client.js"></script>
<script src="../../js/courses.js"></script>
```

### In JavaScript
```javascript
// Fetch all courses
const courses = await window.SyntaAPI.fetchCourses();

// Filter courses
const pythonCourses = await window.SyntaAPI.fetchCourses({ 
    category: 'bac-info',
    search: 'python'
});

// Enroll in free course
await window.SyntaAPI.enrollFreeCourse(courseId);

// Get video URL (returns signed URL valid for 5 minutes)
const { videoUrl } = await window.SyntaAPI.getLessonVideo(lessonId);

// Mark lesson complete
await window.SyntaAPI.markLessonComplete(lessonId, 100);
```

## ⚙️ Configuration

### Backend URL
Update in `js/api-client.js`:
```javascript
const API_BASE_URL = 'http://localhost:3000/api';
```

For production, change to your production URL:
```javascript
const API_BASE_URL = 'https://your-domain.com/api';
```

## 🔒 Security Notes

1. ✅ **Service Role Key** - Only in backend/.env (never exposed to frontend)
2. ✅ **Anon Key** - Safe to use in frontend (authentication.js)
3. ✅ **Signed URLs** - Expire after 5 minutes, can't be shared
4. ✅ **Access Control** - Backend checks enrollment before serving content

## 📝 Sample Data

Your database already has 3 sample courses:
1. **Programmation Python - Bac Info** (150 DT)
2. **Mathématiques Avancées - Bac Math** (120 DT)
3. **Introduction Gratuite** (Free) - with 1 preview lesson

## 🧪 Testing

1. **Make sure backend is running:**
   ```bash
   cd backend
   npm start
   ```

2. **Open courses page:**
   - Navigate to: `pages/courses/courses.html`
   - Should see 3 sample courses from database

3. **Test enrollment:**
   - Login first
   - Click on free course to enroll
   - Click on paid course to go to payment

4. **Test course details:**
   - Click "view course" or navigate to: `course-details.html?id=<course-id>`
   - Should see modules and lessons
   - Preview lessons accessible without enrollment

## 🐛 Troubleshooting

### Courses not loading?
- Check if backend is running on port 3000
- Check browser console for errors
- Verify CORS is enabled in backend

### "Access Denied" errors?
- Make sure user is logged in
- Check if enrollment exists in database
- Verify JWT token is being sent in headers

### Videos not playing?
- Check if R2 bucket has the video file
- Verify signed URL is generated (check network tab)
- URLs expire in 5 minutes - regenerate if expired

## 🎨 Next Steps

1. Add more styling to course cards
2. Implement payment gateway integration
3. Add course reviews and ratings
4. Create instructor dashboard
5. Add certificate generation on completion
