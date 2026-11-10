# Coolify Deployment — Quick Reference

## Automatic database migrations

The backend Docker image runs `npm run migrate` before `npm start`. On each deployment it applies only new files in `database/migrations/`, records them in `schema_migrations`, and then starts the app. Applied SQL files must not be edited; create a new numbered file for every later change. If a migration fails, the container exits and the app does not start.

In Coolify, configure the application to build from the **repository root** and use **`/backend/Dockerfile`** as the Dockerfile path. Keep `DATABASE_URL` set to the PostgreSQL service reachable from the backend container. No SQL paste or manual migration command is needed for these incremental changes.

The current migrations add reusable course modules, interactive quiz content, and the `learning_resources` table for lesson/live-session practice files. Coolify applies pending migration files before starting the app. Back up the database before deployment.

This does not initialize a brand-new empty PostgreSQL database. The base schema in `database/schema_postgres.sql` must already have been installed once. Back up the database before the first deployment containing migrations.

## R2 browser uploads

The admin uploads lesson documents, live replay videos, and practice files directly to the private R2 bucket using short-lived signed URLs. Configure the bucket CORS policy to allow `PUT` from your exact Synta site origin and allow the `Content-Type` request header. The origin must match the address in the browser exactly, including `https://` and any `www` subdomain. Practice files support Python, HTML, CSS, JavaScript, JSON, TXT, and ZIP (25 MB per file). Example policy values: `AllowedOrigins: ["https://your-site-domain"]`, `AllowedMethods: ["PUT"]`, `AllowedHeaders: ["Content-Type"]`, `ExposeHeaders: ["ETag"]`, `MaxAgeSeconds: 3600`. Replace the example origin with the production domain (and add the admin preview domain if you use one). A browser `Failed to fetch` during the R2 step usually means this CORS rule is missing or the origin/header does not match; the app now reports that step explicitly.

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
ALLOWED_ORIGINS=https://syntaacademy.tn,https://www.syntaacademy.tn
GOOGLE_CLIENT_ID=
NODE_ENV=production
```

## Deploy checklist

### Google sign-in

Set `GOOGLE_CLIENT_ID` in the Coolify app's runtime environment to the Google OAuth **Web application** client ID. The same ID is rendered into the login and registration pages and used to verify the returned token. In Google Cloud, add each production origin that actually serves those pages under **Authorized JavaScript origins**. Add the matching full URL ending in `/api/auth/google/callback` under **Authorized redirect URIs** for iPhone and iPad. The origin and callback must use the same hostname the learner sees, including `www` if applicable. The Google schema migration runs during the normal Coolify deploy.

### Security remediation rollout

1. Use an isolated staging app and test database. Run `npm test` inside `backend/`. Tests use synthetic accounts and external-service doubles. Validate migration and concurrency against staging PostgreSQL with separate connections before release.
2. Verify runtime `JWT_SECRET`, `RESEND_API_KEY` and `APP_URL`. Use at least 32 random bytes for the JWT signing secret. `APP_URL` must be the canonical HTTPS origin used by learners opening placement email links. Verify the Resend sender domain.
3. Set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops reaching Express. Its default is zero. Avoid direct public access to Express when trusting proxy headers. Current authentication limits are per process; multiple replicas need a shared limiter.
4. On an authorized release, back up PostgreSQL and deploy the image with migration `202611100003_unique_active_offer_payments.sql`. It adds a partial unique index using existing columns, preserves historical rows and runs before app startup. Replace all older application instances together so they cannot continue using the insecure checkout and activation paths.
5. Test a new placement signup, email confirmation, quiz and activation. Confirm an existing account retains its password, repeated/expired links fail, and ordinary login and Google login still work. Older UUID-only placement sessions must restart using an email link.
6. Test wallet-funded course checkout, simultaneous same-offer requests, overlapping offers and a declined purchase. Verify database balance, ledger rows, independent offer grants and live/replay access. Admin installment enrollment should create one `admin_authorized` grant.
7. Cancel one recurring date and verify another date still opens. Cancel the remaining series. Simulate a Zoom timeout and retry after a provider deletion followed by an interrupted database commit. Look for sustained 429, 409, 500 or 502 responses and email delivery failures.

The existing Zoom meeting type is recurring without fixed times and has no stored occurrence IDs. Cancelling one Synta date hides that date and preserves the shared meeting for other dates. Previously shared join links remain usable while that meeting exists. The admin host button now uses an authenticated page redirect; raw host URLs are omitted from API JSON.

Historical overlapping purchases may lack a reliable offer identifier. Review them against operator records before issuing compensating grants or refunds. No automatic historical balance changes are included. Refunded, cancelled or expired grants must use the matching payment status; review course enrollment expiry separately when other valid offers share a course.

Existing access JWTs remain valid until expiry after a password change. An approved `JWT_SECRET` rotation invalidates sessions and pending placement links if incident review requires it. Expired course enrollments and ongoing offer grants require an operator decision for renewal; duplicate checkout does not charge for an automatic renewal.

Retain the new payment records and migration during rollback. An older application image loses the independent offer-grant behavior and restores the vulnerabilities. Prefer a forward patch or a maintenance window over serving that image to learners.

### Deployment checks

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
