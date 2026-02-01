# 🚂 Railway Setup - Backend Directory Configuration

## ⚠️ CRITICAL: Your Backend is in a Subdirectory

Your project structure:
```
Syntaacademy/
├── index.html
├── package.json (frontend)
└── backend/           ← Your server is HERE
    ├── server.js
    ├── package.json
    └── ...
```

Railway needs to know your backend is in the `backend/` subdirectory!

## 🔧 Railway Configuration Steps

### 1. In Railway Dashboard

**Go to: Your Service → Settings**

#### Set the Root Directory:
```
Root Directory: backend
```
This tells Railway to deploy from the `backend/` folder, not the project root.

#### Verify Build & Deploy Settings:
- **Build Command**: `npm install` (automatic)
- **Start Command**: `node server.js`
- **Watch Paths**: Leave empty or set to `backend/**`

### 2. Set Environment Variables

**Go to: Your Service → Variables**

Add these variables (copy from your `.env` file):

```bash
NODE_ENV=production

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=xxxxxxxxxxxxx
R2_ACCESS_KEY=xxxxxxxxxxxxx
R2_SECRET_KEY=xxxxxxxxxxxxx
R2_BUCKET=synta-content

# Security
JWT_SECRET=your-super-secret-key
ALLOWED_ORIGINS=https://syntaacademy.com,https://www.syntaacademy.com

# Optional
R2_PUBLIC_DOMAIN=your-domain.com
SIGNED_URL_EXPIRY=300
```

### 3. Deploy from GitHub

**Option A: Connect GitHub Repository**
1. Go to your Railway project
2. Click "Deploy from GitHub repo"
3. Select your repository
4. **Important**: Set Root Directory to `backend`

**Option B: Deploy from CLI**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy from backend directory
cd backend
railway up
```

## ✅ Verification Checklist

After deployment, verify:

- [ ] Root Directory is set to `backend` in Railway settings
- [ ] All environment variables are set
- [ ] Build logs show "Installing dependencies from package.json"
- [ ] Deploy logs show "Server running on http://0.0.0.0:XXXX"
- [ ] Health endpoint works: `https://your-app.up.railway.app/health`

## 🐛 Common Issues & Solutions

### Issue: "Cannot find module './routes/content.js'"
**Cause**: Railway is building from wrong directory  
**Solution**: Set Root Directory to `backend` in Railway settings

### Issue: "Missing environment variables"
**Cause**: Environment variables not set in Railway  
**Solution**: Add all variables in Railway dashboard → Variables tab

### Issue: "Port 3000 already in use"
**Cause**: Not using Railway's PORT variable  
**Solution**: Already fixed - server uses `process.env.PORT`

### Issue: Build succeeds but app crashes immediately
**Cause**: Missing environment variables or wrong start command  
**Solution**: 
1. Check Railway logs for specific error
2. Verify all environment variables are set
3. Ensure Start Command is `node server.js`

### Issue: "Error: Cannot find package 'express'"
**Cause**: Dependencies not installed  
**Solution**: 
1. Make sure `package.json` is in backend folder
2. Root Directory must be set to `backend`
3. Redeploy

## 📸 Railway Dashboard Screenshots Guide

### Where to set Root Directory:
```
Railway Dashboard
  → Your Project
    → Your Service
      → Settings tab
        → Scroll to "Service Settings"
          → Root Directory: backend
```

### Where to set Environment Variables:
```
Railway Dashboard
  → Your Project
    → Your Service
      → Variables tab
        → Click "New Variable"
```

## 🚀 After Successful Deployment

Your backend will be available at:
```
https://[your-service-name].up.railway.app
```

### Test These Endpoints:

1. **Root**: `https://your-app.up.railway.app/`
   - Should return: `{"message": "Synta Academy API", ...}`

2. **Health**: `https://your-app.up.railway.app/health`
   - Should return: `{"status": "healthy", ...}`

3. **CORS Debug**: `https://your-app.up.railway.app/debug/cors`
   - Shows CORS configuration

### Update Your Frontend

In your `js/api-client.js`, update the Railway URL:

```javascript
const BACKEND_URL = 'https://[your-actual-service-name].up.railway.app';
```

## 📞 Get Your Railway URL

After deployment:
1. Go to Railway Dashboard → Your Service
2. Click on "Settings" tab
3. Look for "Domains" section
4. Copy the `.up.railway.app` URL

Or check the deployment logs - the URL is shown there.

## ⚡ Quick Redeploy

After making changes:

```bash
git add .
git commit -m "Update backend"
git push origin main
```

Railway will auto-deploy when it detects changes in the `backend/` directory.
