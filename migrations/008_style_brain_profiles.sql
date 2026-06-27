create table if not exists style_brain_profiles (
  id text primary key,
  source_type text not null,
  source_reference text not null unique,
  hook_strength integer not null default 0,
  opening_style text,
  dialogue_density integer not null default 0,
  sentence_rhythm text,
  paragraph_rhythm text,
  emotional_intensity integer not null default 0,
  emotion_curve jsonb not null default '[]'::jsonb,
  conflict_speed integer not null default 0,
  twist_strength integer not null default 0,
  ending_strength integer not null default 0,
  human_realism_score integer not null default 0,
  boring_risk integer not null default 0,
  facebook_readability_score integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists style_brain_profiles_source_type_idx on style_brain_profiles (source_type);
create index if not exists style_brain_profiles_hook_strength_idx on style_brain_profiles (hook_strength desc);
create index if not exists style_brain_profiles_human_realism_idx on style_brain_profiles (human_realism_score desc);
create index if not exists style_brain_profiles_boring_risk_idx on style_brain_profiles (boring_risk asc);
create index if not exists style_brain_profiles_readability_idx on style_brain_profiles (facebook_readability_score desc);
