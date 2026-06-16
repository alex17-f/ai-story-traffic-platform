# AI Story Traffic Platform — Publish Plan

## Status

The project is prepared for public deployment, but production requires external accounts and secrets that must be entered only in GitHub, Vercel, Meta Developers, Telegram, or PostgreSQL dashboards.

Do not paste real secrets into chat.

## Automatic Work Already Done

- Vercel serverless entrypoint added: `api/index.js`.
- Vercel routing added: `vercel.json`.
- Local server mode preserved: `npm start`.
- Facebook OAuth setup page added: `/facebook-setup-wizard`.
- Facebook Connect page preserved: `/facebook-connect`.
- Real Data Layer added: `/api/real-data-layer`.
- JSON writes are skipped on Vercel; production must use PostgreSQL.
- Facebook OAuth connection can persist in PostgreSQL through `facebook_connection`.
- `.env` is ignored by git.

## Required Production Services

1. GitHub repository.
2. Vercel project connected to GitHub.
3. PostgreSQL database, for example Neon, Supabase, Railway, Render, or Vercel Marketplace Postgres.
4. Meta Developers app with Facebook Login.
5. Optional Telegram bot.

## Deployment Flow

1. Push the project to GitHub.
2. Import the GitHub repository into Vercel.
3. Add environment variables in Vercel.
4. Run database migrations with `npm run db:migrate`.
5. Add production OAuth Redirect URI in Meta Developers:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/auth/facebook/callback
```

6. Open:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/facebook-setup-wizard
```

7. Check Meta Config.
8. Connect Facebook.
9. Load Page Posts.
10. Open Audience Insights and AI Autopilot.

## Honest Data Rules

- If Facebook is not connected, the system shows demo/local data.
- If PostgreSQL is not connected, production persistence is not guaranteed.
- If competitors are not added, Competitor Analyst shows missing data.
- If Telegram is not connected, reports are not sent.

