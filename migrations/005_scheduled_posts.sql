create table if not exists scheduled_posts (
  id text primary key,
  draft_id text not null,
  image_prompt_id text,
  scheduled_time timestamptz not null,
  theme text,
  emotion text,
  status text not null default 'draft',
  title text,
  rhythm_step text,
  publish_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_posts_time_idx on scheduled_posts (scheduled_time asc);
create index if not exists scheduled_posts_status_idx on scheduled_posts (status);
create index if not exists scheduled_posts_draft_idx on scheduled_posts (draft_id);
