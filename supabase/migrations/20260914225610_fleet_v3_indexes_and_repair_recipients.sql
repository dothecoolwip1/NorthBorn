create index if not exists employee_fleet_access_profiles_created_by_idx on public.employee_fleet_access_profiles(created_by) where created_by is not null;
create index if not exists employee_vehicle_access_created_by_idx on public.employee_vehicle_access(created_by) where created_by is not null;
create index if not exists fleet_defect_reports_reporter_idx on public.fleet_defect_reports(reporter_user_id);
create index if not exists fleet_defect_reports_source_inspection_idx on public.fleet_defect_reports(source_inspection_id) where source_inspection_id is not null;

create or replace function private.notify_fleet_defect_repaired()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare _unit text;
begin
  if old.status is distinct from 'resolved' and new.status='resolved' then
    select v.unit_number into _unit from public.fleet_vehicles v where v.id=new.vehicle_id;
    insert into public.user_notifications(organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload)
    select distinct new.organization_id,u.user_id,'fleet_defect_repaired','Truck repair completed',
      'Unit '||coalesce(_unit,'?')||': '||new.title||' has been repaired.',
      'fleet_defect',new.id,
      jsonb_build_object('vehicle_id',new.vehicle_id,'unit_number',_unit,'defect_id',new.id,'title',new.title)
    from (
      select e.user_id
      from public.dispatch_assignments va
      join public.jobs j on j.id=va.job_id and j.organization_id=va.organization_id
      join public.dispatch_assignments ca on ca.organization_id=va.organization_id and ca.job_id=va.job_id
      join public.employees e on e.id=ca.employee_id and e.organization_id=ca.organization_id
      where va.organization_id=new.organization_id
        and va.vehicle_id=new.vehicle_id
        and j.status not in ('completed','cancelled')
        and e.user_id is not null
        and e.status<>'archived'
      union
      select e.user_id
      from public.fleet_vehicles v
      join public.employees e on e.id=v.primary_operator_id and e.organization_id=v.organization_id
      where v.id=new.vehicle_id
        and v.organization_id=new.organization_id
        and e.user_id is not null
        and e.status<>'archived'
    ) u;
  end if;
  return new;
end;
$$;