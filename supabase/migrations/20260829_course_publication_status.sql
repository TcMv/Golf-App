-- Phase 4 publication safety.
-- Existing courses remain playable; newly-created rows default to draft.

alter table courses
  add column if not exists publication_status text not null default 'published';

alter table courses
  drop constraint if exists courses_publication_status_check;

alter table courses
  add constraint courses_publication_status_check
  check (publication_status in ('draft', 'review', 'published'));

-- The ADD COLUMN default above preserves existing production courses as published.
-- Future inserts should be safe-by-default unless explicitly published.
alter table courses
  alter column publication_status set default 'draft';

create index if not exists courses_publication_status_idx
  on courses (publication_status, name);
