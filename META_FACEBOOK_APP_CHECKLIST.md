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

Add the **Manage everything on your Page** use case. This is the Pages API use case that exposes Page permissions.

Inside that use case, customize **Facebook Login for Business** and create a configuration with these read-only permissions:

- `pages_show_list`
- `pages_read_engagement`
- `pages_read_user_content`
- `read_insights`

Copy the Configuration ID into:

```env
FACEBOOK_LOGIN_CONFIG_ID=
```

If this is missing, Meta can show `Invalid Scopes` for Page permissions.

If the current app only shows the use case **Authenticate and request data from users with Facebook Login**, and **Manage everything on your Page** is not available in Add use cases, create a new Meta app using the Pages API use case. A consumer login-only app cannot request these Page permissions.

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
- `pages_read_user_content`
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
