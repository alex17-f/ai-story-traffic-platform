alter table stories add column if not exists source_draft_id text;
alter table stories add column if not exists package_id text;
alter table stories add column if not exists campaign_id text;
create index if not exists stories_source_draft_idx on stories (source_draft_id);

create table if not exists visual_concepts (
  id text primary key,
  draft_id text,
  package_id text,
  concept_type text not null,
  title text not null,
  description text,
  prompt text not null,
  ctr_score integer not null default 0,
  emotion_score integer not null default 0,
  realism_score integer not null default 0,
  risk_score integer not null default 0,
  rank integer not null default 0,
  status text not null default 'draft',
  critic_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists visual_quality_reviews (
  id text primary key,
  visual_concept_id text not null,
  package_id text,
  draft_id text,
  visual_quality_score integer not null default 0,
  artifact_risk text not null default 'medium',
  thumbnail_strength integer not null default 0,
  emotion_clarity integer not null default 0,
  recommendation text not null default 'needs_prompt_edit',
  issues_json jsonb not null default '[]'::jsonb,
  suggestions_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table publishing_packages add column if not exists story_id text;
alter table publishing_packages add column if not exists campaign_id text;
alter table publishing_packages add column if not exists tracked_url text;
alter table publishing_packages add column if not exists facebook_fragment text;
alter table publishing_packages add column if not exists comment_text text;
alter table publishing_packages add column if not exists fragment_metrics jsonb not null default '{}'::jsonb;
alter table publishing_packages add column if not exists telegram_delivery jsonb not null default '{}'::jsonb;
create index if not exists publishing_packages_story_idx on publishing_packages (story_id);
create unique index if not exists publishing_packages_campaign_idx
  on publishing_packages (campaign_id)
  where campaign_id is not null and campaign_id <> '';

alter table prepublish_previews add column if not exists visual_concept_id text;
alter table prepublish_previews add column if not exists preferred_image_prompt text;
alter table prepublish_previews add column if not exists visual_quality_review_id text;
alter table prepublish_previews add column if not exists visual_quality_score integer not null default 0;
alter table prepublish_previews add column if not exists visual_quality_recommendation text;
alter table prepublish_previews add column if not exists story_id text;
alter table prepublish_previews add column if not exists tracked_url text;
alter table prepublish_previews add column if not exists comment_text text;
alter table prepublish_previews add column if not exists facebook_fragment text;
alter table prepublish_previews add column if not exists fragment_metrics jsonb not null default '{}'::jsonb;

create table if not exists website_events (
  id text primary key,
  story_id text,
  package_id text,
  campaign_id text,
  event_type text not null,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists website_events_story_idx on website_events (story_id);
create index if not exists website_events_package_idx on website_events (package_id);
create index if not exists website_events_campaign_idx on website_events (campaign_id);
create index if not exists website_events_type_idx on website_events (event_type);
create index if not exists website_events_created_at_idx on website_events (created_at desc);

create table if not exists telegram_updates (
  update_id bigint primary key,
  event_type text,
  status text not null default 'processing',
  error_message text,
  processed_at timestamptz not null default now()
);
create index if not exists telegram_updates_status_idx on telegram_updates (status);
create index if not exists telegram_updates_processed_at_idx on telegram_updates (processed_at desc);
