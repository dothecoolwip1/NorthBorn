alter table public.safety_documents
  add column if not exists manufacturer text,
  add column if not exists source_url text,
  add column if not exists sds_revision_date date,
  add column if not exists source_type text,
  add column if not exists is_library_seed boolean not null default false;

create index if not exists safety_documents_source_type_idx on public.safety_documents(organization_id, source_type);
create index if not exists safety_documents_manufacturer_idx on public.safety_documents(organization_id, manufacturer);