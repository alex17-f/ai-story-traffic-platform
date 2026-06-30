create table if not exists editorial_reviews (
  id text primary key,
  draft_id text not null,
  hook_score integer not null default 0,
  opening_score integer not null default 0,
  emotion_score integer not null default 0,
  dialogue_score integer not null default 0,
  rhythm_score integer not null default 0,
  twist_score integer not null default 0,
  ending_score integer not null default 0,
  human_score integer not null default 0,
  facebook_score integer not null default 0,
  originality_score integer not null default 0,
  editorial_score integer not null default 0,
  reader_retention_prediction integer not null default 0,
  comment_prediction integer not null default 0,
  share_prediction integer not null default 0,
  publication_readiness text not null default 'needs_edit',
  strengths_json jsonb not null default '[]'::jsonb,
  weaknesses_json jsonb not null default '[]'::jsonb,
  improvement_plan_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists editorial_reviews_draft_idx on editorial_reviews (draft_id);
create index if not exists editorial_reviews_score_idx on editorial_reviews (editorial_score desc);
create index if not exists editorial_reviews_readiness_idx on editorial_reviews (publication_readiness);
create index if not exists editorial_reviews_created_at_idx on editorial_reviews (created_at desc);
