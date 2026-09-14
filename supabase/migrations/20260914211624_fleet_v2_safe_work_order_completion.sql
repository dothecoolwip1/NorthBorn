create unique index if not exists fleet_service_records_work_order_unique
  on public.fleet_service_records(work_order_id)
  where work_order_id is not null;

create or replace function private.set_fleet_work_order_completion_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') and new.completed_at is null then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.after_complete_fleet_work_order()
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
  should_complete boolean;
begin
  should_complete := new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed');
  if not should_complete then return new; end if;

  completion_date := (coalesce(new.completed_at, now()) at time zone 'America/Edmonton')::date;

  update public.fleet_vehicles
     set odometer_km = coalesce(new.completed_odometer_km, odometer_km),
         engine_hours = coalesce(new.completed_engine_hours, engine_hours),
         last_service_date = completion_date
   where id = new.vehicle_id and organization_id = new.organization_id;

  if new.maintenance_assignment_id is not null then
    select * into a from public.fleet_maintenance_assignments
     where id = new.maintenance_assignment_id and organization_id = new.organization_id;
    if found then
      select * into p from public.fleet_maintenance_programs
       where id = a.program_id and organization_id = new.organization_id;
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
       set status = 'resolved', resolved_at = coalesce(new.completed_at, now()),
           resolution_notes = coalesce(new.completion_notes, resolution_notes), out_of_service = false
     where id = new.source_defect_id and organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists fleet_work_order_complete on public.fleet_work_orders;
drop trigger if exists fleet_work_order_completion_time on public.fleet_work_orders;
drop trigger if exists fleet_work_order_after_complete on public.fleet_work_orders;
create trigger fleet_work_order_completion_time before insert or update on public.fleet_work_orders for each row execute function private.set_fleet_work_order_completion_time();
create trigger fleet_work_order_after_complete after insert or update on public.fleet_work_orders for each row execute function private.after_complete_fleet_work_order();

create or replace function private.flag_vehicle_from_defect()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.out_of_service and new.status not in ('resolved','dismissed') then
    update public.fleet_vehicles set status = 'out_of_service'
     where id = new.vehicle_id and organization_id = new.organization_id and status <> 'archived';
  elsif (not new.out_of_service or new.status in ('resolved','dismissed')) then
    if not exists (
      select 1 from public.fleet_defects d
       where d.organization_id = new.organization_id and d.vehicle_id = new.vehicle_id and d.id <> new.id
         and d.out_of_service = true and d.status not in ('resolved','dismissed')
    ) then
      update public.fleet_vehicles set status = 'available'
       where id = new.vehicle_id and organization_id = new.organization_id and status = 'out_of_service';
    end if;
  end if;
  return new;
end;
$$;
