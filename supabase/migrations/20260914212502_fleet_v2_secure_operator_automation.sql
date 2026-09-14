create or replace function private.update_vehicle_meters_from_inspection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fleet_vehicles
     set odometer_km = case
           when new.odometer_km is null then odometer_km
           when odometer_km is null then new.odometer_km
           else greatest(odometer_km, new.odometer_km)
         end,
         engine_hours = case
           when new.engine_hours is null then engine_hours
           when engine_hours is null then new.engine_hours
           else greatest(engine_hours, new.engine_hours)
         end
   where id = new.vehicle_id and organization_id = new.organization_id;
  return new;
end;
$$;

create or replace function private.flag_vehicle_from_defect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.out_of_service and new.status not in ('resolved','dismissed') then
    update public.fleet_vehicles
       set status = 'out_of_service'
     where id = new.vehicle_id and organization_id = new.organization_id and status <> 'archived';
  elsif (not new.out_of_service or new.status in ('resolved','dismissed')) then
    if not exists (
      select 1 from public.fleet_defects d
       where d.organization_id = new.organization_id
         and d.vehicle_id = new.vehicle_id
         and d.id <> new.id
         and d.out_of_service = true
         and d.status not in ('resolved','dismissed')
    ) then
      update public.fleet_vehicles
         set status = 'available'
       where id = new.vehicle_id and organization_id = new.organization_id and status = 'out_of_service';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.update_vehicle_meters_from_inspection() from public;
revoke all on function private.flag_vehicle_from_defect() from public;
