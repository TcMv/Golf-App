-- Phase 12: retain a lightweight quality signal when a reviewer corrects a
-- machine suggestion before accepting/rejecting it. This does not change the
-- approved course geometry model or the review boundary.

alter table public.course_mapping_suggestions
  add column if not exists manually_edited boolean not null default false,
  add column if not exists edit_count integer not null default 0 check (edit_count >= 0),
  add column if not exists first_edited_at timestamptz;

create index if not exists course_mapping_suggestions_quality_idx
  on public.course_mapping_suggestions(source_provider, review_status, feature_type);
