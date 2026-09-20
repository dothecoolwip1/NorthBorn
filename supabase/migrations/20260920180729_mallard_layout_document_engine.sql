alter table public.mallard_sample_attachments
  drop constraint if exists mallard_sample_attachments_parse_method_check;

alter table public.mallard_sample_attachments
  add constraint mallard_sample_attachments_parse_method_check
  check (
    parse_method is null
    or parse_method in ('pdf_text', 'ocr', 'pdf_layout', 'ocr_layout')
  );

alter table public.mallard_sample_attachments
  add column if not exists document_type text null,
  add column if not exists document_confidence numeric(4,3) null,
  add column if not exists parser_version text null,
  add column if not exists layout_fingerprint text null,
  add column if not exists extraction_json jsonb not null default '{}'::jsonb,
  add column if not exists review_status text not null default 'unreviewed',
  add column if not exists review_json jsonb null,
  add column if not exists reviewed_at timestamptz null;

alter table public.mallard_sample_attachments
  drop constraint if exists mallard_sample_attachments_document_confidence_check,
  add constraint mallard_sample_attachments_document_confidence_check
    check (
      document_confidence is null
      or (document_confidence >= 0 and document_confidence <= 1)
    ),
  drop constraint if exists mallard_sample_attachments_review_status_check,
  add constraint mallard_sample_attachments_review_status_check
    check (review_status in ('unreviewed', 'reviewed', 'corrected'));

create index if not exists mallard_sample_attachments_layout_fingerprint_idx
  on public.mallard_sample_attachments (layout_fingerprint)
  where layout_fingerprint is not null;

alter table public.mallard_test_results
  add column if not exists method text null,
  add column if not exists reporting_limit text null,
  add column if not exists detection_limit text null,
  add column if not exists flag text null,
  add column if not exists source_bbox jsonb null;

create table if not exists public.mallard_document_profiles (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  document_type text null,
  lab_name text null,
  field_aliases jsonb not null default '{}'::jsonb,
  field_positions jsonb not null default '{}'::jsonb,
  column_aliases jsonb not null default '{}'::jsonb,
  times_seen integer not null default 0 check (times_seen >= 0),
  correction_count integer not null default 0 check (correction_count >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mallard_document_profiles is
  'Free Mallard document-layout learning. Fingerprints store reusable field locations and aliases after human review; they contain no paid AI model dependency.';

comment on column public.mallard_sample_attachments.extraction_json is
  'Complete parser candidate package retained for human review, evidence and future parser improvements.';

comment on column public.mallard_sample_attachments.review_json is
  'Human-reviewed values and selected rows applied from this source document.';

alter table public.mallard_document_profiles enable row level security;

grant select, insert, update on table public.mallard_document_profiles to anon, authenticated;

drop policy if exists mallard_document_profiles_select on public.mallard_document_profiles;
create policy mallard_document_profiles_select
on public.mallard_document_profiles
for select
to anon, authenticated
using (true);

drop policy if exists mallard_document_profiles_insert on public.mallard_document_profiles;
create policy mallard_document_profiles_insert
on public.mallard_document_profiles
for insert
to anon, authenticated
with check (true);

drop policy if exists mallard_document_profiles_update on public.mallard_document_profiles;
create policy mallard_document_profiles_update
on public.mallard_document_profiles
for update
to anon, authenticated
using (true)
with check (true);

drop trigger if exists mallard_document_profiles_touch_updated_at on public.mallard_document_profiles;
create trigger mallard_document_profiles_touch_updated_at
before update on public.mallard_document_profiles
for each row execute function public.mallard_touch_updated_at();
