# AI Story Traffic Platform

MVP for Facebook traffic stories: reader site, admin panel, AI helper scaffolding, Facebook analytics, Audience Analyst, and Competitor Analyst.

## Production Guides

- `PUBLISH_PLAN.md`
- `GITHUB_SETUP.md`
- `VERCEL_DEPLOY.md`
- `META_FACEBOOK_APP_CHECKLIST.md`

## Storage

PostgreSQL is the primary production database when `DATABASE_URL` is set.

The old JSON files remain as backup/export files:

- `data/stories.json`
- `data/facebook_posts.json`
- `data/competitors.json`
- `data/project_brain.json`

If `DATABASE_URL` is missing, the app runs in JSON backup mode for local development.

## Environment

Copy `.env.example` to `.env` locally and fill values there:

```bash
DATABASE_URL=
META_APP_ID=
META_APP_SECRET=
FACEBOOK_REDIRECT_URI=http://127.0.0.1:4173/auth/facebook/callback
FACEBOOK_LOGIN_CONFIG_ID=
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
FACEBOOK_SYNC_MAX_PAGES=25
BOT_TOKEN=
CHAT_ID=
```

Never commit `.env`.

## Facebook Live Integration

Facebook Live is prepared for read-only historical analysis.

It can check the Page connection, load latest posts, refresh data, and run a historical sync through Graph API pagination. It stores posts, images, reactions, comments, shares, reach, link clicks, detected topics, emotions, image signals, and ranking data.

Automatic Facebook publishing is still disabled.

Use `FACEBOOK_SYNC_MAX_PAGES` to limit how many Graph API pages are loaded during historical sync.

## Facebook Connect OAuth

Open `/facebook-setup-wizard` first for step-by-step setup, then use `/facebook-connect` and click `Connect Facebook`.

In your Meta App settings, add this OAuth redirect URI for local development:

```text
http://127.0.0.1:4173/auth/facebook/callback
```

For Page permissions, the Meta app must include the **Manage everything on your Page** use case. Inside that use case, create a **Facebook Login for Business** configuration in Meta Developers and put its Configuration ID in `FACEBOOK_LOGIN_CONFIG_ID`. Without this Pages use case and Business Login configuration, Meta can reject `pages_show_list`, `pages_read_engagement`, and `read_insights` as invalid scopes.

The app only requests read-only Page permissions: `pages_show_list`, `pages_read_engagement`, and `read_insights`.

After login, Page access is stored locally in `data/facebook_connection.local.json`. This file is ignored by git and must not be shared.

## Telegram Control Center

Telegram is prepared as a private control center for notifications, review, approval, and analytics.

It does not publish anything automatically.

To enable it later, add `BOT_TOKEN` and `CHAT_ID` only to your local `.env` or hosting environment variables. Do not send real tokens in chat.

## Create PostgreSQL Database

For Vercel production, the easiest recommended option is **Neon Postgres through the Vercel Marketplace**. It attaches directly to the Vercel project and can create the required `DATABASE_URL` environment variable for Production/Preview/Development.

Other providers such as Supabase, Railway, Render, or a VPS PostgreSQL also work, but Neon is the lowest-friction path for this Vercel deployment.

Copy the pooled PostgreSQL connection string into `DATABASE_URL`.

For local PostgreSQL, it usually looks like:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/ai_story_traffic
DATABASE_SSL=false
```

For cloud PostgreSQL, keep SSL enabled. The app uses SSL by default unless `DATABASE_SSL=false`.

For Vercel + Neon, do not set `DATABASE_SSL=false`; leave SSL enabled.

## Vercel + Neon Setup

1. Open Vercel Dashboard.
2. Open the `ai-story-traffic-platform` project.
3. Go to **Storage** or **Marketplace**.
4. Choose **Neon Postgres**.
5. Create a new Neon database and connect it to the project.
6. Make sure Vercel adds `DATABASE_URL` to Production environment variables.
7. Redeploy the latest production deployment.
8. Open:

```text
https://ai-story-traffic-platform.vercel.app/api/storage-status
```

Expected result:

```json
{
  "database_url_present": true,
  "storage_mode": "postgres",
  "postgres_connected": true
}
```

On production startup, the app automatically runs the idempotent SQL migrations from `migrations/` before reading tables. You can still run `npm run db:migrate` manually for local databases or one-off verification.

## Install Dependencies

```bash
npm install
```

## Run Migrations

```bash
npm run db:migrate
```

This creates:

- `stories`
- `facebook_posts`
- `competitors`
- `project_brain`
- `facebook_connection`
- `research_stories`
- `story_dna`
- `generated_stories`
- `image_queue`
- `scheduled_posts`
- `publishing_packages`
- `style_brain_profiles`
- `content_safety_reviews`
- `emotion_timeline`

All migrations are written to be safe to rerun with `create table if not exists`, `alter table add column if not exists`, and `create index if not exists`.

## Check Storage Status

The production diagnostic endpoint is:

```text
GET /api/storage-status
```

It returns:

- `database_url_present`
- `storage_mode`
- `postgres_connected`
- `migrations_status`
- `tables_present`
- `current_counts`

It never returns the actual database URL or secrets.

## Import Old JSON Data

After migrations, import the existing JSON data:

```bash
npm run db:import-json
```

Safe migration flow:

1. Keep JSON files untouched.
2. Run database migrations.
3. Import JSON into PostgreSQL.
4. Start the app with `DATABASE_URL`.
5. Verify stories, Facebook posts, and competitors in the admin panel.
6. Keep JSON files as backup/export.

## Start

```bash
npm start
```

The app reads `PORT` from the hosting provider. Locally it defaults to `4173`.
