alter table generated_stories add column if not exists parent_draft_id text;
alter table generated_stories add column if not exists revision_type text;
alter table generated_stories add column if not exists revision_number integer not null default 0;
alter table generated_stories add column if not exists rewrite_reason text;
alter table generated_stories add column if not exists previous_editorial_score integer not null default 0;
alter table generated_stories add column if not exists expected_editorial_score integer not null default 0;

create index if not exists generated_stories_parent_draft_idx on generated_stories (parent_draft_id);
create index if not exists generated_stories_revision_type_idx on generated_stories (revision_type);
