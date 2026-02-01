# Railway Deployment - Quick Reference

## ⚡ Quick Fix Commands

```bash
# 1. Commit and push changes
git add .
git commit -m "Fix Railway deployment"
git push origin main
```

## 🔑 Required Environment Variables (Set in Railway Dashboard)

Copy these to Railway → Variables tab:

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_BUCKET=synta-content
JWT_SECRET=
ALLOWED_ORIGINS=https://syntaacademy.com,https://www.syntaacademy.com
NODE_ENV=production
```

## ✅ Checklist

- [ ] All environment variables set in Railway
- [ ] Code pushed to GitHub
- [ ] Railway deployment triggered
- [ ] Check deployment logs for errors
- [ ] Test `/health` endpoint
- [ ] Test `/debug/cors` endpoint
- [ ] Update frontend with correct Railway URL

## 🔗 Important URLs

- Railway Dashboard: https://railway.app/dashboard
- Your Railway App: `https://[your-service].up.railway.app`
- Health Check: `https://[your-service].up.railway.app/health`
- CORS Debug: `https://[your-service].up.railway.app/debug/cors`

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| "Missing environment variables" | Add all variables in Railway dashboard |
| "Port already in use" | Railway sets PORT automatically |
| CORS errors | Add frontend domain to ALLOWED_ORIGINS |
| Build fails | Check Railway logs, verify package.json |

## 📞 Where to Get Credentials

- **Supabase**: https://app.supabase.com/project/_/settings/api
- **Cloudflare R2**: Cloudflare Dashboard → R2 → Manage R2 API Tokens
