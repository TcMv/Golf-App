-- Phase 7: operational metadata and audit history for course administration.

alter table public.courses
  add column if not exists last_verified_at timestamptz,
  add column if not exists verification_notes text;

create table if not exists public.course_admin_events (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists course_admin_events_course_created_idx
  on public.course_admin_events (course_id, created_at desc);

alter table public.course_admin_events enable row level security;

drop policy if exists "Authenticated users can read course admin events" on public.course_admin_events;
create policy "Authenticated users can read course admin events"
  on public.course_admin_events for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create course admin events" on public.course_admin_events;
create policy "Authenticated users can create course admin events"
  on public.course_admin_events for insert
  to authenticated
  with check (actor_user_id is null or actor_user_id = auth.uid());

create or replace function public.mark_course_verified(
  p_course_id uuid,
  p_notes text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.courses
  set last_verified_at = now(),
      verification_notes = nullif(trim(p_notes), '')
  where id = p_course_id;

  if not found then
    raise exception 'Course not found';
  end if;

  insert into public.course_admin_events (course_id, event_type, actor_user_id, details)
  values (
    p_course_id,
    'course_verified',
    auth.uid(),
    jsonb_build_object('notes', nullif(trim(p_notes), ''))
  );
end;
$$;

grant execute on function public.mark_course_verified(uuid, text) to authenticated;
