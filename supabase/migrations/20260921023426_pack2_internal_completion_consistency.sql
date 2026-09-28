create or replace function public.set_internal_job_dispatch_stage(_organization_id uuid,_job_id uuid,_stage text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _job public.jobs%rowtype;
  _user_id uuid := (select auth.uid());
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
$$;

revoke all on function public.set_internal_job_dispatch_stage(uuid,uuid,text) from anon;
revoke all on function public.set_internal_job_dispatch_stage(uuid,uuid,text) from public;
grant execute on function public.set_internal_job_dispatch_stage(uuid,uuid,text) to authenticated;
grant execute on function public.set_internal_job_dispatch_stage(uuid,uuid,text) to service_role;
