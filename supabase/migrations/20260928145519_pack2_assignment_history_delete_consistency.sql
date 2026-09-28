create or replace function private.record_dispatch_assignment_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
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

  perform private.sync_job_dispatch_readiness(_row.organization_id,_row.job_id);
  return coalesce(new,old);
end;
$$;

revoke all on function private.record_dispatch_assignment_event() from public;
revoke all on function private.record_dispatch_assignment_event() from anon;
revoke all on function private.record_dispatch_assignment_event() from authenticated;
revoke all on function private.record_dispatch_assignment_event() from service_role;
