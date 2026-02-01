# Synta Academy Backend API

Professional backend for Synta Academy educational platform with Cloudflare R2 and Supabase.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start server
npm start
```

## 📚 Features

- **Secure Content Delivery**: Cloudflare R2 with signed URLs
- **Access Control**: User enrollment verification
- **Progress Tracking**: Lesson completion and course progress
- **RESTful API**: Clean, documented endpoints
- **Authentication**: Supabase JWT verification

## 🔗 API Endpoints

### Courses
- `GET /api/courses` - List all published courses
- `GET /api/courses/:id` - Get course details
- `GET /api/courses/:id/enrollment` - Check enrollment status
- `GET /api/courses/:id/progress` - Get user progress
- `GET /api/courses/user/my-courses` - Get enrolled courses

### Content (Protected)
- `GET /api/content/lesson/:id` - Get lesson signed URLs
- `POST /api/content/lesson/:id/progress` - Update progress

### Enrollment (Protected)
- `POST /api/enrollment/enroll` - Enroll in course
- `POST /api/enrollment/free-enroll/:id` - Free course enrollment
- `GET /api/enrollment/my-enrollments` - User enrollments
- `GET /api/enrollment/offers` - Active offers

## 🔒 Security

- JWT authentication via Supabase
- Row Level Security (RLS) in database
- Temporary signed URLs (5-minute expiry)
- CORS protection
- Helmet security headers

## 📖 Documentation

See [SETUP_GUIDE.md](../SETUP_GUIDE.md) for complete setup instructions.

## 🛠️ Tech Stack

- Node.js + Express
- Supabase (PostgreSQL)
- Cloudflare R2 (S3-compatible)
- AWS SDK v3

## 📝 License

MIT
