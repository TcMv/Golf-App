-- Phase 6: keep machine-generated mapping suggestions separate from approved course data.

create table if not exists public.course_mapping_suggestions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  hole_number integer not null,
  feature_type text not null check (feature_type in (
    'tee', 'green_front', 'green_centre', 'green_back',
    'green', 'fairway', 'tee_box', 'fairway_centreline',
    'bunker', 'water', 'trees', 'ob', 'red_zone'
  )),
  geometry_type text not null check (geometry_type in ('point', 'line', 'polygon')),
  coordinates jsonb not null,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_provider text,
  source_reference text,
  source_license text,
  metadata jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending' check (review_status in ('pending', 'accepted', 'rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_mapping_suggestions_queue_idx
  on public.course_mapping_suggestions (course_id, review_status, hole_number);

alter table public.course_mapping_suggestions enable row level security;

-- Match the current authenticated-admin tooling posture used by the course admin screens.
drop policy if exists "Authenticated users can read course mapping suggestions" on public.course_mapping_suggestions;
create policy "Authenticated users can read course mapping suggestions"
  on public.course_mapping_suggestions for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create course mapping suggestions" on public.course_mapping_suggestions;
create policy "Authenticated users can create course mapping suggestions"
  on public.course_mapping_suggestions for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update course mapping suggestions" on public.course_mapping_suggestions;
create policy "Authenticated users can update course mapping suggestions"
  on public.course_mapping_suggestions for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete course mapping suggestions" on public.course_mapping_suggestions;
create policy "Authenticated users can delete course mapping suggestions"
  on public.course_mapping_suggestions for delete
  to authenticated
  using (true);
