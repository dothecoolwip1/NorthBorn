create or replace function private.enforce_fleet_defect_hold_status()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.defect_hold then
    new.status := 'out_of_service';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_fleet_defect_hold_status() from public,anon,authenticated,service_role;

drop trigger if exists enforce_fleet_defect_hold_status on public.fleet_vehicles;
create trigger enforce_fleet_defect_hold_status
before insert or update on public.fleet_vehicles
for each row execute function private.enforce_fleet_defect_hold_status();

create or replace function private.prevent_blocked_vehicle_dispatch()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.vehicle_id is not null and exists(
    select 1 from public.fleet_vehicles v
    where v.id=new.vehicle_id
      and v.organization_id=new.organization_id
      and (v.defect_hold=true or v.status='out_of_service')
  ) then
    raise exception 'This unit is out of service and cannot be dispatched';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_blocked_vehicle_dispatch() from public,anon,authenticated,service_role;

drop trigger if exists prevent_blocked_vehicle_dispatch on public.dispatch_assignments;
create trigger prevent_blocked_vehicle_dispatch
before insert or update of vehicle_id on public.dispatch_assignments
for each row execute function private.prevent_blocked_vehicle_dispatch();
