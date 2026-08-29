-- Apply or reject one mapping suggestion atomically.
-- The function runs as the caller (security invoker), so existing table RLS still applies.

create or replace function public.review_course_mapping_suggestion(
  p_suggestion_id uuid,
  p_decision text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.course_mapping_suggestions%rowtype;
  point jsonb;
  hazard_label text;
begin
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Decision must be accepted or rejected';
  end if;

  select * into s
  from public.course_mapping_suggestions
  where id = p_suggestion_id
  for update;

  if not found then
    raise exception 'Mapping suggestion not found';
  end if;

  if s.review_status <> 'pending' then
    raise exception 'Mapping suggestion has already been reviewed';
  end if;

  if p_decision = 'accepted' then
    if nullif(trim(s.source_license), '') is null then
      raise exception 'Source license must be recorded before approval';
    end if;

    if s.feature_type in ('tee', 'green_front', 'green_centre', 'green_back') then
      if s.geometry_type <> 'point' or jsonb_typeof(s.coordinates) <> 'array' or jsonb_array_length(s.coordinates) <> 1 then
        raise exception 'Point suggestion requires exactly one coordinate';
      end if;
      point := s.coordinates -> 0;

      if s.feature_type = 'tee' then
        update public.holes
          set tee_lat = (point ->> 'lat')::double precision,
              tee_lng = (point ->> 'lng')::double precision
        where course_id = s.course_id and number = s.hole_number;
      elsif s.feature_type = 'green_front' then
        update public.holes
          set green_front_lat = (point ->> 'lat')::double precision,
              green_front_lng = (point ->> 'lng')::double precision
        where course_id = s.course_id and number = s.hole_number;
      elsif s.feature_type = 'green_centre' then
        update public.holes
          set green_mid_lat = (point ->> 'lat')::double precision,
              green_mid_lng = (point ->> 'lng')::double precision
        where course_id = s.course_id and number = s.hole_number;
      else
        update public.holes
          set green_back_lat = (point ->> 'lat')::double precision,
              green_back_lng = (point ->> 'lng')::double precision
        where course_id = s.course_id and number = s.hole_number;
      end if;

      if not found then
        raise exception 'Target hole not found';
      end if;

    elsif s.feature_type in ('green', 'fairway', 'tee_box', 'fairway_centreline') then
      insert into public.hole_zones (course_id, hole_number, zone_type, coordinates)
      values (s.course_id, s.hole_number, s.feature_type, s.coordinates)
      on conflict (course_id, hole_number, zone_type)
      do update set coordinates = excluded.coordinates;

    elsif s.feature_type in ('bunker', 'water', 'trees', 'ob', 'red_zone') then
      hazard_label := coalesce(nullif(s.metadata ->> 'label', ''), 'Suggested ' || replace(s.feature_type, '_', ' '));
      insert into public.hazards (course_id, hole_number, hole_numbers, type, label, coordinates)
      values (s.course_id, s.hole_number, array[s.hole_number], s.feature_type, hazard_label, s.coordinates);

    else
      raise exception 'Unsupported mapping feature type: %', s.feature_type;
    end if;
  end if;

  update public.course_mapping_suggestions
  set review_status = p_decision,
      reviewed_at = now(),
      updated_at = now()
  where id = s.id;
end;
$$;

grant execute on function public.review_course_mapping_suggestion(uuid, text) to authenticated;
