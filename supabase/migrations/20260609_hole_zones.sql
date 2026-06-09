-- Stores green and fairway polygon zones per hole.
-- One row per (course, hole, zone_type). Coordinates are [{lat, lng}] arrays.

create table if not exists hole_zones (
  id             uuid        primary key default gen_random_uuid(),
  course_id      uuid        not null references courses(id) on delete cascade,
  hole_number    integer     not null,
  zone_type      text        not null check (zone_type in ('green', 'fairway', 'tee_box')),
  coordinates    jsonb       not null default '[]',
  created_at     timestamptz not null default now(),

  unique (course_id, hole_number, zone_type)
);

create index if not exists hole_zones_course_idx on hole_zones (course_id, hole_number);

alter table hole_zones enable row level security;

-- Public read (mobile app fetches zones without auth context)
create policy "Public read hole_zones"
  on hole_zones for select using (true);

-- Authenticated users can write (admin UI signs in with Supabase auth)
create policy "Authenticated write hole_zones"
  on hole_zones for all using (auth.uid() is not null);
