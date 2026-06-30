alter table generated_stories add column if not exists second_pass_used boolean not null default false;
alter table generated_stories add column if not exists final_editorial_score integer not null default 0;
alter table generated_stories add column if not exists final_safety_recommendation text;

create index if not exists generated_stories_second_pass_idx on generated_stories (second_pass_used);
