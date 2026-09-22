# Deploying to Railway

Pushing to GitHub and connecting Railway gets you most of the way there, but a
few one-time manual steps are required before the app actually works in
production. Do these in order.

## 1. Push to GitHub

```bash
git add -A
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

## 2. Create the Railway project

1. On [railway.app](https://railway.app), **New Project → Deploy from GitHub repo** → select this repo.
2. Railway auto-detects Next.js (via Nixpacks) and will try to build immediately — it will fail until you finish steps 3–4, and that's expected.

## 3. Add a Postgres database

1. In the project, **New → Database → Add PostgreSQL**.
2. Open your **app service** (not the Postgres one) → **Variables** tab → **New Variable → Add Reference** → pick the Postgres service's `DATABASE_URL`.
   - This is the one step that isn't automatic: the app won't see the database until you add this reference.

## 4. Set the app's environment variables

Still in the app service's **Variables** tab, add:

| Variable | Value |
|---|---|
| `JWT_SECRET` | A long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `SEED_USER1_USERNAME` | e.g. `Yan_W` |
| `SEED_USER1_PASSWORD` | Yan's login password |
| `SEED_USER1_NAME` | Display name, e.g. `Yan` |
| `SEED_USER2_USERNAME` | e.g. `Lynn_P` |
| `SEED_USER2_PASSWORD` | Lynn's login password |
| `SEED_USER2_NAME` | Display name, e.g. `Lynn` |

`DATABASE_URL` doesn't need to be added manually — that's the reference from step 3.

## 5. Deploy

Trigger a deploy (Railway does this automatically on push, or click **Deploy** in the dashboard). On success, Railway runs:

- `npm install` (which also runs `prisma generate` via `postinstall`)
- `npm run build` (`next build`)
- `npm run start` (`prisma migrate deploy` — creates the database tables — then starts the server)

If this succeeds, the tables exist but there are **no accounts yet** — that's step 6.

## 6. Seed the two accounts (one-time, after every fresh database)

This has to be run once against the production database. The easiest way is the Railway CLI from your machine:

```bash
npm install -g @railway/cli   # once
railway login
railway link                  # select this project when prompted
railway run npm run db:seed
```

That connects to the real production `DATABASE_URL` and creates (or updates) the two accounts from the env vars in step 4.

**To change a password later**: update `SEED_USER1_PASSWORD` (or `SEED_USER2_PASSWORD`) in Railway's Variables tab, then re-run `railway run npm run db:seed` — it updates the existing account rather than creating a duplicate.

## 7. Get your URL and log in

**Settings → Networking → Generate Domain** on the app service gives you a public `*.up.railway.app` URL (HTTPS by default, which the PWA needs). Open it, log in with either seeded account, and confirm both of you can see the dashboard.

## Installing as an app (PWA)

Once it's live on HTTPS:
- **iPhone (Safari)**: open the site → Share → Add to Home Screen.
- **Android (Chrome)**: open the site → menu (⋮) → Install app / Add to Home Screen.

## Notes

- **Only 2 accounts, ever.** There's no public sign-up page by design — accounts only come from the seed step above.
- **Push notifications aren't built yet.** The PWA shell (installable, offline app-shell caching) is in place so this can be added later without restructuring.
- **Local dev uses a different, throwaway database.** See the main README/CLAUDE notes for running `node scripts/dev-db.mjs` locally — none of that applies to Railway, which uses its own real Postgres.
