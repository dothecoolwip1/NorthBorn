alter table public.jobs add column if not exists dispatch_stage text;
alter table public.jobs add column if not exists dispatch_acknowledged_at timestamptz;
alter table public.jobs add column if not exists en_route_at timestamptz;
alter table public.jobs add column if not exists onsite_at timestamptz;
alter table public.jobs add column if not exists work_started_at timestamptz;
alter table public.jobs add column if not exists work_completed_at timestamptz;
alter table public.jobs add column if not exists dispatch_contact_name text;
alter table public.jobs add column if not exists dispatch_contact_phone text;
alter table public.jobs add column if not exists emergency_contact_name text;
alter table public.jobs add column if not exists emergency_contact_phone text;
alter table public.jobs add column if not exists primary_operator_employee_id uuid references public.employees(id) on delete set null;
alter table public.jobs add column if not exists recurrence_series_id uuid;
alter table public.jobs add column if not exists recurrence_rule text;
alter table public.jobs add column if not exists recurrence_parent_id uuid references public.jobs(id) on delete set null;

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in ('draft','scheduled','dispatched','in_progress','active','completed','cancelled'));

update public.jobs j
set dispatch_stage = case
  when j.status='completed' then 'work_completed'
  when j.status in ('active','in_progress') then 'work_started'
  when j.status='dispatched' then 'dispatched'
  when exists(select 1 from public.dispatch_assignments a where a.job_id=j.id and a.employee_id is not null)
   and exists(select 1 from public.dispatch_assignments a where a.job_id=j.id and a.vehicle_id is not null) then 'ready'
  else 'unassigned'
end
where dispatch_stage is null;

alter table public.jobs alter column dispatch_stage set default 'unassigned';
alter table public.jobs alter column dispatch_stage set not null;
alter table public.jobs drop constraint if exists jobs_dispatch_stage_check;
alter table public.jobs add constraint jobs_dispatch_stage_check
  check (dispatch_stage in ('unassigned','ready','dispatched','acknowledged','en_route','onsite','work_started','work_completed'));

create index if not exists jobs_org_dispatch_stage_idx on public.jobs(organization_id,dispatch_stage);
create index if not exists jobs_recurrence_series_idx on public.jobs(organization_id,recurrence_series_id) where recurrence_series_id is not null;

create table if not exists public.job_operation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  event_type text not null,
  from_value text,
  to_value text,
  details jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists job_operation_events_job_idx on public.job_operation_events(organization_id,job_id,created_at desc);
alter table public.job_operation_events enable row level security;
grant select on public.job_operation_events to authenticated;
grant all on public.job_operation_events to service_role;

drop policy if exists job_operation_events_select on public.job_operation_events;
create policy job_operation_events_select on public.job_operation_events
for select to authenticated
using (
  private.has_org_permission(organization_id,'jobs.view')
  or (
    private.has_org_permission(organization_id,'jobs.assigned.view')
    and private.is_user_assigned_to_job(job_id,organization_id)
  )
);

create or replace function private.record_job_operation_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  _actor uuid := (select auth.uid());
begin
  if tg_op='INSERT' then
    insert into public.job_operation_events(organization_id,job_id,event_type,to_value,details,actor_user_id)
    values(new.organization_id,new.id,'job_created',new.status,
      jsonb_build_object('job_number',new.job_number,'title',new.title,'dispatch_stage',new.dispatch_stage),_actor);
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.job_operation_events(organization_id,job_id,event_type,from_value,to_value,details,actor_user_id)
    values(new.organization_id,new.id,'status_changed',old.status,new.status,'{}'::jsonb,_actor);
  end if;

  if old.dispatch_stage is distinct from new.dispatch_stage then
    insert into public.job_operation_events(organization_id,job_id,event_type,from_value,to_value,details,actor_user_id)
    values(new.organization_id,new.id,'dispatch_stage_changed',old.dispatch_stage,new.dispatch_stage,'{}'::jsonb,_actor);
  end if;

  if old.shop_time is distinct from new.shop_time
     or old.onsite_time is distinct from new.onsite_time
     or old.scheduled_start is distinct from new.scheduled_start
     or old.scheduled_end is distinct from new.scheduled_end then
    insert into public.job_operation_events(organization_id,job_id,event_type,details,actor_user_id)
    values(new.organization_id,new.id,'schedule_changed',
      jsonb_build_object('shop_time',new.shop_time,'onsite_time',new.onsite_time,'scheduled_end',new.scheduled_end),_actor);
  end if;

  if old.primary_operator_employee_id is distinct from new.primary_operator_employee_id
     or old.dispatch_contact_phone is distinct from new.dispatch_contact_phone
     or old.emergency_contact_phone is distinct from new.emergency_contact_phone then
    insert into public.job_operation_events(organization_id,job_id,event_type,details,actor_user_id)
    values(new.organization_id,new.id,'operations_contacts_changed',
      jsonb_build_object(
        'primary_operator_employee_id',new.primary_operator_employee_id,
        'dispatch_contact_name',new.dispatch_contact_name,
        'dispatch_contact_phone',new.dispatch_contact_phone,
        'emergency_contact_name',new.emergency_contact_name,
        'emergency_contact_phone',new.emergency_contact_phone
      ),_actor);
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_operation_history on public.jobs;
create trigger jobs_operation_history
after insert or update on public.jobs
for each row execute function private.record_job_operation_event();

create or replace function private.sync_job_dispatch_readiness(_organization_id uuid,_job_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _stage text;
  _status text;
  _has_crew boolean;
  _has_unit boolean;
  _next text;
begin
  select dispatch_stage,status into _stage,_status
  from public.jobs
  where id=_job_id and organization_id=_organization_id;

  if _stage is null or _status in ('completed','cancelled') or _stage not in ('unassigned','ready') then return; end if;

  select exists(select 1 from public.dispatch_assignments where organization_id=_organization_id and job_id=_job_id and employee_id is not null),
         exists(select 1 from public.dispatch_assignments where organization_id=_organization_id and job_id=_job_id and vehicle_id is not null)
    into _has_crew,_has_unit;

  _next := case when _has_crew and _has_unit then 'ready' else 'unassigned' end;
  if _next is distinct from _stage then
    update public.jobs set dispatch_stage=_next where id=_job_id and organization_id=_organization_id;
  end if;
end;
$$;

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
  _event := case
    when tg_op='DELETE' and _row.employee_id is not null then 'crew_unassigned'
    when tg_op='DELETE' and _row.vehicle_id is not null then 'unit_unassigned'
    when tg_op='INSERT' and _row.employee_id is not null then 'crew_assigned'
    when tg_op='INSERT' and _row.vehicle_id is not null then 'unit_assigned'
    else 'assignment_changed'
  end;

  insert into public.job_operation_events(organization_id,job_id,event_type,details,actor_user_id)
  values(_row.organization_id,_row.job_id,_event,
    jsonb_build_object('employee_id',_row.employee_id,'vehicle_id',_row.vehicle_id,'role',_row.role),
    (select auth.uid()));

  perform private.sync_job_dispatch_readiness(_row.organization_id,_row.job_id);
  return coalesce(new,old);
end;
$$;

drop trigger if exists dispatch_assignment_history on public.dispatch_assignments;
create trigger dispatch_assignment_history
after insert or update or delete on public.dispatch_assignments
for each row execute function private.record_dispatch_assignment_event();

create or replace function public.set_internal_job_dispatch_stage(_organization_id uuid,_job_id uuid,_stage text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _job public.jobs%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  if not private.has_org_permission(_organization_id,'dispatch.edit') then raise exception 'Dispatch access required.'; end if;
  if _stage not in ('unassigned','ready','dispatched','acknowledged','en_route','onsite','work_started','work_completed') then
    raise exception 'Invalid dispatch stage.';
  end if;
  select * into _job from public.jobs where id=_job_id and organization_id=_organization_id for update;
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
      updated_at=now()
  where id=_job_id and organization_id=_organization_id
  returning * into _job;
  return to_jsonb(_job);
end;
$$;

create or replace function public.set_my_assigned_job_dispatch_stage(_organization_id uuid,_job_id uuid,_stage text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
$$;

create or replace function public.complete_my_assigned_job(_organization_id uuid,_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _user_id uuid := (select auth.uid());
  _job public.jobs%rowtype;
begin
  if _user_id is null then raise exception 'Sign in required.'; end if;
  select * into _job from public.jobs where id=_job_id and organization_id=_organization_id;
  if _job.id is null then raise exception 'Job not found.'; end if;
  if not private.has_org_permission(_organization_id,'jobs.assigned.view')
     or not private.is_user_assigned_to_job(_job_id,_organization_id) then
    raise exception 'You can only complete jobs assigned to you.';
  end if;
  if _job.status='cancelled' then raise exception 'A cancelled job cannot be completed.'; end if;
  if _job.status<>'completed' or _job.dispatch_stage<>'work_completed' then
    update public.jobs
    set status='completed',
        dispatch_stage='work_completed',
        completed_at=coalesce(completed_at,now()),
        completed_by=coalesce(completed_by,_user_id),
        work_completed_at=coalesce(work_completed_at,now()),
        updated_at=now()
    where id=_job_id and organization_id=_organization_id;
  end if;
  return jsonb_build_object('job_id',_job_id,'status','completed','dispatch_stage','work_completed','completed_at',coalesce(_job.completed_at,now()));
end;
$$;

revoke all on function public.set_internal_job_dispatch_stage(uuid,uuid,text) from public;
revoke all on function public.set_my_assigned_job_dispatch_stage(uuid,uuid,text) from public;
revoke all on function private.sync_job_dispatch_readiness(uuid,uuid) from public;
grant execute on function public.set_internal_job_dispatch_stage(uuid,uuid,text) to authenticated;
grant execute on function public.set_my_assigned_job_dispatch_stage(uuid,uuid,text) to authenticated;

comment on column public.jobs.dispatch_stage is 'Operational dispatch progress independent of the broader job lifecycle.';
comment on table public.job_operation_events is 'Human-readable operational history for job status, dispatch progress, schedule and assignment changes.';
