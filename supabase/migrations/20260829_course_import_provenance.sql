-- Preserve source/licensing metadata for imported course data.
-- Nullable columns keep existing/manual courses backwards-compatible.

alter table public.courses
  add column if not exists source_provider text,
  add column if not exists source_id text,
  add column if not exists source_url text,
  add column if not exists source_retrieved_at timestamptz,
  add column if not exists source_license text,
  add column if not exists source_notes text;

create index if not exists courses_source_provider_idx
  on public.courses (source_provider);

create index if not exists courses_source_identity_idx
  on public.courses (source_provider, source_id)
  where source_provider is not null and source_id is not null;
