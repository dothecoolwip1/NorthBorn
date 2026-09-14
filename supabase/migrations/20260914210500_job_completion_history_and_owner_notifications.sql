alter table public.jobs add column if not exists completed_at timestamptz null;
alter table public.jobs add column if not exists completed_by uuid null references auth.users(id) on delete set null;

update public.jobs
set completed_at = coalesce(completed_at, updated_at)
where status = 'completed' and completed_at is null;

create index if not exists jobs_completed_history_idx
on public.jobs (organization_id, completed_at desc)
where status = 'completed';

create or replace function private.stamp_job_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    if new.status = 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(auth.uid(), new.completed_by);
    elsif old.status = 'completed' and new.status <> 'completed' then
      new.completed_at := null;
      new.completed_by := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.notify_job_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _customer_name text;
begin
  if old.status is distinct from new.status and new.status = 'completed' then
    select c.name into _customer_name
    from public.customers c
    where c.id = new.customer_id and c.organization_id = new.organization_id;

    insert into public.user_notifications (
      organization_id,
      recipient_user_id,
      notification_type,
      title,
      message,
      entity_type,
      entity_id,
      payload
    )
    select distinct
      new.organization_id,
      om.user_id,
      'job_completed',
      'Job completed',
      concat(new.job_number, ' · ', new.title, case when _customer_name is not null then concat(' for ', _customer_name) else '' end),
      'job',
      new.id,
      jsonb_build_object(
        'job_id', new.id,
        'job_number', new.job_number,
        'job_title', new.title,
        'customer_name', _customer_name,
        'site_name', new.site_name,
        'site_address', new.site_address,
        'completed_at', new.completed_at,
        'completed_by', new.completed_by
      )
    from public.organization_members om
    join public.membership_roles mr on mr.membership_id = om.id
    join public.roles r on r.id = mr.role_id
    where om.organization_id = new.organization_id
      and om.status = 'active'
      and r.key in ('owner','admin');

    update public.fleet_vehicles v
    set status = 'available', updated_at = now()
    where v.organization_id = new.organization_id
      and exists (
        select 1 from public.dispatch_assignments da
        where da.organization_id = new.organization_id
          and da.job_id = new.id
          and da.vehicle_id = v.id
      )
      and not exists (
        select 1
        from public.dispatch_assignments other_da
        join public.jobs other_job on other_job.id = other_da.job_id
        where other_da.organization_id = new.organization_id
          and other_da.vehicle_id = v.id
          and other_da.job_id <> new.id
          and other_job.status not in ('completed','cancelled')
      );
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_stamp_completion on public.jobs;
create trigger jobs_stamp_completion
before update of status on public.jobs
for each row execute function private.stamp_job_completion();

drop trigger if exists jobs_notify_completion on public.jobs;
create trigger jobs_notify_completion
after update of status on public.jobs
for each row execute function private.notify_job_completion();

comment on column public.jobs.completed_at is 'Timestamp when the job most recently transitioned to completed.';
comment on column public.jobs.completed_by is 'Authenticated user who most recently marked the job completed.';
