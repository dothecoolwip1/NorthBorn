alter table public.field_tickets
  add column if not exists template_id uuid references public.document_templates(id) on delete set null,
  add column if not exists template_version integer,
  add column if not exists custom_answers jsonb not null default '{}'::jsonb,
  add column if not exists operator_signature_data text,
  add column if not exists operator_signed_at timestamptz;

alter table public.timesheet_entries
  add column if not exists template_id uuid references public.document_templates(id) on delete set null,
  add column if not exists template_version integer,
  add column if not exists custom_answers jsonb not null default '{}'::jsonb,
  add column if not exists employee_signature_data text,
  add column if not exists employee_signed_at timestamptz;

create table if not exists public.field_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.field_tickets(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  caption text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.timesheet_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  timesheet_entry_id uuid not null references public.timesheet_entries(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  caption text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists field_ticket_attachments_ticket_idx
  on public.field_ticket_attachments(organization_id,ticket_id,created_at);
create index if not exists timesheet_attachments_entry_idx
  on public.timesheet_attachments(organization_id,timesheet_entry_id,created_at);
create index if not exists field_tickets_template_idx
  on public.field_tickets(organization_id,template_id,template_version);
create index if not exists timesheet_entries_template_idx
  on public.timesheet_entries(organization_id,template_id,template_version);

create or replace function private.validate_field_ticket_attachment_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.field_tickets t
    where t.id=new.ticket_id and t.organization_id=new.organization_id
  ) then
    raise exception 'Field ticket attachment must belong to the same organization';
  end if;
  if split_part(new.storage_path,'/',1)<>new.organization_id::text
     or split_part(new.storage_path,'/',2)<>'tickets'
     or split_part(new.storage_path,'/',3)<>new.ticket_id::text then
    raise exception 'Field ticket attachment storage path is not correctly scoped';
  end if;
  return new;
end;
$$;

create or replace function private.validate_timesheet_attachment_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.timesheet_entries t
    where t.id=new.timesheet_entry_id and t.organization_id=new.organization_id
  ) then
    raise exception 'Timesheet attachment must belong to the same organization';
  end if;
  if split_part(new.storage_path,'/',1)<>new.organization_id::text
     or split_part(new.storage_path,'/',2)<>'timesheets'
     or split_part(new.storage_path,'/',3)<>new.timesheet_entry_id::text then
    raise exception 'Timesheet attachment storage path is not correctly scoped';
  end if;
  return new;
end;
$$;

create or replace function private.validate_document_template_record_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.template_id is not null and not exists(
    select 1 from public.document_templates d
    where d.id=new.template_id
      and d.organization_id=new.organization_id
      and d.status='active'
      and (
        (tg_table_name='field_tickets' and d.document_type='field_ticket')
        or (tg_table_name='timesheet_entries' and d.document_type='timesheet')
      )
  ) then
    raise exception 'Document template must be active and belong to the same organization';
  end if;
  if new.template_id is null then
    new.template_version:=null;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_field_ticket_attachment_scope() from public,anon,authenticated,service_role;
revoke all on function private.validate_timesheet_attachment_scope() from public,anon,authenticated,service_role;
revoke all on function private.validate_document_template_record_scope() from public,anon,authenticated,service_role;

drop trigger if exists validate_field_ticket_attachment_scope on public.field_ticket_attachments;
create trigger validate_field_ticket_attachment_scope
before insert or update on public.field_ticket_attachments
for each row execute function private.validate_field_ticket_attachment_scope();

drop trigger if exists validate_timesheet_attachment_scope on public.timesheet_attachments;
create trigger validate_timesheet_attachment_scope
before insert or update on public.timesheet_attachments
for each row execute function private.validate_timesheet_attachment_scope();

drop trigger if exists validate_field_ticket_template_scope on public.field_tickets;
create trigger validate_field_ticket_template_scope
before insert or update of template_id,template_version on public.field_tickets
for each row execute function private.validate_document_template_record_scope();

drop trigger if exists validate_timesheet_template_scope on public.timesheet_entries;
create trigger validate_timesheet_template_scope
before insert or update of template_id,template_version on public.timesheet_entries
for each row execute function private.validate_document_template_record_scope();

alter table public.field_ticket_attachments enable row level security;
alter table public.timesheet_attachments enable row level security;

grant select,insert,delete on public.field_ticket_attachments to authenticated;
grant select,insert,delete on public.timesheet_attachments to authenticated;

create policy field_ticket_attachments_select on public.field_ticket_attachments
for select to authenticated
using (
  private.has_org_permission(organization_id,'tickets.manage')
  or exists(
    select 1 from public.field_tickets t
    where t.id=ticket_id
      and t.organization_id=organization_id
      and (
        t.created_by=(select auth.uid())
        or exists(
          select 1 from public.employees e
          where e.id=t.primary_employee_id
            and e.user_id=(select auth.uid())
            and e.organization_id=organization_id
        )
      )
  )
);

create policy field_ticket_attachments_insert on public.field_ticket_attachments
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and (
    private.has_org_permission(organization_id,'tickets.manage')
    or exists(
      select 1 from public.field_tickets t
      where t.id=ticket_id
        and t.organization_id=organization_id
        and t.status in ('draft','rejected')
        and (
          t.created_by=(select auth.uid())
          or exists(
            select 1 from public.employees e
            where e.id=t.primary_employee_id
              and e.user_id=(select auth.uid())
              and e.organization_id=organization_id
          )
        )
    )
  )
);

create policy field_ticket_attachments_delete on public.field_ticket_attachments
for delete to authenticated
using (
  created_by=(select auth.uid())
  or private.has_org_permission(organization_id,'tickets.manage')
);

create policy timesheet_attachments_select on public.timesheet_attachments
for select to authenticated
using (
  private.has_org_permission(organization_id,'timesheets.manage')
  or exists(
    select 1 from public.timesheet_entries t
    join public.employees e on e.id=t.employee_id and e.organization_id=t.organization_id
    where t.id=timesheet_entry_id
      and t.organization_id=organization_id
      and e.user_id=(select auth.uid())
  )
);

create policy timesheet_attachments_insert on public.timesheet_attachments
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and (
    private.has_org_permission(organization_id,'timesheets.manage')
    or exists(
      select 1 from public.timesheet_entries t
      join public.employees e on e.id=t.employee_id and e.organization_id=t.organization_id
      where t.id=timesheet_entry_id
        and t.organization_id=organization_id
        and t.status in ('draft','rejected')
        and e.user_id=(select auth.uid())
    )
  )
);

create policy timesheet_attachments_delete on public.timesheet_attachments
for delete to authenticated
using (
  created_by=(select auth.uid())
  or private.has_org_permission(organization_id,'timesheets.manage')
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'form-attachments',
  'form-attachments',
  false,
  26214400,
  array['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv']
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.form_attachment_org_id(_name text)
returns uuid
language plpgsql
stable
set search_path=''
as $$
begin
  return nullif(split_part(_name,'/',1),'')::uuid;
exception when others then return null;
end;
$$;

create or replace function private.form_attachment_record_id(_name text)
returns uuid
language plpgsql
stable
set search_path=''
as $$
begin
  return nullif(split_part(_name,'/',3),'')::uuid;
exception when others then return null;
end;
$$;

revoke all on function private.form_attachment_org_id(text) from public,anon,authenticated,service_role;
revoke all on function private.form_attachment_record_id(text) from public,anon,authenticated,service_role;

create policy form_attachments_storage_select on storage.objects
for select to authenticated
using (
  bucket_id='form-attachments'
  and private.form_attachment_org_id(name) is not null
  and (
    private.has_org_permission(private.form_attachment_org_id(name),'tickets.manage')
    or private.has_org_permission(private.form_attachment_org_id(name),'timesheets.manage')
    or (
      split_part(name,'/',2)='tickets'
      and exists(
        select 1 from public.field_tickets t
        left join public.employees e on e.id=t.primary_employee_id and e.organization_id=t.organization_id
        where t.id=private.form_attachment_record_id(name)
          and t.organization_id=private.form_attachment_org_id(name)
          and (t.created_by=(select auth.uid()) or e.user_id=(select auth.uid()))
      )
    )
    or (
      split_part(name,'/',2)='timesheets'
      and exists(
        select 1 from public.timesheet_entries t
        join public.employees e on e.id=t.employee_id and e.organization_id=t.organization_id
        where t.id=private.form_attachment_record_id(name)
          and t.organization_id=private.form_attachment_org_id(name)
          and e.user_id=(select auth.uid())
      )
    )
  )
);

create policy form_attachments_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='form-attachments'
  and private.form_attachment_org_id(name) is not null
  and (
    private.has_org_permission(private.form_attachment_org_id(name),'tickets.manage')
    or private.has_org_permission(private.form_attachment_org_id(name),'timesheets.manage')
    or (
      split_part(name,'/',2)='tickets'
      and exists(
        select 1 from public.field_tickets t
        left join public.employees e on e.id=t.primary_employee_id and e.organization_id=t.organization_id
        where t.id=private.form_attachment_record_id(name)
          and t.organization_id=private.form_attachment_org_id(name)
          and t.status in ('draft','rejected')
          and (t.created_by=(select auth.uid()) or e.user_id=(select auth.uid()))
      )
    )
    or (
      split_part(name,'/',2)='timesheets'
      and exists(
        select 1 from public.timesheet_entries t
        join public.employees e on e.id=t.employee_id and e.organization_id=t.organization_id
        where t.id=private.form_attachment_record_id(name)
          and t.organization_id=private.form_attachment_org_id(name)
          and t.status in ('draft','rejected')
          and e.user_id=(select auth.uid())
      )
    )
  )
);

create policy form_attachments_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id='form-attachments'
  and (
    private.has_org_permission(private.form_attachment_org_id(name),'tickets.manage')
    or private.has_org_permission(private.form_attachment_org_id(name),'timesheets.manage')
    or owner_id=(select auth.uid())
  )
);
