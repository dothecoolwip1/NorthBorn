create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  billing_email text,
  phone text,
  address text,
  notes text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  position text,
  status text not null default 'active' check (status in ('active','inactive','leave','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_number text not null,
  name text,
  vehicle_type text not null default 'truck',
  plate text,
  status text not null default 'available' check (status in ('available','assigned','maintenance','out_of_service','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, unit_number)
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  job_number text not null,
  title text not null,
  site_name text,
  site_address text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'scheduled' check (status in ('draft','scheduled','dispatched','in_progress','completed','cancelled')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, job_number)
);

create table if not exists public.dispatch_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  vehicle_id uuid references public.fleet_vehicles(id) on delete cascade,
  role text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (employee_id is not null or vehicle_id is not null)
);

create unique index if not exists dispatch_assignments_job_employee_unique on public.dispatch_assignments(job_id, employee_id) where employee_id is not null;
create unique index if not exists dispatch_assignments_job_vehicle_unique on public.dispatch_assignments(job_id, vehicle_id) where vehicle_id is not null;
create index if not exists customers_org_idx on public.customers(organization_id);
create index if not exists employees_org_idx on public.employees(organization_id);
create index if not exists fleet_vehicles_org_idx on public.fleet_vehicles(organization_id);
create index if not exists jobs_org_status_idx on public.jobs(organization_id, status);
create index if not exists jobs_org_start_idx on public.jobs(organization_id, scheduled_start);
create index if not exists dispatch_assignments_org_job_idx on public.dispatch_assignments(organization_id, job_id);

insert into public.permissions(key,module,name,description) values
 ('employees.view','employees','View employees','View employee records'),
 ('employees.edit','employees','Edit employees','Create and edit employee records')
on conflict (key) do nothing;

insert into public.role_permissions(role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p
where r.organization_id is null and r.key in ('owner','admin') and p.key in ('employees.view','employees.edit')
on conflict do nothing;

insert into public.role_permissions(role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p
where r.organization_id is null and r.key in ('dispatcher','supervisor','safety','accounting','mechanic','operator') and p.key='employees.view'
on conflict do nothing;

create trigger customers_updated_at before update on public.customers for each row execute function private.set_updated_at();
create trigger employees_updated_at before update on public.employees for each row execute function private.set_updated_at();
create trigger fleet_vehicles_updated_at before update on public.fleet_vehicles for each row execute function private.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute function private.set_updated_at();
create trigger customers_audit after insert or update or delete on public.customers for each row execute function private.write_audit_log();
create trigger employees_audit after insert or update or delete on public.employees for each row execute function private.write_audit_log();
create trigger fleet_vehicles_audit after insert or update or delete on public.fleet_vehicles for each row execute function private.write_audit_log();
create trigger jobs_audit after insert or update or delete on public.jobs for each row execute function private.write_audit_log();
create trigger dispatch_assignments_audit after insert or update or delete on public.dispatch_assignments for each row execute function private.write_audit_log();

alter table public.customers enable row level security;
alter table public.employees enable row level security;
alter table public.fleet_vehicles enable row level security;
alter table public.jobs enable row level security;
alter table public.dispatch_assignments enable row level security;

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.fleet_vehicles to authenticated;
grant select, insert, update, delete on public.jobs to authenticated;
grant select, insert, update, delete on public.dispatch_assignments to authenticated;
grant all on public.customers, public.employees, public.fleet_vehicles, public.jobs, public.dispatch_assignments to service_role;

create policy customers_select on public.customers for select to authenticated using (private.has_org_permission(organization_id,'customers.view'));
create policy customers_insert on public.customers for insert to authenticated with check (private.has_org_permission(organization_id,'customers.edit') and created_by=(select auth.uid()));
create policy customers_update on public.customers for update to authenticated using (private.has_org_permission(organization_id,'customers.edit')) with check (private.has_org_permission(organization_id,'customers.edit'));
create policy customers_delete on public.customers for delete to authenticated using (private.has_org_permission(organization_id,'customers.edit'));
create policy employees_select on public.employees for select to authenticated using (private.has_org_permission(organization_id,'employees.view'));
create policy employees_insert on public.employees for insert to authenticated with check (private.has_org_permission(organization_id,'employees.edit') and created_by=(select auth.uid()));
create policy employees_update on public.employees for update to authenticated using (private.has_org_permission(organization_id,'employees.edit')) with check (private.has_org_permission(organization_id,'employees.edit'));
create policy employees_delete on public.employees for delete to authenticated using (private.has_org_permission(organization_id,'employees.edit'));
create policy fleet_select on public.fleet_vehicles for select to authenticated using (private.has_org_permission(organization_id,'fleet.view'));
create policy fleet_insert on public.fleet_vehicles for insert to authenticated with check (private.has_org_permission(organization_id,'fleet.edit') and created_by=(select auth.uid()));
create policy fleet_update on public.fleet_vehicles for update to authenticated using (private.has_org_permission(organization_id,'fleet.edit')) with check (private.has_org_permission(organization_id,'fleet.edit'));
create policy fleet_delete on public.fleet_vehicles for delete to authenticated using (private.has_org_permission(organization_id,'fleet.edit'));
create policy jobs_select on public.jobs for select to authenticated using (private.has_org_permission(organization_id,'jobs.view'));
create policy jobs_insert on public.jobs for insert to authenticated with check (private.has_org_permission(organization_id,'jobs.edit') and created_by=(select auth.uid()));
create policy jobs_update on public.jobs for update to authenticated using (private.has_org_permission(organization_id,'jobs.edit')) with check (private.has_org_permission(organization_id,'jobs.edit'));
create policy jobs_delete on public.jobs for delete to authenticated using (private.has_org_permission(organization_id,'jobs.edit'));
create policy dispatch_select on public.dispatch_assignments for select to authenticated using (private.has_org_permission(organization_id,'dispatch.view'));
create policy dispatch_insert on public.dispatch_assignments for insert to authenticated with check (private.has_org_permission(organization_id,'dispatch.edit') and created_by=(select auth.uid()));
create policy dispatch_update on public.dispatch_assignments for update to authenticated using (private.has_org_permission(organization_id,'dispatch.edit')) with check (private.has_org_permission(organization_id,'dispatch.edit'));
create policy dispatch_delete on public.dispatch_assignments for delete to authenticated using (private.has_org_permission(organization_id,'dispatch.edit'));
