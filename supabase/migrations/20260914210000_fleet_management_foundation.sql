alter table public.employees
  add constraint employees_organization_id_id_key unique (organization_id, id);

alter table public.fleet_vehicles
  add constraint fleet_vehicles_organization_id_id_key unique (organization_id, id);

alter table public.fleet_vehicles
  add column vin text,
  add column year smallint check (year is null or year between 1900 and 2100),
  add column make text,
  add column model text,
  add column color text,
  add column odometer_km bigint check (odometer_km is null or odometer_km >= 0),
  add column engine_hours numeric(10,1) check (engine_hours is null or engine_hours >= 0),
  add column primary_operator_id uuid,
  add column registration_expiry date,
  add column insurance_expiry date,
  add column annual_inspection_expiry date,
  add column last_service_date date,
  add column next_service_date date,
  add column next_service_odometer_km bigint check (next_service_odometer_km is null or next_service_odometer_km >= 0),
  add column next_service_engine_hours numeric(10,1) check (next_service_engine_hours is null or next_service_engine_hours >= 0),
  add column notes text,
  add constraint fleet_vehicles_primary_operator_org_fkey
    foreign key (organization_id, primary_operator_id)
    references public.employees(organization_id, id);

create unique index fleet_vehicles_org_vin_unique
  on public.fleet_vehicles(organization_id, upper(vin))
  where vin is not null and btrim(vin) <> '';

create table public.fleet_service_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null,
  service_date date not null default current_date,
  service_type text not null,
  summary text not null,
  odometer_km bigint check (odometer_km is null or odometer_km >= 0),
  engine_hours numeric(10,1) check (engine_hours is null or engine_hours >= 0),
  vendor text,
  work_order_number text,
  cost_cents bigint check (cost_cents is null or cost_cents >= 0),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_service_records_vehicle_org_fkey
    foreign key (organization_id, vehicle_id)
    references public.fleet_vehicles(organization_id, id)
    on delete cascade
);

create index fleet_service_records_org_vehicle_date_idx
  on public.fleet_service_records(organization_id, vehicle_id, service_date desc);

create trigger fleet_service_records_updated_at
before update on public.fleet_service_records
for each row execute function private.set_updated_at();

create trigger fleet_service_records_audit
after insert or update or delete on public.fleet_service_records
for each row execute function private.write_audit_log();

alter table public.fleet_service_records enable row level security;

grant select, insert, update, delete on public.fleet_service_records to authenticated;
grant all on public.fleet_service_records to service_role;

create policy fleet_service_records_select on public.fleet_service_records
for select to authenticated
using (private.has_org_permission(organization_id,'fleet.view'));

create policy fleet_service_records_insert on public.fleet_service_records
for insert to authenticated
with check (
  private.has_org_permission(organization_id,'fleet.edit')
  and created_by = (select auth.uid())
);

create policy fleet_service_records_update on public.fleet_service_records
for update to authenticated
using (private.has_org_permission(organization_id,'fleet.edit'))
with check (private.has_org_permission(organization_id,'fleet.edit'));

create policy fleet_service_records_delete on public.fleet_service_records
for delete to authenticated
using (private.has_org_permission(organization_id,'fleet.edit'));
