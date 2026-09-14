create table if not exists public.fleet_maintenance_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  service_type text not null default 'Preventive Service',
  interval_km bigint check (interval_km is null or interval_km > 0),
  interval_engine_hours numeric check (interval_engine_hours is null or interval_engine_hours > 0),
  interval_days integer check (interval_days is null or interval_days > 0),
  warning_km bigint not null default 1000 check (warning_km >= 0),
  warning_engine_hours numeric not null default 25 check (warning_engine_hours >= 0),
  warning_days integer not null default 30 check (warning_days >= 0),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (interval_km is not null or interval_engine_hours is not null or interval_days is not null),
  unique (organization_id, name)
);

create table if not exists public.fleet_maintenance_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  program_id uuid not null references public.fleet_maintenance_programs(id) on delete cascade,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  active boolean not null default true,
  last_completed_date date,
  last_completed_odometer_km bigint,
  last_completed_engine_hours numeric,
  next_due_date date,
  next_due_odometer_km bigint,
  next_due_engine_hours numeric,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, vehicle_id),
  foreign key (organization_id, vehicle_id) references public.fleet_vehicles(organization_id, id) on delete cascade
);

create table if not exists public.fleet_defects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  title text not null,
  description text,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','scheduled','in_repair','resolved','dismissed')),
  out_of_service boolean not null default false,
  reported_by uuid references auth.users(id) on delete set null,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  odometer_km bigint,
  engine_hours numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fleet_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  inspection_type text not null check (inspection_type in ('pre_trip','post_trip','annual','cvip','shop','custom')),
  inspection_name text,
  inspected_at timestamptz not null default now(),
  inspector_user_id uuid references auth.users(id) on delete set null,
  odometer_km bigint,
  engine_hours numeric,
  result text not null default 'pass' check (result in ('pass','pass_with_defects','fail')),
  checklist jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fleet_work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  maintenance_assignment_id uuid references public.fleet_maintenance_assignments(id) on delete set null,
  source_defect_id uuid references public.fleet_defects(id) on delete set null,
  work_order_number text not null,
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','scheduled','in_progress','waiting_parts','completed','cancelled')),
  assigned_employee_id uuid references public.employees(id) on delete set null,
  vendor text,
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  completed_odometer_km bigint,
  completed_engine_hours numeric,
  labour_cost_cents bigint not null default 0 check (labour_cost_cents >= 0),
  parts_cost_cents bigint not null default 0 check (parts_cost_cents >= 0),
  external_cost_cents bigint not null default 0 check (external_cost_cents >= 0),
  downtime_minutes integer not null default 0 check (downtime_minutes >= 0),
  completion_notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, work_order_number)
);

alter table public.fleet_service_records
  add column if not exists work_order_id uuid references public.fleet_work_orders(id) on delete set null,
  add column if not exists maintenance_assignment_id uuid references public.fleet_maintenance_assignments(id) on delete set null,
  add column if not exists labour_cost_cents bigint not null default 0,
  add column if not exists parts_cost_cents bigint not null default 0,
  add column if not exists external_cost_cents bigint not null default 0,
  add column if not exists downtime_minutes integer not null default 0;

create table if not exists public.fleet_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  document_type text not null default 'other' check (document_type in ('registration','insurance','cvip','annual_inspection','permit','manual','service_document','photo','other')),
  name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  expiry_date date,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, storage_path)
);

create index if not exists fleet_maintenance_programs_org_idx on public.fleet_maintenance_programs(organization_id, active);
create index if not exists fleet_maintenance_assignments_vehicle_idx on public.fleet_maintenance_assignments(organization_id, vehicle_id, active);
create index if not exists fleet_maintenance_assignments_program_idx on public.fleet_maintenance_assignments(program_id);
create index if not exists fleet_defects_vehicle_status_idx on public.fleet_defects(organization_id, vehicle_id, status);
create index if not exists fleet_inspections_vehicle_date_idx on public.fleet_inspections(organization_id, vehicle_id, inspected_at desc);
create index if not exists fleet_work_orders_vehicle_status_idx on public.fleet_work_orders(organization_id, vehicle_id, status);
create index if not exists fleet_work_orders_assignment_idx on public.fleet_work_orders(maintenance_assignment_id);
create index if not exists fleet_work_orders_defect_idx on public.fleet_work_orders(source_defect_id);
create index if not exists fleet_documents_vehicle_idx on public.fleet_documents(organization_id, vehicle_id);
create index if not exists fleet_service_records_work_order_idx on public.fleet_service_records(work_order_id);
create index if not exists fleet_service_records_assignment_idx on public.fleet_service_records(maintenance_assignment_id);

create or replace function private.initialize_fleet_maintenance_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p public.fleet_maintenance_programs%rowtype;
  v public.fleet_vehicles%rowtype;
begin
  select * into p from public.fleet_maintenance_programs where id = new.program_id;
  select * into v from public.fleet_vehicles where id = new.vehicle_id and organization_id = new.organization_id;
  if new.last_completed_date is null then new.last_completed_date := current_date; end if;
  if new.last_completed_odometer_km is null then new.last_completed_odometer_km := v.odometer_km; end if;
  if new.last_completed_engine_hours is null then new.last_completed_engine_hours := v.engine_hours; end if;
  if new.next_due_date is null and p.interval_days is not null then new.next_due_date := new.last_completed_date + p.interval_days; end if;
  if new.next_due_odometer_km is null and p.interval_km is not null and new.last_completed_odometer_km is not null then new.next_due_odometer_km := new.last_completed_odometer_km + p.interval_km; end if;
  if new.next_due_engine_hours is null and p.interval_engine_hours is not null and new.last_completed_engine_hours is not null then new.next_due_engine_hours := new.last_completed_engine_hours + p.interval_engine_hours; end if;
  return new;
end;
$$;

drop trigger if exists fleet_maintenance_assignment_initialize on public.fleet_maintenance_assignments;
create trigger fleet_maintenance_assignment_initialize before insert or update of program_id, vehicle_id, last_completed_date, last_completed_odometer_km, last_completed_engine_hours on public.fleet_maintenance_assignments for each row execute function private.initialize_fleet_maintenance_assignment();

create or replace function private.complete_fleet_work_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p public.fleet_maintenance_programs%rowtype;
  a public.fleet_maintenance_assignments%rowtype;
  completion_date date;
  service_type_value text;
  summary_value text;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.completed_at is null then new.completed_at := now(); end if;
    completion_date := (new.completed_at at time zone 'America/Edmonton')::date;

    update public.fleet_vehicles
      set odometer_km = coalesce(new.completed_odometer_km, odometer_km),
          engine_hours = coalesce(new.completed_engine_hours, engine_hours),
          last_service_date = completion_date
      where id = new.vehicle_id and organization_id = new.organization_id;

    if new.maintenance_assignment_id is not null then
      select * into a from public.fleet_maintenance_assignments where id = new.maintenance_assignment_id and organization_id = new.organization_id;
      if found then
        select * into p from public.fleet_maintenance_programs where id = a.program_id and organization_id = new.organization_id;
        update public.fleet_maintenance_assignments
          set last_completed_date = completion_date,
              last_completed_odometer_km = coalesce(new.completed_odometer_km, a.last_completed_odometer_km),
              last_completed_engine_hours = coalesce(new.completed_engine_hours, a.last_completed_engine_hours),
              next_due_date = case when p.interval_days is not null then completion_date + p.interval_days else null end,
              next_due_odometer_km = case when p.interval_km is not null and coalesce(new.completed_odometer_km, a.last_completed_odometer_km) is not null then coalesce(new.completed_odometer_km, a.last_completed_odometer_km) + p.interval_km else null end,
              next_due_engine_hours = case when p.interval_engine_hours is not null and coalesce(new.completed_engine_hours, a.last_completed_engine_hours) is not null then coalesce(new.completed_engine_hours, a.last_completed_engine_hours) + p.interval_engine_hours else null end
          where id = a.id;
        service_type_value := p.service_type;
      end if;
    end if;

    service_type_value := coalesce(service_type_value, 'Repair');
    summary_value := coalesce(new.completion_notes, new.description, new.title);

    insert into public.fleet_service_records (
      organization_id, vehicle_id, service_date, service_type, summary, odometer_km, engine_hours,
      vendor, work_order_number, cost_cents, notes, created_by, work_order_id, maintenance_assignment_id,
      labour_cost_cents, parts_cost_cents, external_cost_cents, downtime_minutes
    ) values (
      new.organization_id, new.vehicle_id, completion_date, service_type_value, summary_value,
      new.completed_odometer_km, new.completed_engine_hours, new.vendor, new.work_order_number,
      new.labour_cost_cents + new.parts_cost_cents + new.external_cost_cents, new.completion_notes,
      new.created_by, new.id, new.maintenance_assignment_id, new.labour_cost_cents,
      new.parts_cost_cents, new.external_cost_cents, new.downtime_minutes
    ) on conflict do nothing;

    if new.source_defect_id is not null then
      update public.fleet_defects
        set status='resolved', resolved_at=new.completed_at, resolution_notes=coalesce(new.completion_notes, resolution_notes), out_of_service=false
        where id=new.source_defect_id and organization_id=new.organization_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists fleet_work_order_complete on public.fleet_work_orders;
create trigger fleet_work_order_complete before update on public.fleet_work_orders for each row execute function private.complete_fleet_work_order();

create or replace function private.flag_vehicle_from_defect()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.out_of_service and new.status not in ('resolved','dismissed') then
    update public.fleet_vehicles set status='out_of_service' where id=new.vehicle_id and organization_id=new.organization_id and status<>'archived';
  end if;
  return new;
end;
$$;

drop trigger if exists fleet_defect_flag_vehicle on public.fleet_defects;
create trigger fleet_defect_flag_vehicle after insert or update of out_of_service, status on public.fleet_defects for each row execute function private.flag_vehicle_from_defect();

create trigger fleet_maintenance_programs_updated_at before update on public.fleet_maintenance_programs for each row execute function private.set_updated_at();
create trigger fleet_maintenance_assignments_updated_at before update on public.fleet_maintenance_assignments for each row execute function private.set_updated_at();
create trigger fleet_defects_updated_at before update on public.fleet_defects for each row execute function private.set_updated_at();
create trigger fleet_inspections_updated_at before update on public.fleet_inspections for each row execute function private.set_updated_at();
create trigger fleet_work_orders_updated_at before update on public.fleet_work_orders for each row execute function private.set_updated_at();
create trigger fleet_documents_updated_at before update on public.fleet_documents for each row execute function private.set_updated_at();

create trigger fleet_maintenance_programs_audit after insert or update or delete on public.fleet_maintenance_programs for each row execute function private.write_audit_log();
create trigger fleet_maintenance_assignments_audit after insert or update or delete on public.fleet_maintenance_assignments for each row execute function private.write_audit_log();
create trigger fleet_defects_audit after insert or update or delete on public.fleet_defects for each row execute function private.write_audit_log();
create trigger fleet_inspections_audit after insert or update or delete on public.fleet_inspections for each row execute function private.write_audit_log();
create trigger fleet_work_orders_audit after insert or update or delete on public.fleet_work_orders for each row execute function private.write_audit_log();
create trigger fleet_documents_audit after insert or update or delete on public.fleet_documents for each row execute function private.write_audit_log();

alter table public.fleet_maintenance_programs enable row level security;
alter table public.fleet_maintenance_assignments enable row level security;
alter table public.fleet_defects enable row level security;
alter table public.fleet_inspections enable row level security;
alter table public.fleet_work_orders enable row level security;
alter table public.fleet_documents enable row level security;

grant select, insert, update, delete on public.fleet_maintenance_programs to authenticated;
grant select, insert, update, delete on public.fleet_maintenance_assignments to authenticated;
grant select, insert, update, delete on public.fleet_defects to authenticated;
grant select, insert, update, delete on public.fleet_inspections to authenticated;
grant select, insert, update, delete on public.fleet_work_orders to authenticated;
grant select, insert, update, delete on public.fleet_documents to authenticated;
grant all on public.fleet_maintenance_programs, public.fleet_maintenance_assignments, public.fleet_defects, public.fleet_inspections, public.fleet_work_orders, public.fleet_documents to service_role;

create policy fleet_maintenance_programs_select on public.fleet_maintenance_programs for select to authenticated using (private.has_org_permission(organization_id,'fleet.view'));
create policy fleet_maintenance_programs_insert on public.fleet_maintenance_programs for insert to authenticated with check (private.has_org_permission(organization_id,'fleet.edit') and created_by=(select auth.uid()));
create policy fleet_maintenance_programs_update on public.fleet_maintenance_programs for update to authenticated using (private.has_org_permission(organization_id,'fleet.edit')) with check (private.has_org_permission(organization_id,'fleet.edit'));
create policy fleet_maintenance_programs_delete on public.fleet_maintenance_programs for delete to authenticated using (private.has_org_permission(organization_id,'fleet.edit'));

create policy fleet_maintenance_assignments_select on public.fleet_maintenance_assignments for select to authenticated using (private.has_org_permission(organization_id,'fleet.view'));
create policy fleet_maintenance_assignments_insert on public.fleet_maintenance_assignments for insert to authenticated with check (private.has_org_permission(organization_id,'fleet.edit') and created_by=(select auth.uid()));
create policy fleet_maintenance_assignments_update on public.fleet_maintenance_assignments for update to authenticated using (private.has_org_permission(organization_id,'fleet.edit')) with check (private.has_org_permission(organization_id,'fleet.edit'));
create policy fleet_maintenance_assignments_delete on public.fleet_maintenance_assignments for delete to authenticated using (private.has_org_permission(organization_id,'fleet.edit'));

create policy fleet_defects_select on public.fleet_defects for select to authenticated using (private.has_org_permission(organization_id,'fleet.view') or (private.has_org_permission(organization_id,'fleet.assigned.view') and private.is_vehicle_on_user_assigned_job(vehicle_id, organization_id)));
create policy fleet_defects_insert on public.fleet_defects for insert to authenticated with check ((private.has_org_permission(organization_id,'fleet.edit') or (private.has_org_permission(organization_id,'fleet.assigned.view') and private.is_vehicle_on_user_assigned_job(vehicle_id, organization_id))) and reported_by=(select auth.uid()));
create policy fleet_defects_update on public.fleet_defects for update to authenticated using (private.has_org_permission(organization_id,'fleet.edit')) with check (private.has_org_permission(organization_id,'fleet.edit'));
create policy fleet_defects_delete on public.fleet_defects for delete to authenticated using (private.has_org_permission(organization_id,'fleet.edit'));

create policy fleet_inspections_select on public.fleet_inspections for select to authenticated using (private.has_org_permission(organization_id,'fleet.view') or (private.has_org_permission(organization_id,'fleet.assigned.view') and private.is_vehicle_on_user_assigned_job(vehicle_id, organization_id)));
create policy fleet_inspections_insert on public.fleet_inspections for insert to authenticated with check ((private.has_org_permission(organization_id,'fleet.edit') or (private.has_org_permission(organization_id,'fleet.assigned.view') and private.is_vehicle_on_user_assigned_job(vehicle_id, organization_id))) and inspector_user_id=(select auth.uid()));
create policy fleet_inspections_update on public.fleet_inspections for update to authenticated using (private.has_org_permission(organization_id,'fleet.edit')) with check (private.has_org_permission(organization_id,'fleet.edit'));
create policy fleet_inspections_delete on public.fleet_inspections for delete to authenticated using (private.has_org_permission(organization_id,'fleet.edit'));

create policy fleet_work_orders_select on public.fleet_work_orders for select to authenticated using (private.has_org_permission(organization_id,'fleet.view'));
create policy fleet_work_orders_insert on public.fleet_work_orders for insert to authenticated with check (private.has_org_permission(organization_id,'fleet.edit') and created_by=(select auth.uid()));
create policy fleet_work_orders_update on public.fleet_work_orders for update to authenticated using (private.has_org_permission(organization_id,'fleet.edit')) with check (private.has_org_permission(organization_id,'fleet.edit'));
create policy fleet_work_orders_delete on public.fleet_work_orders for delete to authenticated using (private.has_org_permission(organization_id,'fleet.edit'));

create policy fleet_documents_select on public.fleet_documents for select to authenticated using (private.has_org_permission(organization_id,'fleet.view'));
create policy fleet_documents_insert on public.fleet_documents for insert to authenticated with check (private.has_org_permission(organization_id,'fleet.edit') and created_by=(select auth.uid()));
create policy fleet_documents_update on public.fleet_documents for update to authenticated using (private.has_org_permission(organization_id,'fleet.edit')) with check (private.has_org_permission(organization_id,'fleet.edit'));
create policy fleet_documents_delete on public.fleet_documents for delete to authenticated using (private.has_org_permission(organization_id,'fleet.edit'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('fleet-documents','fleet-documents',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp','text/plain']::text[])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.fleet_storage_org_id(_name text)
returns uuid
language plpgsql
stable
set search_path=''
as $$
declare first_part text;
begin
  first_part := split_part(_name,'/',1);
  if first_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return first_part::uuid; end if;
  return null;
end;
$$;

revoke all on function private.fleet_storage_org_id(text) from public;
grant execute on function private.fleet_storage_org_id(text) to authenticated;

create policy fleet_documents_storage_select on storage.objects for select to authenticated using (bucket_id='fleet-documents' and private.has_org_permission(private.fleet_storage_org_id(name),'fleet.view'));
create policy fleet_documents_storage_insert on storage.objects for insert to authenticated with check (bucket_id='fleet-documents' and private.has_org_permission(private.fleet_storage_org_id(name),'fleet.edit'));
create policy fleet_documents_storage_update on storage.objects for update to authenticated using (bucket_id='fleet-documents' and private.has_org_permission(private.fleet_storage_org_id(name),'fleet.edit')) with check (bucket_id='fleet-documents' and private.has_org_permission(private.fleet_storage_org_id(name),'fleet.edit'));
create policy fleet_documents_storage_delete on storage.objects for delete to authenticated using (bucket_id='fleet-documents' and private.has_org_permission(private.fleet_storage_org_id(name),'fleet.edit'));
