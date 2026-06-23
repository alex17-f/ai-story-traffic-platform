create table if not exists publishing_packages (
  id text primary key,
  draft_id text not null,
  image_prompt_id text,
  schedule_id text,
  status text not null default 'review',
  publish_allowed boolean not null default false,
  approval_required boolean not null default true,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists publishing_packages_status_idx on publishing_packages (status);
create index if not exists publishing_packages_created_at_idx on publishing_packages (created_at desc);
create index if not exists publishing_packages_draft_idx on publishing_packages (draft_id);
