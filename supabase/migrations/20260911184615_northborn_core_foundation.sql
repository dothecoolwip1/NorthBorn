create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text,
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  legal_name text,
  slug text unique,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  country_code text not null default 'CA' check (char_length(country_code) = 2),
  timezone text not null default 'America/Edmonton',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','invited','suspended','removed')),
  created_by uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_.-]+$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index roles_system_key_unique
  on public.roles(key)
  where organization_id is null;

create unique index roles_org_key_unique
  on public.roles(organization_id, key)
  where organization_id is not null;

create table public.permissions (
  key text primary key check (key ~ '^[a-z0-9_.-]+$'),
  module text not null,
  name text not null,
  description text
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  unique (role_id, permission_key)
);

create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.organization_members(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (membership_id, role_id)
);

create table public.organization_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_key text not null check (module_key ~ '^[a-z0-9_.-]+$'),
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, module_key)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members(user_id, organization_id);
create index organization_members_org_idx on public.organization_members(organization_id, status);
create index membership_roles_membership_idx on public.membership_roles(membership_id);
create index membership_roles_role_idx on public.membership_roles(role_id);
create index role_permissions_role_idx on public.role_permissions(role_id);
create index organization_modules_org_idx on public.organization_modules(organization_id);
create index audit_logs_org_time_idx on public.audit_logs(organization_id, occurred_at desc);

insert into public.permissions (key, module, name, description) values
('dashboard.view','core','View dashboard','View the organization dashboard'),
('organization.manage','core','Manage organization','Edit organization settings and company information'),
('organization.ownership.manage','core','Manage ownership','Assign or remove owner access'),
('members.manage','core','Manage members','Add, suspend and manage organization members'),
('roles.manage','core','Manage roles','Create roles and configure permissions'),
('settings.manage','core','Manage settings','Manage organization configuration'),
('audit.view','core','View audit log','View organization audit history'),
('dispatch.view','dispatch','View dispatch','View dispatch information'),
('dispatch.edit','dispatch','Edit dispatch','Create and change dispatch information'),
('jobs.view','jobs','View jobs','View jobs and assignments'),
('jobs.edit','jobs','Edit jobs','Create and change jobs'),
('customers.view','crm','View customers','View customers and contacts'),
('customers.edit','crm','Edit customers','Create and change customers and contacts'),
('fleet.view','fleet','View fleet','View vehicles and fleet information'),
('fleet.edit','fleet','Edit fleet','Create and change fleet information'),
('safety.view','safety','View safety','View safety forms and records'),
('safety.submit','safety','Submit safety','Complete and submit safety forms'),
('safety.manage','safety','Manage safety','Manage safety programs, forms and records'),
('tickets.view','tickets','View tickets','View field and job tickets'),
('tickets.submit','tickets','Submit tickets','Create and submit field and job tickets'),
('tickets.manage','tickets','Manage tickets','Review and manage field and job tickets'),
('timesheets.view','timesheets','View timesheets','View timesheet records'),
('timesheets.submit','timesheets','Submit timesheets','Create and submit time entries'),
('timesheets.manage','timesheets','Manage timesheets','Review and manage time entries'),
('invoices.view','invoices','View invoices','View invoices and balances'),
('invoices.manage','invoices','Manage invoices','Create and manage invoices'),
('reports.view','reports','View reports','View organization reports');

insert into public.roles (organization_id, key, name, description, is_system) values
(null,'owner','Owner','Full organization ownership and administration',true),
(null,'admin','Administrator','Organization administration without ownership transfer',true),
(null,'dispatcher','Dispatcher','Dispatch, jobs, customers and field ticket coordination',true),
(null,'supervisor','Supervisor','Operational supervision across field teams',true),
(null,'operator','Operator','Field worker access for assigned work and submissions',true),
(null,'mechanic','Mechanic','Fleet and maintenance focused access',true),
(null,'safety','Safety','Safety program and compliance access',true),
(null,'accounting','Accounting','Invoices, timesheets and reporting access',true);

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join public.permissions p
where r.key = 'owner' and r.organization_id is null;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key = any(array[
  'dashboard.view','organization.manage','members.manage','roles.manage','settings.manage','audit.view',
  'dispatch.view','dispatch.edit','jobs.view','jobs.edit','customers.view','customers.edit',
  'fleet.view','fleet.edit','safety.view','safety.submit','safety.manage','tickets.view','tickets.submit','tickets.manage',
  'timesheets.view','timesheets.submit','timesheets.manage','invoices.view','invoices.manage','reports.view'
])
where r.key = 'admin' and r.organization_id is null;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key = any(array[
  'dashboard.view','dispatch.view','dispatch.edit','jobs.view','jobs.edit','customers.view','customers.edit',
  'fleet.view','safety.view','tickets.view','tickets.submit','tickets.manage','timesheets.view','reports.view'
])
where r.key = 'dispatcher' and r.organization_id is null;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key = any(array[
  'dashboard.view','dispatch.view','jobs.view','jobs.edit','customers.view','fleet.view','fleet.edit',
  'safety.view','safety.submit','safety.manage','tickets.view','tickets.submit','tickets.manage',
  'timesheets.view','timesheets.submit','timesheets.manage','reports.view'
])
where r.key = 'supervisor' and r.organization_id is null;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key = any(array[
  'dashboard.view','dispatch.view','jobs.view','customers.view','fleet.view','safety.view','safety.submit',
  'tickets.view','tickets.submit','timesheets.view','timesheets.submit'
])
where r.key = 'operator' and r.organization_id is null;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key = any(array[
  'dashboard.view','jobs.view','fleet.view','fleet.edit','safety.view','safety.submit','timesheets.view','timesheets.submit'
])
where r.key = 'mechanic' and r.organization_id is null;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key = any(array[
  'dashboard.view','jobs.view','customers.view','fleet.view','safety.view','safety.submit','safety.manage',
  'tickets.view','timesheets.view','reports.view'
])
where r.key = 'safety' and r.organization_id is null;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key = any(array[
  'dashboard.view','customers.view','tickets.view','tickets.manage','timesheets.view','timesheets.manage',
  'invoices.view','invoices.manage','reports.view'
])
where r.key = 'accounting' and r.organization_id is null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.is_org_member(_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = _organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.has_org_permission(_organization_id uuid, _permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    join public.role_permissions rp on rp.role_id = r.id
    where m.organization_id = _organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and rp.permission_key = _permission_key
      and (r.organization_id is null or r.organization_id = m.organization_id)
  );
$$;

create or replace function private.shares_org_with_user(_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = _other_user_id
      and theirs.status = 'active'
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_permission(uuid,text) from public;
revoke all on function private.shares_org_with_user(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_permission(uuid,text) to authenticated;
grant execute on function private.shares_org_with_user(uuid) to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, first_name, last_name, display_name)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'first_name',''),
    nullif(new.raw_user_meta_data ->> 'last_name',''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name',''),
      nullif(new.raw_user_meta_data ->> 'full_name',''),
      split_part(coalesce(new.email, new.phone, new.id::text), '@', 1)
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function private.bootstrap_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_uuid uuid;
  owner_role_uuid uuid;
begin
  insert into public.organization_members (organization_id, user_id, status, created_by)
  values (new.id, new.created_by, 'active', new.created_by)
  returning id into membership_uuid;

  select id into owner_role_uuid
  from public.roles
  where organization_id is null and key = 'owner';

  insert into public.membership_roles (membership_id, role_id)
  values (membership_uuid, owner_role_uuid);

  insert into public.organization_modules (organization_id, module_key, enabled)
  values
    (new.id,'dispatch',true),
    (new.id,'calendar',true),
    (new.id,'employees',true),
    (new.id,'fleet',true),
    (new.id,'safety',true),
    (new.id,'crm',true),
    (new.id,'tickets',true),
    (new.id,'timesheets',true),
    (new.id,'documents',true),
    (new.id,'invoices',true),
    (new.id,'payments',false),
    (new.id,'reports',true),
    (new.id,'customer_portal',false);

  return new;
end;
$$;

create or replace function private.validate_membership_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_org uuid;
  role_org uuid;
begin
  select organization_id into member_org
  from public.organization_members
  where id = new.membership_id;

  select organization_id into role_org
  from public.roles
  where id = new.role_id;

  if member_org is null then
    raise exception 'Membership does not exist';
  end if;

  if role_org is not null and role_org <> member_org then
    raise exception 'Role belongs to a different organization';
  end if;

  return new;
end;
$$;

create or replace function private.protect_membership_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id or new.user_id <> old.user_id then
    raise exception 'Membership organization and user cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function private.protect_organization_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.created_by <> old.created_by then
    raise exception 'Organization identity and creator cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function private.protect_owner_membership_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_owner boolean;
  other_active_owners integer;
begin
  if old.status = 'active' and new.status <> 'active' then
    select exists (
      select 1
      from public.membership_roles mr
      join public.roles r on r.id = mr.role_id
      where mr.membership_id = old.id
        and r.organization_id is null
        and r.key = 'owner'
    ) into target_is_owner;

    if target_is_owner then
      if (select auth.uid()) is not null
         and not private.has_org_permission(old.organization_id, 'organization.ownership.manage') then
        raise exception 'Only an owner can suspend or remove another owner';
      end if;

      select count(*) into other_active_owners
      from public.organization_members m
      join public.membership_roles mr on mr.membership_id = m.id
      join public.roles r on r.id = mr.role_id
      where m.organization_id = old.organization_id
        and m.id <> old.id
        and m.status = 'active'
        and r.organization_id is null
        and r.key = 'owner';

      if other_active_owners = 0 then
        raise exception 'An organization must keep at least one active owner';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.protect_last_owner_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_key text;
  role_org uuid;
  member_org uuid;
  other_active_owners integer;
begin
  select key, organization_id into role_key, role_org
  from public.roles
  where id = old.role_id;

  if role_key = 'owner' and role_org is null then
    select organization_id into member_org
    from public.organization_members
    where id = old.membership_id;

    select count(*) into other_active_owners
    from public.organization_members m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.organization_id = member_org
      and m.status = 'active'
      and mr.id <> old.id
      and r.organization_id is null
      and r.key = 'owner';

    if other_active_owners = 0 then
      raise exception 'An organization must keep at least one active owner';
    end if;
  end if;
  return old;
end;
$$;

create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  old_data jsonb;
  org_uuid uuid;
  entity_uuid uuid;
  membership_uuid uuid;
begin
  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
  else
    row_data := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    old_data := to_jsonb(old);
  end if;

  entity_uuid := nullif(row_data ->> 'id','')::uuid;

  if tg_table_name = 'organizations' then
    org_uuid := entity_uuid;
  elsif row_data ? 'organization_id' then
    org_uuid := nullif(row_data ->> 'organization_id','')::uuid;
  elsif tg_table_name = 'membership_roles' then
    membership_uuid := nullif(row_data ->> 'membership_id','')::uuid;
    select organization_id into org_uuid from public.organization_members where id = membership_uuid;
  elsif tg_table_name = 'role_permissions' then
    select organization_id into org_uuid
    from public.roles
    where id = nullif(row_data ->> 'role_id','')::uuid;
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    org_uuid,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    entity_uuid,
    jsonb_build_object('new', case when tg_op <> 'DELETE' then row_data else null end,
                       'old', case when tg_op in ('UPDATE','DELETE') then coalesce(old_data, row_data) else null end)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger organizations_updated_at before update on public.organizations
for each row execute function private.set_updated_at();
create trigger organization_members_updated_at before update on public.organization_members
for each row execute function private.set_updated_at();
create trigger roles_updated_at before update on public.roles
for each row execute function private.set_updated_at();
create trigger organization_modules_updated_at before update on public.organization_modules
for each row execute function private.set_updated_at();

create trigger auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create trigger organization_created
after insert on public.organizations
for each row execute function private.bootstrap_organization();

create trigger membership_role_scope
before insert or update on public.membership_roles
for each row execute function private.validate_membership_role_scope();

create trigger protect_membership_identity
before update on public.organization_members
for each row execute function private.protect_membership_identity();

create trigger protect_organization_identity
before update on public.organizations
for each row execute function private.protect_organization_identity();

create trigger protect_owner_membership_status
before update on public.organization_members
for each row execute function private.protect_owner_membership_status();

create trigger protect_last_owner_role
before delete on public.membership_roles
for each row execute function private.protect_last_owner_role();

create trigger audit_organizations after insert or update on public.organizations
for each row execute function private.write_audit_log();
create trigger audit_organization_members after insert or update on public.organization_members
for each row execute function private.write_audit_log();
create trigger audit_roles after insert or update or delete on public.roles
for each row execute function private.write_audit_log();
create trigger audit_role_permissions after insert or delete on public.role_permissions
for each row execute function private.write_audit_log();
create trigger audit_membership_roles after insert or delete on public.membership_roles
for each row execute function private.write_audit_log();
create trigger audit_organization_modules after insert or update on public.organization_modules
for each row execute function private.write_audit_log();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.membership_roles enable row level security;
alter table public.organization_modules enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_shared_org
on public.profiles for select to authenticated
using (user_id = (select auth.uid()) or private.shares_org_with_user(user_id));

create policy profiles_update_self
on public.profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy organizations_select_member
on public.organizations for select to authenticated
using (private.is_org_member(id));

create policy organizations_insert_self
on public.organizations for insert to authenticated
with check (created_by = (select auth.uid()));

create policy organizations_update_manager
on public.organizations for update to authenticated
using (private.has_org_permission(id, 'organization.manage'))
with check (private.has_org_permission(id, 'organization.manage'));

create policy organization_members_select_member
on public.organization_members for select to authenticated
using (private.is_org_member(organization_id));

create policy organization_members_insert_manager
on public.organization_members for insert to authenticated
with check (private.has_org_permission(organization_id, 'members.manage'));

create policy organization_members_update_manager
on public.organization_members for update to authenticated
using (private.has_org_permission(organization_id, 'members.manage'))
with check (private.has_org_permission(organization_id, 'members.manage'));

create policy roles_select_available
on public.roles for select to authenticated
using (organization_id is null or private.is_org_member(organization_id));

create policy roles_insert_manager
on public.roles for insert to authenticated
with check (
  organization_id is not null
  and is_system = false
  and private.has_org_permission(organization_id, 'roles.manage')
);

create policy roles_update_manager
on public.roles for update to authenticated
using (
  organization_id is not null
  and is_system = false
  and private.has_org_permission(organization_id, 'roles.manage')
)
with check (
  organization_id is not null
  and is_system = false
  and private.has_org_permission(organization_id, 'roles.manage')
);

create policy roles_delete_manager
on public.roles for delete to authenticated
using (
  organization_id is not null
  and is_system = false
  and private.has_org_permission(organization_id, 'roles.manage')
);

create policy permissions_select_authenticated
on public.permissions for select to authenticated
using (true);

create policy role_permissions_select_available
on public.role_permissions for select to authenticated
using (
  exists (
    select 1 from public.roles r
    where r.id = role_id
      and (r.organization_id is null or private.is_org_member(r.organization_id))
  )
);

create policy role_permissions_insert_manager
on public.role_permissions for insert to authenticated
with check (
  exists (
    select 1 from public.roles r
    where r.id = role_id
      and r.organization_id is not null
      and private.has_org_permission(r.organization_id, 'roles.manage')
  )
);

create policy role_permissions_delete_manager
on public.role_permissions for delete to authenticated
using (
  exists (
    select 1 from public.roles r
    where r.id = role_id
      and r.organization_id is not null
      and private.has_org_permission(r.organization_id, 'roles.manage')
  )
);

create policy membership_roles_select_member
on public.membership_roles for select to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.id = membership_id
      and private.is_org_member(m.organization_id)
  )
);

create policy membership_roles_insert_manager
on public.membership_roles for insert to authenticated
with check (
  exists (
    select 1
    from public.organization_members m
    join public.roles r on r.id = role_id
    where m.id = membership_id
      and (
        (r.organization_id is null and r.key <> 'owner' and private.has_org_permission(m.organization_id, 'members.manage'))
        or
        (r.organization_id is null and r.key = 'owner' and private.has_org_permission(m.organization_id, 'organization.ownership.manage'))
        or
        (r.organization_id = m.organization_id and private.has_org_permission(m.organization_id, 'members.manage'))
      )
  )
);

create policy membership_roles_delete_manager
on public.membership_roles for delete to authenticated
using (
  exists (
    select 1
    from public.organization_members m
    join public.roles r on r.id = role_id
    where m.id = membership_id
      and (
        (r.organization_id is null and r.key <> 'owner' and private.has_org_permission(m.organization_id, 'members.manage'))
        or
        (r.organization_id is null and r.key = 'owner' and private.has_org_permission(m.organization_id, 'organization.ownership.manage'))
        or
        (r.organization_id = m.organization_id and private.has_org_permission(m.organization_id, 'members.manage'))
      )
  )
);

create policy organization_modules_select_member
on public.organization_modules for select to authenticated
using (private.is_org_member(organization_id));

create policy organization_modules_update_manager
on public.organization_modules for update to authenticated
using (private.has_org_permission(organization_id, 'settings.manage'))
with check (private.has_org_permission(organization_id, 'settings.manage'));

create policy audit_logs_select_authorized
on public.audit_logs for select to authenticated
using (organization_id is not null and private.has_org_permission(organization_id, 'audit.view'));

revoke all on public.profiles from anon, authenticated;
revoke all on public.organizations from anon, authenticated;
revoke all on public.organization_members from anon, authenticated;
revoke all on public.roles from anon, authenticated;
revoke all on public.permissions from anon, authenticated;
revoke all on public.role_permissions from anon, authenticated;
revoke all on public.membership_roles from anon, authenticated;
revoke all on public.organization_modules from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update on public.organization_members to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select, insert, delete on public.role_permissions to authenticated;
grant select, insert, delete on public.membership_roles to authenticated;
grant select, update on public.organization_modules to authenticated;
grant select on public.audit_logs to authenticated;

grant all on public.profiles to service_role;
grant all on public.organizations to service_role;
grant all on public.organization_members to service_role;
grant all on public.roles to service_role;
grant all on public.permissions to service_role;
grant all on public.role_permissions to service_role;
grant all on public.membership_roles to service_role;
grant all on public.organization_modules to service_role;
grant all on public.audit_logs to service_role;