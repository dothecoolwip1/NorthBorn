alter table public.employees
  add column if not exists hire_date date,
  add column if not exists employment_type text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relation text,
  add column if not exists driver_license_number text,
  add column if not exists driver_license_class text,
  add column if not exists driver_license_expires_on date,
  add column if not exists supervisor_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists internal_notes text;

create index if not exists employees_supervisor_idx
  on public.employees(organization_id,supervisor_employee_id)
  where supervisor_employee_id is not null;

create table if not exists public.employee_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  supervisor_employee_id uuid references public.employees(id) on delete set null,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,name)
);

create table if not exists public.employee_team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.employee_teams(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  is_lead boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(team_id,employee_id)
);

create index if not exists employee_team_members_employee_idx
  on public.employee_team_members(organization_id,employee_id);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  category text not null default 'general'
    check (category in ('general','driver_license','training','medical','employment','policy','other')),
  description text,
  expires_on date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_documents_employee_idx
  on public.employee_documents(organization_id,employee_id,created_at desc);
create index if not exists employee_documents_expiry_idx
  on public.employee_documents(organization_id,expires_on)
  where expires_on is not null;

create or replace function private.employee_storage_org_id(_name text)
returns uuid
language plpgsql
immutable
set search_path=''
as $$
begin
  return nullif(split_part(_name,'/',1),'')::uuid;
exception when others then
  return null;
end;
$$;

create or replace function private.employee_storage_employee_id(_name text)
returns uuid
language plpgsql
immutable
set search_path=''
as $$
begin
  return nullif(split_part(_name,'/',2),'')::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function private.employee_storage_org_id(text) from public,anon,authenticated,service_role;
revoke all on function private.employee_storage_employee_id(text) from public,anon,authenticated,service_role;

create or replace function private.validate_employee_admin_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.supervisor_employee_id is not null and not exists(
    select 1 from public.employees e
    where e.id=new.supervisor_employee_id
      and e.organization_id=new.organization_id
      and e.status<>'archived'
  ) then
    raise exception 'Supervisor must belong to the same organization';
  end if;
  if new.supervisor_employee_id=new.id then
    raise exception 'An employee cannot supervise themselves';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_employee_admin_scope() from public,anon,authenticated,service_role;

drop trigger if exists validate_employee_admin_scope on public.employees;
create trigger validate_employee_admin_scope
before insert or update on public.employees
for each row execute function private.validate_employee_admin_scope();

create or replace function private.validate_employee_team_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.supervisor_employee_id is not null and not exists(
    select 1 from public.employees e
    where e.id=new.supervisor_employee_id
      and e.organization_id=new.organization_id
      and e.status<>'archived'
  ) then
    raise exception 'Team supervisor must belong to the same organization';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_employee_team_scope() from public,anon,authenticated,service_role;

drop trigger if exists validate_employee_team_scope on public.employee_teams;
create trigger validate_employee_team_scope
before insert or update on public.employee_teams
for each row execute function private.validate_employee_team_scope();

create or replace function private.validate_employee_team_member_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.employee_teams t
    where t.id=new.team_id and t.organization_id=new.organization_id
  ) then
    raise exception 'Team must belong to the same organization';
  end if;
  if not exists(
    select 1 from public.employees e
    where e.id=new.employee_id and e.organization_id=new.organization_id
  ) then
    raise exception 'Employee must belong to the same organization';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_employee_team_member_scope() from public,anon,authenticated,service_role;

drop trigger if exists validate_employee_team_member_scope on public.employee_team_members;
create trigger validate_employee_team_member_scope
before insert or update on public.employee_team_members
for each row execute function private.validate_employee_team_member_scope();

create or replace function private.validate_employee_document_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.employees e
    where e.id=new.employee_id and e.organization_id=new.organization_id
  ) then
    raise exception 'Employee document must belong to the same organization';
  end if;
  if split_part(new.storage_path,'/',1)<>new.organization_id::text
     or split_part(new.storage_path,'/',2)<>new.employee_id::text then
    raise exception 'Employee document storage path is not correctly scoped';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_employee_document_scope() from public,anon,authenticated,service_role;

drop trigger if exists validate_employee_document_scope on public.employee_documents;
create trigger validate_employee_document_scope
before insert or update on public.employee_documents
for each row execute function private.validate_employee_document_scope();

alter table public.employee_teams enable row level security;
alter table public.employee_team_members enable row level security;
alter table public.employee_documents enable row level security;

drop policy if exists "employee teams view" on public.employee_teams;
create policy "employee teams view"
on public.employee_teams for select to authenticated
using (
  private.has_org_permission(organization_id,'employees.view')
  or exists(
    select 1 from public.employee_team_members tm
    join public.employees e on e.id=tm.employee_id and e.organization_id=tm.organization_id
    where tm.team_id=employee_teams.id
      and e.user_id=(select auth.uid())
  )
);

drop policy if exists "employee teams insert" on public.employee_teams;
create policy "employee teams insert"
on public.employee_teams for insert to authenticated
with check (
  private.has_org_permission(organization_id,'employees.edit')
  and created_by=(select auth.uid())
);

drop policy if exists "employee teams update" on public.employee_teams;
create policy "employee teams update"
on public.employee_teams for update to authenticated
using (private.has_org_permission(organization_id,'employees.edit'))
with check (private.has_org_permission(organization_id,'employees.edit'));

drop policy if exists "employee teams delete" on public.employee_teams;
create policy "employee teams delete"
on public.employee_teams for delete to authenticated
using (private.has_org_permission(organization_id,'employees.edit'));

drop policy if exists "employee team members view" on public.employee_team_members;
create policy "employee team members view"
on public.employee_team_members for select to authenticated
using (
  private.has_org_permission(organization_id,'employees.view')
  or exists(
    select 1 from public.employees e
    where e.id=employee_team_members.employee_id
      and e.user_id=(select auth.uid())
  )
);

drop policy if exists "employee team members insert" on public.employee_team_members;
create policy "employee team members insert"
on public.employee_team_members for insert to authenticated
with check (
  private.has_org_permission(organization_id,'employees.edit')
  and created_by=(select auth.uid())
);

drop policy if exists "employee team members update" on public.employee_team_members;
create policy "employee team members update"
on public.employee_team_members for update to authenticated
using (private.has_org_permission(organization_id,'employees.edit'))
with check (private.has_org_permission(organization_id,'employees.edit'));

drop policy if exists "employee team members delete" on public.employee_team_members;
create policy "employee team members delete"
on public.employee_team_members for delete to authenticated
using (private.has_org_permission(organization_id,'employees.edit'));

drop policy if exists "employee documents view" on public.employee_documents;
create policy "employee documents view"
on public.employee_documents for select to authenticated
using (
  private.has_org_permission(organization_id,'employees.view')
  or exists(
    select 1 from public.employees e
    where e.id=employee_documents.employee_id
      and e.organization_id=employee_documents.organization_id
      and e.user_id=(select auth.uid())
  )
);

drop policy if exists "employee documents insert" on public.employee_documents;
create policy "employee documents insert"
on public.employee_documents for insert to authenticated
with check (
  private.has_org_permission(organization_id,'employees.edit')
  and created_by=(select auth.uid())
);

drop policy if exists "employee documents update" on public.employee_documents;
create policy "employee documents update"
on public.employee_documents for update to authenticated
using (private.has_org_permission(organization_id,'employees.edit'))
with check (private.has_org_permission(organization_id,'employees.edit'));

drop policy if exists "employee documents delete" on public.employee_documents;
create policy "employee documents delete"
on public.employee_documents for delete to authenticated
using (private.has_org_permission(organization_id,'employees.edit'));

grant select,insert,update,delete on public.employee_teams to authenticated;
grant select,insert,update,delete on public.employee_team_members to authenticated;
grant select,insert,update,delete on public.employee_documents to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'employee-documents',
  'employee-documents',
  false,
  15728640,
  array[
    'application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Northborn employee document read" on storage.objects;
create policy "Northborn employee document read"
on storage.objects for select to authenticated
using (
  bucket_id='employee-documents'
  and (
    private.has_org_permission(private.employee_storage_org_id(name),'employees.view')
    or private.is_current_user_employee(
      private.employee_storage_employee_id(name),
      private.employee_storage_org_id(name)
    )
  )
);

drop policy if exists "Northborn employee document upload" on storage.objects;
create policy "Northborn employee document upload"
on storage.objects for insert to authenticated
with check (
  bucket_id='employee-documents'
  and private.has_org_permission(private.employee_storage_org_id(name),'employees.edit')
  and exists(
    select 1 from public.employees e
    where e.id=private.employee_storage_employee_id(name)
      and e.organization_id=private.employee_storage_org_id(name)
  )
);

drop policy if exists "Northborn employee document update" on storage.objects;
create policy "Northborn employee document update"
on storage.objects for update to authenticated
using (
  bucket_id='employee-documents'
  and private.has_org_permission(private.employee_storage_org_id(name),'employees.edit')
)
with check (
  bucket_id='employee-documents'
  and private.has_org_permission(private.employee_storage_org_id(name),'employees.edit')
);

drop policy if exists "Northborn employee document delete" on storage.objects;
create policy "Northborn employee document delete"
on storage.objects for delete to authenticated
using (
  bucket_id='employee-documents'
  and private.has_org_permission(private.employee_storage_org_id(name),'employees.edit')
);
