create table if not exists image_queue (
  id text primary key,
  draft_id text,
  generated_story_id text,
  story_idea_id text,
  story_title text,
  prompt text not null,
  style text,
  status text not null default 'needs_approval',
  generated_image_url text,
  visual_analysis jsonb not null default '{}'::jsonb,
  approval_required boolean not null default true,
  publish_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table image_queue add column if not exists draft_id text;
alter table image_queue add column if not exists generated_story_id text;
alter table image_queue add column if not exists story_idea_id text;
alter table image_queue add column if not exists visual_analysis jsonb not null default '{}'::jsonb;
alter table image_queue add column if not exists generated_image_url text;

create index if not exists image_queue_draft_idx on image_queue (draft_id);
create index if not exists image_queue_generated_story_idx on image_queue (generated_story_id);
create index if not exists image_queue_status_idx on image_queue (status);
create index if not exists image_queue_created_at_idx on image_queue (created_at desc);
