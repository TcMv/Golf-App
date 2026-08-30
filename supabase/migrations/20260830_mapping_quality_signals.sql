-- Phase 12: retain lightweight quality signals when a reviewer corrects a
-- machine suggestion before accepting/rejecting it. This does not change the
-- approved course geometry model or the review boundary.

alter table public.course_mapping_suggestions
  add column if not exists manually_edited boolean not null default false,
  add column if not exists edit_count integer not null default 0 check (edit_count >= 0),
  add column if not exists last_edited_at timestamptz;

create or replace function public.track_mapping_suggestion_manual_edit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- The admin correction UI explicitly sets manually_edited + last_edited_at.
  -- Automated OSM refreshes update coordinates without those fields, so they
  -- are intentionally excluded from this quality signal.
  if new.manually_edited = true
     and new.last_edited_at is distinct from old.last_edited_at
     and new.coordinates is distinct from old.coordinates then
    new.edit_count := old.edit_count + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists track_mapping_suggestion_manual_edit on public.course_mapping_suggestions;
create trigger track_mapping_suggestion_manual_edit
before update on public.course_mapping_suggestions
for each row execute function public.track_mapping_suggestion_manual_edit();

create index if not exists course_mapping_suggestions_quality_idx
  on public.course_mapping_suggestions(source_provider, review_status, feature_type);
