# Meta Facebook App Checklist

## Safety Rules

- Do not share your Facebook password.
- Do not paste real tokens into chat.
- Do not commit `.env`.
- Automatic publishing is not enabled.
- The app currently requests read/analysis permissions only.

## Required Meta App Settings

Open Meta Developers:

```text
https://developers.facebook.com/apps/
```

Create or open your app.

## Required Product

Add **Facebook Login for Business**.

Create a Business Login configuration with these read-only permissions:

- `pages_show_list`
- `pages_read_engagement`
- `read_insights`

Copy the Configuration ID into:

```env
FACEBOOK_LOGIN_CONFIG_ID=
```

If this is missing, Meta can show `Invalid Scopes` for Page permissions.

## OAuth Redirect URI

Local development:

```text
http://127.0.0.1:4173/auth/facebook/callback
```

Production on Vercel:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/auth/facebook/callback
```

Add the exact URI in Facebook Login settings as a Valid OAuth Redirect URI.

## Environment Variables

Local `.env`:

```env
META_APP_ID=
META_APP_SECRET=
FACEBOOK_REDIRECT_URI=http://127.0.0.1:4173/auth/facebook/callback
FACEBOOK_LOGIN_CONFIG_ID=
```

Vercel:

```env
META_APP_ID=
META_APP_SECRET=
FACEBOOK_REDIRECT_URI=https://YOUR-VERCEL-DOMAIN.vercel.app/auth/facebook/callback
FACEBOOK_LOGIN_CONFIG_ID=
```

## Permissions Used

- `pages_show_list`
- `pages_read_engagement`
- `read_insights`

These are for reading page data and insights. Publishing permissions are not requested.

## Test Flow

1. Open `/facebook-setup-wizard`.
2. Click `Check Meta Config`.
3. Click `Test OAuth Redirect`.
4. Click `Connect Facebook`.
5. Complete official Facebook Login yourself.
6. Select the Page.
7. Click `Load Page Posts`.
8. Open `/audience-insights`.
