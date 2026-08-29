-- Phase 11: retain read-only source coverage measurements so data-source decisions
-- can be based on a growing multi-course evidence set.

create table if not exists public.course_source_coverage_scans (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  source_provider text not null,
  source_license text,
  scanned_at timestamptz not null default now(),
  source_score integer not null check (source_score between 0 and 100),
  approved_score integer not null check (approved_score between 0 and 100),
  suggestions_count integer not null default 0 check (suggestions_count >= 0),
  directly_assigned integer not null default 0 check (directly_assigned >= 0),
  inferred_assignments integer not null default 0 check (inferred_assignments >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  gap_count integer not null default 0 check (gap_count >= 0),
  source_feature_counts jsonb not null default '{}'::jsonb,
  hole_summary jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists course_source_coverage_scans_course_scanned_idx
  on public.course_source_coverage_scans(course_id, scanned_at desc);

alter table public.course_source_coverage_scans enable row level security;

drop policy if exists "Authenticated users can read source coverage scans" on public.course_source_coverage_scans;
create policy "Authenticated users can read source coverage scans"
  on public.course_source_coverage_scans for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create source coverage scans" on public.course_source_coverage_scans;
create policy "Authenticated users can create source coverage scans"
  on public.course_source_coverage_scans for insert
  to authenticated
  with check (auth.uid() = created_by or created_by is null);
