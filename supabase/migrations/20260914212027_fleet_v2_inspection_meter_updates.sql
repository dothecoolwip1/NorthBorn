create or replace function private.update_vehicle_meters_from_inspection()
returns trigger
language plpgsql
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

drop trigger if exists fleet_inspection_update_vehicle_meters on public.fleet_inspections;
create trigger fleet_inspection_update_vehicle_meters
after insert on public.fleet_inspections
for each row execute function private.update_vehicle_meters_from_inspection();
