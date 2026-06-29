create table if not exists emotion_timeline (
  id text primary key,
  draft_id text,
  story_dna_id text,
  source_type text,
  source_reference text not null unique,
  emotion_0 text,
  emotion_10 text,
  emotion_20 text,
  emotion_30 text,
  emotion_40 text,
  emotion_50 text,
  emotion_60 text,
  emotion_70 text,
  emotion_80 text,
  emotion_90 text,
  emotion_100 text,
  peak_emotion text,
  peak_position integer not null default 70,
  emotion_volatility integer not null default 0,
  slow_build_score integer not null default 0,
  fast_build_score integer not null default 0,
  ending_satisfaction integer not null default 0,
  reader_recovery integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists emotion_timeline_draft_idx on emotion_timeline (draft_id);
create index if not exists emotion_timeline_story_dna_idx on emotion_timeline (story_dna_id);
create index if not exists emotion_timeline_source_type_idx on emotion_timeline (source_type);
create index if not exists emotion_timeline_peak_emotion_idx on emotion_timeline (peak_emotion);
create index if not exists emotion_timeline_peak_position_idx on emotion_timeline (peak_position);
create index if not exists emotion_timeline_created_at_idx on emotion_timeline (created_at desc);
