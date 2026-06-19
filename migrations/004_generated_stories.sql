create table if not exists generated_stories (
  id text primary key,
  title text not null,
  category text,
  emotion text,
  length text,
  hook text,
  full_story text,
  moral text,
  image_prompt text,
  viral_prediction_score integer not null default 0,
  why_it_should_work text,
  research_signals jsonb not null default '[]'::jsonb,
  facebook_signals jsonb not null default '[]'::jsonb,
  status text not null default 'needs_approval',
  approval_required boolean not null default true,
  publish_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generated_stories_category_idx on generated_stories (category);
create index if not exists generated_stories_score_idx on generated_stories (viral_prediction_score desc);
create index if not exists generated_stories_created_at_idx on generated_stories (created_at desc);
