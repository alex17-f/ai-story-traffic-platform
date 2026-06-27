create table if not exists story_dna (
  id text primary key,
  source_type text not null default 'website',
  source_reference text not null unique,
  emotion text,
  main_theme text,
  secondary_theme text,
  hook_type text,
  conflict_type text,
  twist_type text,
  ending_type text,
  characters jsonb not null default '[]'::jsonb,
  age_group text,
  family_structure text,
  dialogue_density integer not null default 0,
  story_length text,
  emotion_curve jsonb not null default '[]'::jsonb,
  viral_score integer not null default 0,
  engagement_score integer not null default 0,
  comments_score integer not null default 0,
  shares_score integer not null default 0,
  originality_score integer not null default 100,
  structure_analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table story_dna add column if not exists structure_analysis jsonb not null default '{}'::jsonb;

create index if not exists story_dna_source_type_idx on story_dna (source_type);
create index if not exists story_dna_emotion_idx on story_dna (emotion);
create index if not exists story_dna_main_theme_idx on story_dna (main_theme);
create index if not exists story_dna_hook_type_idx on story_dna (hook_type);
create index if not exists story_dna_viral_score_idx on story_dna (viral_score desc);
