-- Phase 7: audit edits to already-existing approved geometry without logging
-- bulk creation/import inserts. This deliberately focuses on UPDATE/DELETE paths.

create or replace function public.audit_hole_gps_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.tee_lat is distinct from new.tee_lat
     or old.tee_lng is distinct from new.tee_lng
     or old.green_front_lat is distinct from new.green_front_lat
     or old.green_front_lng is distinct from new.green_front_lng
     or old.green_mid_lat is distinct from new.green_mid_lat
     or old.green_mid_lng is distinct from new.green_mid_lng
     or old.green_back_lat is distinct from new.green_back_lat
     or old.green_back_lng is distinct from new.green_back_lng then
    insert into public.course_admin_events (course_id, event_type, actor_user_id, details)
    values (
      new.course_id,
      'hole_gps_changed',
      auth.uid(),
      jsonb_build_object('hole_number', new.number)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_hole_gps_edit on public.holes;
create trigger audit_hole_gps_edit
after update of tee_lat, tee_lng, green_front_lat, green_front_lng, green_mid_lat, green_mid_lng, green_back_lat, green_back_lng
on public.holes
for each row execute function public.audit_hole_gps_edit();

create or replace function public.audit_hole_zone_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.course_admin_events (course_id, event_type, actor_user_id, details)
  values (
    coalesce(new.course_id, old.course_id),
    case when tg_op = 'DELETE' then 'hole_zone_deleted' else 'hole_zone_changed' end,
    auth.uid(),
    jsonb_build_object(
      'hole_number', coalesce(new.hole_number, old.hole_number),
      'zone_type', coalesce(new.zone_type, old.zone_type)
    )
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_hole_zone_update on public.hole_zones;
create trigger audit_hole_zone_update
after update of coordinates, zone_type, hole_number on public.hole_zones
for each row execute function public.audit_hole_zone_edit();

drop trigger if exists audit_hole_zone_delete on public.hole_zones;
create trigger audit_hole_zone_delete
after delete on public.hole_zones
for each row execute function public.audit_hole_zone_edit();

create or replace function public.audit_hazard_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.course_admin_events (course_id, event_type, actor_user_id, details)
  values (
    coalesce(new.course_id, old.course_id),
    case when tg_op = 'DELETE' then 'hazard_deleted' else 'hazard_changed' end,
    auth.uid(),
    jsonb_build_object(
      'hazard_id', coalesce(new.id, old.id),
      'hole_number', coalesce(new.hole_number, old.hole_number),
      'hazard_type', coalesce(new.type, old.type)
    )
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_hazard_update on public.hazards;
create trigger audit_hazard_update
after update of coordinates, type, hole_number, hole_numbers, label on public.hazards
for each row execute function public.audit_hazard_edit();

drop trigger if exists audit_hazard_delete on public.hazards;
create trigger audit_hazard_delete
after delete on public.hazards
for each row execute function public.audit_hazard_edit();
