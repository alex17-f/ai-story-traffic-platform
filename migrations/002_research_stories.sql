create table if not exists research_stories (
  id text primary key,
  title text not null,
  url text not null unique,
  source text,
  summary text,
  emotion text,
  keywords jsonb not null default '[]'::jsonb,
  viral_score integer not null default 0,
  similarity_score integer not null default 0,
  category text,
  emotional_intensity integer not null default 0,
  story_structure text,
  surprise_factor integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_stories_viral_score_idx on research_stories (viral_score desc);
create index if not exists research_stories_similarity_score_idx on research_stories (similarity_score desc);
create index if not exists research_stories_category_idx on research_stories (category);
