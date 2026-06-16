# Security Audit

Use this checklist before pushing to GitHub or deploying to production.

## Local Checks

- `.env` exists only locally.
- `.env` and `.env.*` are ignored by Git.
- `.env.example` is safe to commit.
- `data/facebook_connection.local.json` is ignored by Git.
- `DATABASE_URL` is stored only in local or hosting environment variables.
- `META_APP_SECRET` is stored only in local or hosting environment variables.
- `FACEBOOK_PAGE_ACCESS_TOKEN` is stored only in local or hosting environment variables.
- `BOT_TOKEN` and `CHAT_ID` are stored only in local or hosting environment variables.

## Built-in Endpoint

Open:

`/api/security-audit`

The endpoint returns only boolean status and warnings. It never returns secret values.

## Production Rules

- Facebook is read-only at this stage.
- Telegram approval only marks stories as approved.
- No automatic Facebook publishing is enabled.
- Publishing must remain a separate explicit user-approved action.

## Deployment Variables

Set these in Vercel or the chosen host:

```env
DATABASE_URL=
META_APP_ID=
META_APP_SECRET=
FACEBOOK_REDIRECT_URI=
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
FACEBOOK_SYNC_MAX_PAGES=25
BOT_TOKEN=
CHAT_ID=
```

For local Facebook OAuth:

`http://127.0.0.1:4173/auth/facebook/callback`

For production Facebook OAuth, use the deployed HTTPS callback:

`https://YOUR-DOMAIN/auth/facebook/callback`
