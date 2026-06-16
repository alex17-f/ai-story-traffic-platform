# Project Brain

Project Brain is the central knowledge layer for AI Story Traffic Platform.

It stores:

- best topics;
- best emotions;
- best images;
- best publishing times;
- best titles;
- successful stories;
- unsuccessful stories;
- audience analytics;
- competitor analytics;
- internet research signals;
- publication statistics.

Project Brain is refreshed from the Real Data Layer. The Real Data Layer connects local stories, Facebook posts, competitor data, website counters, Telegram status, and storage status.

## Approval Workflow

Stories should move through these statuses:

1. `draft`
2. `review`
3. `approved`
4. `scheduled`
5. `published`

Rejected stories are kept as `rejected` for audit history.

Telegram approval does not publish to Facebook. It only changes the local story status to `approved`.

## Safety Rules

- Never publish without explicit user approval.
- Never delete Facebook posts.
- Never change Facebook Page ownership.
- Never add administrators.
- Never expose tokens, secrets, OAuth credentials, or database URLs.
- Never commit `.env` or local OAuth connection files.

## Current Live Research Status

Internet Story Researcher is prepared as a data slot inside Project Brain, but live web research connectors are not enabled yet. Competitor and internet signals must be treated as trend inputs only. The system must create original stories and must not copy text, characters, endings, or images.
