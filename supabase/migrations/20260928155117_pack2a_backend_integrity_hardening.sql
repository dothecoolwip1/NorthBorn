revoke all on function private.record_job_operation_event() from public;
revoke all on function private.record_job_operation_event() from anon;
revoke all on function private.record_job_operation_event() from authenticated;
revoke all on function private.record_job_operation_event() from service_role;

create or replace function private.validate_job_primary_operator_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.primary_operator_employee_id is not null
     and not exists (
       select 1
       from public.employees e
       where e.id = new.primary_operator_employee_id
         and e.organization_id = new.organization_id
     ) then
    raise exception 'Primary operator must belong to the same organization as the job.';
  end if;
  return new;
end;
$function$;

revoke all on function private.validate_job_primary_operator_tenant() from public;
revoke all on function private.validate_job_primary_operator_tenant() from anon;
revoke all on function private.validate_job_primary_operator_tenant() from authenticated;
revoke all on function private.validate_job_primary_operator_tenant() from service_role;

drop trigger if exists jobs_validate_primary_operator_tenant on public.jobs;
create trigger jobs_validate_primary_operator_tenant
before insert or update of organization_id, primary_operator_employee_id on public.jobs
for each row execute function private.validate_job_primary_operator_tenant();

create or replace function private.validate_dispatch_assignment_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.jobs j
    where j.id = new.job_id
      and j.organization_id = new.organization_id
  ) then
    raise exception 'Assigned job must belong to the same organization.';
  end if;

  if new.employee_id is not null
     and not exists (
       select 1 from public.employees e
       where e.id = new.employee_id
         and e.organization_id = new.organization_id
     ) then
    raise exception 'Assigned employee must belong to the same organization.';
  end if;

  if new.vehicle_id is not null
     and not exists (
       select 1 from public.fleet_vehicles v
       where v.id = new.vehicle_id
         and v.organization_id = new.organization_id
     ) then
    raise exception 'Assigned unit must belong to the same organization.';
  end if;

  return new;
end;
$function$;

revoke all on function private.validate_dispatch_assignment_tenant() from public;
revoke all on function private.validate_dispatch_assignment_tenant() from anon;
revoke all on function private.validate_dispatch_assignment_tenant() from authenticated;
revoke all on function private.validate_dispatch_assignment_tenant() from service_role;

drop trigger if exists dispatch_assignments_validate_tenant on public.dispatch_assignments;
create trigger dispatch_assignments_validate_tenant
before insert or update of organization_id, job_id, employee_id, vehicle_id on public.dispatch_assignments
for each row execute function private.validate_dispatch_assignment_tenant();

create or replace function private.record_dispatch_assignment_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  _row public.dispatch_assignments%rowtype;
  _event text;
begin
  _row := case when tg_op='DELETE' then old else new end;

  if not exists (
    select 1
    from public.jobs j
    where j.id = _row.job_id
      and j.organization_id = _row.organization_id
  ) then
    return coalesce(new,old);
  end if;

  _event := case
    when tg_op='DELETE' and _row.employee_id is not null then 'crew_unassigned'
    when tg_op='DELETE' and _row.vehicle_id is not null then 'unit_unassigned'
    when tg_op='INSERT' and _row.employee_id is not null then 'crew_assigned'
    when tg_op='INSERT' and _row.vehicle_id is not null then 'unit_assigned'
    else 'assignment_changed'
  end;

  insert into public.job_operation_events(organization_id,job_id,event_type,details,actor_user_id)
  values(
    _row.organization_id,
    _row.job_id,
    _event,
    jsonb_build_object('employee_id',_row.employee_id,'vehicle_id',_row.vehicle_id,'role',_row.role),
    (select auth.uid())
  );

  if tg_op='DELETE' and _row.employee_id is not null then
    update public.jobs
    set primary_operator_employee_id = null,
        updated_at = now()
    where id = _row.job_id
      and organization_id = _row.organization_id
      and primary_operator_employee_id = _row.employee_id;
  end if;

  perform private.sync_job_dispatch_readiness(_row.organization_id,_row.job_id);
  return coalesce(new,old);
end;
$function$;

revoke all on function private.record_dispatch_assignment_event() from public;
revoke all on function private.record_dispatch_assignment_event() from anon;
revoke all on function private.record_dispatch_assignment_event() from authenticated;
revoke all on function private.record_dispatch_assignment_event() from service_role;

create or replace function public.set_internal_job_dispatch_stage(_organization_id uuid,_job_id uuid,_stage text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  _job public.jobs%rowtype;
  _user_id uuid := (select auth.uid());
  _has_crew boolean;
  _has_unit boolean;
begin
  if _user_id is null then raise exception 'Sign in required.'; end if;
  if not private.has_org_permission(_organization_id,'dispatch.edit') then raise exception 'Dispatch access required.'; end if;
  if _stage not in ('unassigned','ready','dispatched','acknowledged','en_route','onsite','work_started','work_completed') then
    raise exception 'Invalid dispatch stage.';
  end if;

  select * into _job
  from public.jobs
  where id=_job_id and organization_id=_organization_id
  for update;

  if _job.id is null then raise exception 'Job not found.'; end if;
  if _job.status='cancelled' and _stage<>'unassigned' then raise exception 'Cancelled jobs cannot be dispatched.'; end if;

  if _stage in ('ready','dispatched') then
    select
      exists(select 1 from public.dispatch_assignments a where a.organization_id=_organization_id and a.job_id=_job_id and a.employee_id is not null),
      exists(select 1 from public.dispatch_assignments a where a.organization_id=_organization_id and a.job_id=_job_id and a.vehicle_id is not null)
    into _has_crew,_has_unit;
    if not _has_crew or not _has_unit then
      raise exception 'Assign at least one crew member and one unit before moving this job to Ready or Dispatched.';
    end if;
  end if;

  update public.jobs
  set dispatch_stage=_stage,
      status=case
        when _stage='work_completed' then 'completed'
        when _stage='work_started' then 'active'
        when status='draft' and _stage='unassigned' then 'draft'
        when status not in ('completed','cancelled') then 'scheduled'
        else status
      end,
      dispatch_acknowledged_at=case when _stage='acknowledged' then coalesce(dispatch_acknowledged_at,now()) else dispatch_acknowledged_at end,
      en_route_at=case when _stage='en_route' then coalesce(en_route_at,now()) else en_route_at end,
      onsite_at=case when _stage='onsite' then coalesce(onsite_at,now()) else onsite_at end,
      work_started_at=case when _stage='work_started' then coalesce(work_started_at,now()) else work_started_at end,
      work_completed_at=case when _stage='work_completed' then coalesce(work_completed_at,now()) else work_completed_at end,
      completed_at=case when _stage='work_completed' then coalesce(completed_at,now()) else completed_at end,
      completed_by=case when _stage='work_completed' then coalesce(completed_by,_user_id) else completed_by end,
      updated_at=now()
  where id=_job_id and organization_id=_organization_id
  returning * into _job;

  return to_jsonb(_job);
end;
$function$;

create or replace function public.set_my_assigned_job_dispatch_stage(_organization_id uuid,_job_id uuid,_stage text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  _job public.jobs%rowtype;
  _order text[] := array['unassigned','ready','dispatched','acknowledged','en_route','onsite','work_started','work_completed'];
  _current_pos integer;
  _next_pos integer;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if not private.has_org_permission(_organization_id,'jobs.assigned.view')
     or not private.is_user_assigned_to_job(_job_id,_organization_id) then
    raise exception 'You can only update jobs assigned to you.';
  end if;
  if _stage not in ('acknowledged','en_route','onsite','work_started') then raise exception 'Invalid operator stage.'; end if;

  select * into _job from public.jobs where id=_job_id and organization_id=_organization_id for update;
  if _job.id is null then raise exception 'Job not found.'; end if;
  if _job.status in ('cancelled','completed') then raise exception 'This job is closed.'; end if;

  _current_pos := array_position(_order,_job.dispatch_stage);
  _next_pos := array_position(_order,_stage);
  if _current_pos is null or _current_pos < 3 then raise exception 'Dispatch must send this job before field acknowledgement.'; end if;
  if _next_pos < _current_pos then raise exception 'Dispatch progress cannot move backwards from the field app.'; end if;
  if _next_pos > _current_pos + 1 then raise exception 'Dispatch progress must advance one stage at a time.'; end if;

  update public.jobs
  set dispatch_stage=_stage,
      status=case when _stage='work_started' then 'active' else status end,
      dispatch_acknowledged_at=case when _stage='acknowledged' then coalesce(dispatch_acknowledged_at,now()) else dispatch_acknowledged_at end,
      en_route_at=case when _stage='en_route' then coalesce(en_route_at,now()) else en_route_at end,
      onsite_at=case when _stage='onsite' then coalesce(onsite_at,now()) else onsite_at end,
      work_started_at=case when _stage='work_started' then coalesce(work_started_at,now()) else work_started_at end,
      updated_at=now()
  where id=_job_id and organization_id=_organization_id
  returning * into _job;
  return to_jsonb(_job);
end;
$function$;

create or replace function public.complete_my_assigned_job(_organization_id uuid,_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  _user_id uuid := (select auth.uid());
  _job public.jobs%rowtype;
begin
  if _user_id is null then raise exception 'Sign in required.'; end if;

  select * into _job
  from public.jobs
  where id=_job_id and organization_id=_organization_id
  for update;

  if _job.id is null then raise exception 'Job not found.'; end if;
  if not private.has_org_permission(_organization_id,'jobs.assigned.view')
     or not private.is_user_assigned_to_job(_job_id,_organization_id) then
    raise exception 'You can only complete jobs assigned to you.';
  end if;
  if _job.status='cancelled' then raise exception 'A cancelled job cannot be completed.'; end if;

  if _job.status <> 'completed' and _job.dispatch_stage <> 'work_started' then
    raise exception 'Start work before completing this job.';
  end if;

  if _job.status<>'completed' or _job.dispatch_stage<>'work_completed' then
    update public.jobs
    set status='completed',
        dispatch_stage='work_completed',
        completed_at=coalesce(completed_at,now()),
        completed_by=coalesce(completed_by,_user_id),
        work_completed_at=coalesce(work_completed_at,now()),
        updated_at=now()
    where id=_job_id and organization_id=_organization_id
    returning * into _job;
  end if;

  return jsonb_build_object(
    'job_id',_job_id,
    'status','completed',
    'dispatch_stage','work_completed',
    'completed_at',_job.completed_at
  );
end;
$function$;

revoke all on function public.set_internal_job_dispatch_stage(uuid,uuid,text) from public;
revoke all on function public.set_internal_job_dispatch_stage(uuid,uuid,text) from anon;
grant execute on function public.set_internal_job_dispatch_stage(uuid,uuid,text) to authenticated;
grant execute on function public.set_internal_job_dispatch_stage(uuid,uuid,text) to service_role;

revoke all on function public.set_my_assigned_job_dispatch_stage(uuid,uuid,text) from public;
revoke all on function public.set_my_assigned_job_dispatch_stage(uuid,uuid,text) from anon;
grant execute on function public.set_my_assigned_job_dispatch_stage(uuid,uuid,text) to authenticated;
grant execute on function public.set_my_assigned_job_dispatch_stage(uuid,uuid,text) to service_role;

revoke all on function public.complete_my_assigned_job(uuid,uuid) from public;
revoke all on function public.complete_my_assigned_job(uuid,uuid) from anon;
grant execute on function public.complete_my_assigned_job(uuid,uuid) to authenticated;
grant execute on function public.complete_my_assigned_job(uuid,uuid) to service_role;
