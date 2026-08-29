-- Phase 7: audit publication/mapping decisions and make repeated OSM scans idempotent.

alter table public.course_mapping_suggestions
  add column if not exists source_feature_key text,
  add column if not exists source_fingerprint text;

create index if not exists course_mapping_suggestions_source_key_idx
  on public.course_mapping_suggestions (course_id, source_provider, source_feature_key, created_at desc)
  where source_feature_key is not null;

create unique index if not exists course_mapping_suggestions_pending_source_key_uniq
  on public.course_mapping_suggestions (course_id, source_provider, source_feature_key)
  where review_status = 'pending' and source_feature_key is not null;

create or replace function public.prepare_mapping_suggestion_source_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  latest public.course_mapping_suggestions%rowtype;
  v_type text;
  v_id text;
begin
  -- OSM suggestions preserve the source element in metadata. Derive a stable
  -- identity per generated GolfCaddie feature, because one OSM green can
  -- produce both a green polygon and a green-centre point.
  if new.source_provider = 'OpenStreetMap' then
    v_type := nullif(new.metadata ->> 'osm_type', '');
    v_id := nullif(new.metadata ->> 'osm_id', '');
    if v_type is not null and v_id is not null then
      new.source_feature_key := v_type || ':' || v_id || ':' || new.feature_type;
      new.source_fingerprint := md5(
        coalesce(new.hole_number::text, '') || '|' ||
        coalesce(new.geometry_type, '') || '|' ||
        coalesce(new.coordinates::text, '') || '|' ||
        coalesce((new.metadata -> 'osm_tags')::text, '')
      );
    end if;
  end if;

  if new.source_feature_key is null then
    return new;
  end if;

  select * into latest
  from public.course_mapping_suggestions
  where course_id = new.course_id
    and source_provider = new.source_provider
    and source_feature_key = new.source_feature_key
  order by created_at desc
  limit 1;

  -- Exact same source feature already exists (pending or historical): no-op.
  if found and latest.source_fingerprint = new.source_fingerprint then
    return null;
  end if;

  -- If the source changed while a suggestion is still pending, refresh that
  -- pending suggestion rather than creating duplicate review work.
  if found and latest.review_status = 'pending' then
    update public.course_mapping_suggestions
    set hole_number = new.hole_number,
        geometry_type = new.geometry_type,
        coordinates = new.coordinates,
        confidence = new.confidence,
        source_reference = new.source_reference,
        source_license = new.source_license,
        source_fingerprint = new.source_fingerprint,
        metadata = new.metadata,
        updated_at = now()
    where id = latest.id;
    return null;
  end if;

  -- A changed feature that was previously accepted/rejected is a new pending
  -- update candidate, preserving the reviewed record as history.
  return new;
end;
$$;

drop trigger if exists prepare_mapping_suggestion_source_identity on public.course_mapping_suggestions;
create trigger prepare_mapping_suggestion_source_identity
before insert on public.course_mapping_suggestions
for each row execute function public.prepare_mapping_suggestion_source_identity();

-- Backfill source identities for OSM rows created before this migration.
update public.course_mapping_suggestions
set source_feature_key = (metadata ->> 'osm_type') || ':' || (metadata ->> 'osm_id') || ':' || feature_type,
    source_fingerprint = md5(
      coalesce(hole_number::text, '') || '|' ||
      coalesce(geometry_type, '') || '|' ||
      coalesce(coordinates::text, '') || '|' ||
      coalesce((metadata -> 'osm_tags')::text, '')
    )
where source_provider = 'OpenStreetMap'
  and source_feature_key is null
  and nullif(metadata ->> 'osm_type', '') is not null
  and nullif(metadata ->> 'osm_id', '') is not null;

create or replace function public.audit_course_publication_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.publication_status is distinct from new.publication_status then
    insert into public.course_admin_events (course_id, event_type, actor_user_id, details)
    values (
      new.id,
      'publication_status_changed',
      auth.uid(),
      jsonb_build_object('from', old.publication_status, 'to', new.publication_status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_course_publication_change on public.courses;
create trigger audit_course_publication_change
after update of publication_status on public.courses
for each row execute function public.audit_course_publication_change();

create or replace function public.audit_mapping_review_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.review_status is distinct from new.review_status
     and new.review_status in ('accepted', 'rejected') then
    insert into public.course_admin_events (course_id, event_type, actor_user_id, details)
    values (
      new.course_id,
      'mapping_suggestion_' || new.review_status,
      auth.uid(),
      jsonb_build_object(
        'suggestion_id', new.id,
        'hole_number', new.hole_number,
        'feature_type', new.feature_type,
        'source_provider', new.source_provider,
        'source_feature_key', new.source_feature_key,
        'confidence', new.confidence
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_mapping_review_change on public.course_mapping_suggestions;
create trigger audit_mapping_review_change
after update of review_status on public.course_mapping_suggestions
for each row execute function public.audit_mapping_review_change();
