# Vercel Deploy Guide

## What Is Ready

- `api/index.js` exports the app as a Vercel serverless function.
- `vercel.json` routes all traffic to the app.
- `server.js` still runs locally with `npm start`.
- Production writes should use PostgreSQL through `DATABASE_URL`.

## Environment Variables

Add these in Vercel Project Settings -> Environment Variables:

```env
DATABASE_URL=
META_APP_ID=
META_APP_SECRET=
FACEBOOK_REDIRECT_URI=https://YOUR-VERCEL-DOMAIN.vercel.app/auth/facebook/callback
FACEBOOK_SYNC_MAX_PAGES=25
BOT_TOKEN=
CHAT_ID=
```

Optional fallback variables:

```env
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
```

## Important

Do not use local JSON files as the production database on Vercel. Vercel serverless file writes are not persistent.

Use PostgreSQL before real traffic.

## Deploy Steps

1. Push the project to GitHub.
2. Open https://vercel.com/new
3. Import the GitHub repository.
4. Add the environment variables.
5. Deploy.
6. Open the production URL.
7. Open `/facebook-setup-wizard`.
8. Use the production redirect URI in Meta Developers.

## Database Migration

Run migrations from your local machine after setting production `DATABASE_URL` locally:

```powershell
npm install
npm run db:migrate
npm run db:import-json
```

Then redeploy or refresh the Vercel site.

