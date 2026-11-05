# Coolify Deployment — Quick Reference

## Automatic database migrations

The backend Docker image runs `npm run migrate` before `npm start`. On each deployment it applies only new files in `database/migrations/`, records them in `schema_migrations`, and then starts the app. Applied SQL files must not be edited; create a new numbered file for every later change. If a migration fails, the container exits and the app does not start.

In Coolify, configure the application to build from the **repository root** and use **`/backend/Dockerfile`** as the Dockerfile path. Keep `DATABASE_URL` set to the PostgreSQL service reachable from the backend container. No SQL paste or manual migration command is needed for these incremental changes.

The current migrations add reusable course modules, interactive quiz content, and the `learning_resources` table for lesson/live-session practice files. Coolify applies pending migration files before starting the app. Back up the database before deployment.

This does not initialize a brand-new empty PostgreSQL database. The base schema in `database/schema_postgres.sql` must already have been installed once. Back up the database before the first deployment containing migrations.

## R2 browser uploads

The admin uploads lesson documents, live replay videos, and practice files directly to the private R2 bucket using short-lived signed URLs. Configure the bucket CORS policy to allow `PUT` from your exact Synta site origin and allow the `Content-Type` request header. Practice files support Python, HTML, CSS, JavaScript, JSON, TXT, and ZIP (25 MB per file). Example policy values: `AllowedOrigins: ["https://your-site-domain"]`, `AllowedMethods: ["PUT"]`, `AllowedHeaders: ["Content-Type"]`, `ExposeHeaders: ["ETag"]`, `MaxAgeSeconds: 3600`. Replace the example origin with the production domain (and add the admin preview domain if you use one).

## ⚡ Quick Fix Commands

```bash
# 1. Commit and push changes
git add .
git commit -m "Add deploy migrations"
git push origin main
```

## Required environment variables (set in Coolify)

Set the application variables in Coolify. Keep the existing application secrets and `DATABASE_URL` configured:

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

## Deploy checklist

- [ ] Required environment variables set in Coolify
- [ ] Code pushed to GitHub
- [ ] Coolify deployment triggered
- [ ] Check deployment logs for errors
- [ ] Test `/health` endpoint
- [ ] Test `/debug/cors` endpoint
- [ ] Confirm the application domain is configured in Coolify

## 🔗 Important URLs

- Coolify Dashboard: your OVH-hosted Coolify URL

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| "Missing environment variables" | Add the required variables in Coolify |
| "Port already in use" | Confirm only one app process is configured |
| CORS errors | Add frontend domain to ALLOWED_ORIGINS |
| Build fails | Check Railway logs, verify package.json |

## 📞 Where to Get Credentials

- **Supabase**: https://app.supabase.com/project/_/settings/api
- **Cloudflare R2**: Cloudflare Dashboard → R2 → Manage R2 API Tokens
