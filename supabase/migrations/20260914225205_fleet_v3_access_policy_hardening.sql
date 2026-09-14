create or replace function private.is_current_user_employee(_employee_id uuid,_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.employees e
    where e.id=_employee_id
      and e.organization_id=_organization_id
      and e.user_id=(select auth.uid())
      and e.status<>'archived'
  );
$$;

drop policy if exists employee_fleet_access_profiles_select on public.employee_fleet_access_profiles;
create policy employee_fleet_access_profiles_select on public.employee_fleet_access_profiles
for select to authenticated
using (
  private.has_org_permission(organization_id,'fleet.edit')
  or private.is_current_user_employee(employee_id,organization_id)
);

drop policy if exists employee_vehicle_access_select on public.employee_vehicle_access;
create policy employee_vehicle_access_select on public.employee_vehicle_access
for select to authenticated
using (
  private.has_org_permission(organization_id,'fleet.edit')
  or private.is_current_user_employee(employee_id,organization_id)
);

alter table public.fleet_defect_reports disable trigger fleet_defect_report_notify;
insert into public.fleet_defect_reports(
  organization_id,defect_id,vehicle_id,reporter_user_id,raw_title,raw_description,odometer_km,engine_hours,reported_at
)
select d.organization_id,d.id,d.vehicle_id,d.reported_by,d.title,d.description,d.odometer_km,d.engine_hours,d.reported_at
from public.fleet_defects d
where d.reported_by is not null
  and not exists(select 1 from public.fleet_defect_reports r where r.defect_id=d.id);
alter table public.fleet_defect_reports enable trigger fleet_defect_report_notify;

update public.fleet_defects d
set report_count=x.cnt,last_reported_at=coalesce(x.latest,d.reported_at)
from (
  select defect_id,count(*)::integer cnt,max(reported_at) latest
  from public.fleet_defect_reports
  group by defect_id
) x
where x.defect_id=d.id;