insert into public.permissions (key,module,name,description) values
  ('jobs.assigned.view','jobs','View assigned jobs','View only jobs assigned to the signed-in employee'),
  ('dispatch.assigned.view','dispatch','View assigned dispatch','View only dispatch assignments for jobs assigned to the signed-in employee'),
  ('fleet.assigned.view','fleet','View assigned units','View only vehicles assigned to jobs assigned to the signed-in employee'),
  ('employees.self.view','employees','View own employee record','View only the signed-in employee record'),
  ('safety.self.view','safety','View own safety records','View only safety records relevant to the signed-in employee'),
  ('tickets.assigned.view','tickets','View assigned job tickets','View only tickets for assigned jobs'),
  ('timesheets.self.view','timesheets','View own timesheets','View only the signed-in employee timesheets')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key = any(array[
  'jobs.assigned.view','dispatch.assigned.view','fleet.assigned.view','employees.self.view',
  'safety.self.view','tickets.assigned.view','timesheets.self.view'
])
where r.organization_id is null and r.key='operator'
on conflict do nothing;

delete from public.role_permissions rp
using public.roles r
where rp.role_id=r.id
  and r.organization_id is null
  and r.key='operator'
  and rp.permission_key = any(array[
    'dispatch.view','jobs.view','customers.view','fleet.view','employees.view',
    'safety.view','tickets.view','timesheets.view'
  ]);

create or replace function private.is_user_assigned_to_job(_job_id uuid, _organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.dispatch_assignments da
    join public.employees e
      on e.id = da.employee_id
     and e.organization_id = da.organization_id
    where da.organization_id = _organization_id
      and da.job_id = _job_id
      and e.user_id = (select auth.uid())
      and e.status <> 'archived'
  );
$$;

create or replace function private.is_vehicle_on_user_assigned_job(_vehicle_id uuid, _organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.dispatch_assignments vehicle_assignment
    join public.dispatch_assignments crew_assignment
      on crew_assignment.organization_id = vehicle_assignment.organization_id
     and crew_assignment.job_id = vehicle_assignment.job_id
    join public.employees e
      on e.id = crew_assignment.employee_id
     and e.organization_id = crew_assignment.organization_id
    where vehicle_assignment.organization_id = _organization_id
      and vehicle_assignment.vehicle_id = _vehicle_id
      and e.user_id = (select auth.uid())
      and e.status <> 'archived'
  );
$$;

revoke all on function private.is_user_assigned_to_job(uuid,uuid) from public;
revoke all on function private.is_vehicle_on_user_assigned_job(uuid,uuid) from public;
grant execute on function private.is_user_assigned_to_job(uuid,uuid) to authenticated;
grant execute on function private.is_vehicle_on_user_assigned_job(uuid,uuid) to authenticated;

drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
for select to authenticated
using (
  private.has_org_permission(organization_id,'jobs.view')
  or (
    private.has_org_permission(organization_id,'jobs.assigned.view')
    and private.is_user_assigned_to_job(id, organization_id)
  )
);

drop policy if exists dispatch_select on public.dispatch_assignments;
create policy dispatch_select on public.dispatch_assignments
for select to authenticated
using (
  private.has_org_permission(organization_id,'dispatch.view')
  or (
    private.has_org_permission(organization_id,'dispatch.assigned.view')
    and private.is_user_assigned_to_job(job_id, organization_id)
  )
);

drop policy if exists fleet_select on public.fleet_vehicles;
create policy fleet_select on public.fleet_vehicles
for select to authenticated
using (
  private.has_org_permission(organization_id,'fleet.view')
  or (
    private.has_org_permission(organization_id,'fleet.assigned.view')
    and private.is_vehicle_on_user_assigned_job(id, organization_id)
  )
);

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
for select to authenticated
using (
  private.has_org_permission(organization_id,'employees.view')
  or (
    private.has_org_permission(organization_id,'employees.self.view')
    and user_id = (select auth.uid())
  )
);
