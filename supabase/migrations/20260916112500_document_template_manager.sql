insert into public.permissions (key, module, name, description)
values ('templates.manage','documents','Manage document templates','Create, publish, version and assign organization document templates')
on conflict (key) do update set
  module = excluded.module,
  name = excluded.name,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'templates.manage'
from public.roles r
where r.organization_id is null
  and r.key in ('owner','admin')
on conflict (role_id, permission_key) do nothing;

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  document_type text not null check (document_type in ('invoice','flha','pre_trip','field_ticket','incident_report','near_miss','hazard_observation','toolbox_talk','timesheet','work_order','custom')),
  source_kind text not null default 'northborn_builder' check (source_kind in ('northborn_builder','fillable_pdf')),
  description text,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  is_default boolean not null default false,
  version integer not null default 1 check (version > 0),
  file_path text,
  original_file_name text,
  page_count integer check (page_count is null or page_count > 0),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.document_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  file_path text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (template_id, version),
  constraint document_template_versions_template_org_fkey
    foreign key (organization_id, template_id)
    references public.document_templates(organization_id, id)
    on delete cascade
);

create unique index document_templates_default_active_unique
  on public.document_templates(organization_id, document_type)
  where is_default = true and status = 'active';
create index document_templates_org_type_idx on public.document_templates(organization_id, document_type, status, updated_at desc);
create index document_templates_org_updated_idx on public.document_templates(organization_id, updated_at desc);
create index document_template_versions_template_idx on public.document_template_versions(template_id, version desc);

create trigger document_templates_updated_at
before update on public.document_templates
for each row execute function private.set_updated_at();

create trigger document_templates_audit
after insert or update or delete on public.document_templates
for each row execute function private.write_audit_log();

alter table public.document_templates enable row level security;
alter table public.document_template_versions enable row level security;

grant select, insert, update, delete on public.document_templates to authenticated;
grant select, insert on public.document_template_versions to authenticated;
grant all on public.document_templates to service_role;
grant all on public.document_template_versions to service_role;

create policy document_templates_select on public.document_templates
for select to authenticated
using (
  private.is_org_member(organization_id)
  and (
    status = 'active'
    or private.has_org_permission(organization_id, 'templates.manage')
  )
);

create policy document_templates_insert on public.document_templates
for insert to authenticated
with check (
  private.has_org_permission(organization_id, 'templates.manage')
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy document_templates_update on public.document_templates
for update to authenticated
using (private.has_org_permission(organization_id, 'templates.manage'))
with check (
  private.has_org_permission(organization_id, 'templates.manage')
  and updated_by = (select auth.uid())
);

create policy document_templates_delete on public.document_templates
for delete to authenticated
using (private.has_org_permission(organization_id, 'templates.manage'));

create policy document_template_versions_select on public.document_template_versions
for select to authenticated
using (private.has_org_permission(organization_id, 'templates.manage'));

create policy document_template_versions_insert on public.document_template_versions
for insert to authenticated
with check (
  private.has_org_permission(organization_id, 'templates.manage')
  and created_by = (select auth.uid())
);

create or replace function private.document_template_storage_org_id(_name text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  segment text;
begin
  segment := split_part(coalesce(_name,''), '/', 1);
  if segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return segment::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

revoke all on function private.document_template_storage_org_id(text) from public;
grant execute on function private.document_template_storage_org_id(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'document-templates',
  'document-templates',
  false,
  26214400,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy document_templates_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'document-templates'
  and private.document_template_storage_org_id(name) is not null
  and private.is_org_member(private.document_template_storage_org_id(name))
);

create policy document_templates_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'document-templates'
  and private.document_template_storage_org_id(name) is not null
  and private.has_org_permission(private.document_template_storage_org_id(name), 'templates.manage')
);

create policy document_templates_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'document-templates'
  and private.document_template_storage_org_id(name) is not null
  and private.has_org_permission(private.document_template_storage_org_id(name), 'templates.manage')
)
with check (
  bucket_id = 'document-templates'
  and private.document_template_storage_org_id(name) is not null
  and private.has_org_permission(private.document_template_storage_org_id(name), 'templates.manage')
);

create policy document_templates_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'document-templates'
  and private.document_template_storage_org_id(name) is not null
  and private.has_org_permission(private.document_template_storage_org_id(name), 'templates.manage')
);