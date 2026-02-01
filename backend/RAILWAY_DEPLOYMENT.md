# 🚂 Railway Deployment Checklist

## ✅ Fixed Issues

1. **Added Railway configuration files:**
   - `railway.json` - Railway deployment configuration
   - `nixpacks.toml` - Build configuration for Node.js

2. **Updated server.js:**
   - Added environment variable validation on startup
   - Changed server binding to `0.0.0.0` (required by Railway)
   - Better error messages for missing environment variables

3. **Package.json already configured:**
   - ✅ `"type": "module"` for ES modules
   - ✅ `"start": "node server.js"` script
   - ✅ All dependencies listed

## 📋 Railway Deployment Steps

### 1. Push Your Code to GitHub

```bash
cd "c:\Work\website\Synta main website\Syntaacademy"
git add .
git commit -m "Fix Railway deployment configuration"
git push origin main
```

### 2. Configure Environment Variables in Railway

Go to your Railway dashboard → Your service → **Variables** tab and add these:

#### Required Variables:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-role-key-here

# Cloudflare R2 Configuration
CLOUDFLARE_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY=your-access-key-here
R2_SECRET_KEY=your-secret-key-here
R2_BUCKET=synta-content

# Security
JWT_SECRET=your-super-secret-jwt-key-change-this
ALLOWED_ORIGINS=https://syntaacademy.com,https://www.syntaacademy.com

# Node Environment
NODE_ENV=production
```

#### Optional Variables:

```bash
R2_PUBLIC_DOMAIN=your-custom-domain.com
SIGNED_URL_EXPIRY=300
```

### 3. Deploy in Railway

Railway will automatically:
1. Detect your repository changes
2. Install dependencies with `npm ci`
3. Run `npm start`
4. Expose your service on a public URL

### 4. Verify Deployment

Once deployed, test these endpoints:

1. **Health Check:**
   ```
   https://your-railway-app.up.railway.app/health
   ```
   Expected response:
   ```json
   {
     "status": "healthy",
     "timestamp": "2026-02-01T..."
   }
   ```

2. **CORS Debug:**
   ```
   https://your-railway-app.up.railway.app/debug/cors
   ```

3. **Root endpoint:**
   ```
   https://your-railway-app.up.railway.app/
   ```
   Expected response:
   ```json
   {
     "message": "Synta Academy API",
     "version": "1.0.0",
     "status": "running"
   }
   ```

## 🔍 Troubleshooting

### Deployment Fails Immediately

**Check the Railway logs for:**

```
❌ DEPLOYMENT ERROR: Missing required environment variables:
   - SUPABASE_URL
   - R2_ACCESS_KEY
   ...
```

**Solution:** Add all required environment variables in Railway dashboard.

### Deployment Succeeds but App Crashes

**Check Railway logs for specific errors:**

1. Database connection issues → Verify Supabase credentials
2. R2 bucket access issues → Verify Cloudflare R2 credentials
3. Port binding issues → Should be fixed now with `0.0.0.0` binding

### CORS Errors from Frontend

**Add your frontend domain to ALLOWED_ORIGINS:**

```bash
ALLOWED_ORIGINS=https://syntaacademy.com,https://www.syntaacademy.com,https://your-netlify-site.netlify.app
```

### Application Not Responding

1. Check Railway service status
2. Verify the public URL is correct
3. Check application logs for startup errors
4. Ensure `PORT` environment variable is being used (Railway sets this automatically)

## 📝 What Changed

### Created Files:
- [backend/railway.json](backend/railway.json) - Railway deployment config
- [backend/nixpacks.toml](backend/nixpacks.toml) - Build configuration
- [backend/RAILWAY_DEPLOYMENT.md](backend/RAILWAY_DEPLOYMENT.md) - This file

### Modified Files:
- [backend/server.js](backend/server.js):
  - Added environment variable validation
  - Changed server binding to `0.0.0.0:PORT`
  - Added better error messages

## 🚀 Next Steps

1. **Commit and push** the changes to GitHub
2. **Add environment variables** in Railway dashboard
3. **Trigger redeployment** (automatic on git push)
4. **Test the endpoints** to verify everything works
5. **Update frontend** to use the new Railway URL if changed

## 📚 Additional Resources

- [Railway Docs](https://docs.railway.app/)
- [Nixpacks Docs](https://nixpacks.com/docs)
- [Node.js on Railway](https://docs.railway.app/guides/nodejs)
