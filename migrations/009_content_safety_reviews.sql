create table if not exists content_safety_reviews (
  id text primary key,
  draft_id text,
  package_id text,
  safety_score integer not null default 0,
  originality_score integer not null default 0,
  facebook_risk text not null default 'low',
  quality_risk text not null default 'low',
  policy_risk text not null default 'low',
  recommendation text not null default 'needs_edit',
  issues_json jsonb not null default '[]'::jsonb,
  suggestions_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists content_safety_reviews_draft_idx on content_safety_reviews (draft_id);
create index if not exists content_safety_reviews_package_idx on content_safety_reviews (package_id);
create index if not exists content_safety_reviews_recommendation_idx on content_safety_reviews (recommendation);
create index if not exists content_safety_reviews_safety_score_idx on content_safety_reviews (safety_score desc);
create index if not exists content_safety_reviews_created_at_idx on content_safety_reviews (created_at desc);
