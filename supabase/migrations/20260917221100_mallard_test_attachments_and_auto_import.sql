-- Mallard test attachments + automatic result import
-- Stores lab photos/PDF metadata, links parsed result rows back to the source file,
-- and provisions a private Storage bucket for the original documents.

create table if not exists public.mallard_sample_attachments (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.mallard_samples(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  parse_status text not null default 'uploaded'
    check (parse_status in ('uploaded','processing','parsed','needs_review','failed')),
  parse_method text null
    check (parse_method is null or parse_method in ('pdf_text','ocr')),
  parsed_line_count integer not null default 0 check (parsed_line_count >= 0),
  extracted_text text null,
  parse_error text null,
  parsed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mallard_sample_attachments enable row level security;

grant select, insert, update, delete on public.mallard_sample_attachments to anon, authenticated;

drop policy if exists "Mallard attachments select" on public.mallard_sample_attachments;
create policy "Mallard attachments select"
on public.mallard_sample_attachments for select
to anon, authenticated
using (true);

drop policy if exists "Mallard attachments insert" on public.mallard_sample_attachments;
create policy "Mallard attachments insert"
on public.mallard_sample_attachments for insert
to anon, authenticated
with check (true);

drop policy if exists "Mallard attachments update" on public.mallard_sample_attachments;
create policy "Mallard attachments update"
on public.mallard_sample_attachments for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Mallard attachments delete" on public.mallard_sample_attachments;
create policy "Mallard attachments delete"
on public.mallard_sample_attachments for delete
to anon, authenticated
using (true);

create index if not exists mallard_sample_attachments_sample_idx
  on public.mallard_sample_attachments(sample_id, created_at desc);

alter table public.mallard_test_results
  add column if not exists source_attachment_id uuid null references public.mallard_sample_attachments(id) on delete set null,
  add column if not exists parse_confidence numeric(4,3) null,
  add column if not exists source_page integer null;

alter table public.mallard_test_results
  drop constraint if exists mallard_test_results_parse_confidence_check;
alter table public.mallard_test_results
  add constraint mallard_test_results_parse_confidence_check
  check (parse_confidence is null or (parse_confidence >= 0 and parse_confidence <= 1));

alter table public.mallard_test_results
  drop constraint if exists mallard_test_results_source_page_check;
alter table public.mallard_test_results
  add constraint mallard_test_results_source_page_check
  check (source_page is null or source_page > 0);

create index if not exists mallard_test_results_source_attachment_idx
  on public.mallard_test_results(source_attachment_id)
  where source_attachment_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mallard-test-files',
  'mallard-test-files',
  false,
  15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Mallard test files select" on storage.objects;
create policy "Mallard test files select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'mallard-test-files');

drop policy if exists "Mallard test files insert" on storage.objects;
create policy "Mallard test files insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'mallard-test-files');

drop policy if exists "Mallard test files delete" on storage.objects;
create policy "Mallard test files delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'mallard-test-files');

create or replace function public.mallard_touch_attachment_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mallard_touch_attachment_updated_at on public.mallard_sample_attachments;
create trigger mallard_touch_attachment_updated_at
before update on public.mallard_sample_attachments
for each row execute function public.mallard_touch_attachment_updated_at();

create or replace function public.mallard_log_attachment_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.mallard_sample_events (sample_id, event_type, note)
    values (new.sample_id, 'attachment_uploaded', 'Uploaded test paperwork: ' || new.original_name);
  elsif old.parse_status is distinct from new.parse_status and new.parse_status in ('parsed','needs_review','failed') then
    insert into public.mallard_sample_events (sample_id, event_type, note)
    values (
      new.sample_id,
      case when new.parse_status = 'parsed' then 'attachment_parsed' else 'attachment_parse_review' end,
      case
        when new.parse_status = 'parsed' then 'Read ' || new.parsed_line_count || ' test line(s) from ' || new.original_name
        when new.parse_status = 'needs_review' then 'No confident test lines found in ' || new.original_name
        else 'Automatic reading failed for ' || new.original_name
      end
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.mallard_touch_attachment_updated_at() from public, anon, authenticated;
revoke execute on function public.mallard_log_attachment_event() from public, anon, authenticated;

drop trigger if exists mallard_log_attachment_event on public.mallard_sample_attachments;
create trigger mallard_log_attachment_event
after insert or update on public.mallard_sample_attachments
for each row execute function public.mallard_log_attachment_event();
