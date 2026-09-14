create or replace function private.recalculate_fleet_program_assignments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.fleet_maintenance_assignments a
  set next_due_date = case when new.interval_days is not null and a.last_completed_date is not null then a.last_completed_date + new.interval_days else null end,
      next_due_odometer_km = case when new.interval_km is not null and a.last_completed_odometer_km is not null then a.last_completed_odometer_km + new.interval_km else null end,
      next_due_engine_hours = case when new.interval_engine_hours is not null and a.last_completed_engine_hours is not null then a.last_completed_engine_hours + new.interval_engine_hours else null end
  where a.program_id = new.id and a.organization_id = new.organization_id;
  return new;
end;
$$;

drop trigger if exists fleet_program_recalculate_assignments on public.fleet_maintenance_programs;
create trigger fleet_program_recalculate_assignments
after update of interval_days, interval_km, interval_engine_hours on public.fleet_maintenance_programs
for each row execute function private.recalculate_fleet_program_assignments();

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
  should_complete boolean;
begin
  should_complete := new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed');
  if should_complete then
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
    );
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
create trigger fleet_work_order_complete before insert or update on public.fleet_work_orders for each row execute function private.complete_fleet_work_order();
