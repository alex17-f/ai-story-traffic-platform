create table if not exists stories (
  id text primary key,
  title text not null,
  slug text not null unique,
  short_code text unique,
  category text not null,
  image text,
  facebook_text text not null,
  website_text text not null,
  comment_text text,
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'scheduled', 'published', 'rejected')),
  views integer not null default 0,
  clicks integer not null default 0,
  ai_assistant_notes text,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stories_status_created_at_idx on stories (status, created_at desc);
create index if not exists stories_category_idx on stories (category);
create index if not exists stories_short_code_idx on stories (short_code);

alter table stories drop constraint if exists stories_status_check;
alter table stories add constraint stories_status_check check (status in ('draft', 'review', 'approved', 'scheduled', 'published', 'rejected'));

create table if not exists facebook_posts (
  id text primary key,
  facebook_post_id text not null unique,
  message text,
  permalink_url text,
  published_at timestamptz,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  shares_count integer not null default 0,
  reach_count integer not null default 0,
  link_clicks_count integer not null default 0,
  total_score integer not null default 0,
  image_url text,
  detected_topic text,
  detected_emotion text,
  image_analysis jsonb not null default '{}'::jsonb,
  text_length integer not null default 0,
  paragraphs_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists facebook_posts_total_score_idx on facebook_posts (total_score desc);
create index if not exists facebook_posts_published_at_idx on facebook_posts (published_at desc);
create index if not exists facebook_posts_detected_topic_idx on facebook_posts (detected_topic);
create index if not exists facebook_posts_detected_emotion_idx on facebook_posts (detected_emotion);

alter table facebook_posts add column if not exists image_url text;
alter table facebook_posts add column if not exists detected_topic text;
alter table facebook_posts add column if not exists detected_emotion text;
alter table facebook_posts add column if not exists image_analysis jsonb not null default '{}'::jsonb;
alter table facebook_posts add column if not exists text_length integer not null default 0;
alter table facebook_posts add column if not exists paragraphs_count integer not null default 0;

create table if not exists competitors (
  id text primary key,
  name text not null,
  url text not null unique,
  category text,
  followers_count integer not null default 0,
  average_likes integer not null default 0,
  average_comments integer not null default 0,
  average_shares integer not null default 0,
  popular_topics jsonb not null default '[]'::jsonb,
  popular_image_types jsonb not null default '[]'::jsonb,
  posting_frequency text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists competitors_followers_count_idx on competitors (followers_count desc);

create table if not exists project_brain (
  id text primary key,
  best_topics jsonb not null default '[]'::jsonb,
  best_images jsonb not null default '[]'::jsonb,
  best_times jsonb not null default '[]'::jsonb,
  best_titles jsonb not null default '[]'::jsonb,
  best_emotions jsonb not null default '[]'::jsonb,
  best_publications jsonb not null default '[]'::jsonb,
  best_ctr jsonb not null default '[]'::jsonb,
  best_lengths jsonb not null default '[]'::jsonb,
  best_story_formats jsonb not null default '[]'::jsonb,
  successful_stories jsonb not null default '[]'::jsonb,
  unsuccessful_stories jsonb not null default '[]'::jsonb,
  audience_analytics jsonb not null default '{}'::jsonb,
  competitor_analytics jsonb not null default '{}'::jsonb,
  internet_research jsonb not null default '{}'::jsonb,
  publication_statistics jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  work_history jsonb not null default '[]'::jsonb,
  autopilot_runs jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_brain add column if not exists best_emotions jsonb not null default '[]'::jsonb;
alter table project_brain add column if not exists best_titles jsonb not null default '[]'::jsonb;
alter table project_brain add column if not exists best_publications jsonb not null default '[]'::jsonb;
alter table project_brain add column if not exists best_ctr jsonb not null default '[]'::jsonb;
alter table project_brain add column if not exists best_lengths jsonb not null default '[]'::jsonb;
alter table project_brain add column if not exists best_story_formats jsonb not null default '[]'::jsonb;
alter table project_brain add column if not exists successful_stories jsonb not null default '[]'::jsonb;
alter table project_brain add column if not exists unsuccessful_stories jsonb not null default '[]'::jsonb;
alter table project_brain add column if not exists audience_analytics jsonb not null default '{}'::jsonb;
alter table project_brain add column if not exists competitor_analytics jsonb not null default '{}'::jsonb;
alter table project_brain add column if not exists internet_research jsonb not null default '{}'::jsonb;
alter table project_brain add column if not exists publication_statistics jsonb not null default '{}'::jsonb;
alter table project_brain add column if not exists data_quality jsonb not null default '{}'::jsonb;

create table if not exists facebook_connection (
  id text primary key,
  connection jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
