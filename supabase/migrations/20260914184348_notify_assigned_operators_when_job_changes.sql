create or replace function private.notify_assigned_operators_job_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  crew_user record;
  changed boolean := false;
begin
  changed :=
    old.title is distinct from new.title or
    old.site_name is distinct from new.site_name or
    old.site_address is distinct from new.site_address or
    old.shop_time is distinct from new.shop_time or
    old.onsite_time is distinct from new.onsite_time or
    old.scheduled_end is distinct from new.scheduled_end or
    old.notes is distinct from new.notes or
    old.status is distinct from new.status;

  if not changed then return new; end if;

  for crew_user in
    select distinct e.user_id
    from public.dispatch_assignments da
    join public.employees e on e.id=da.employee_id and e.organization_id=da.organization_id
    where da.organization_id=new.organization_id
      and da.job_id=new.id
      and e.user_id is not null
  loop
    insert into public.user_notifications(
      organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload
    ) values (
      new.organization_id,
      crew_user.user_id,
      'job_updated',
      'Job updated',
      new.title,
      'job',
      new.id,
      jsonb_build_object(
        'job_number',new.job_number,
        'job_title',new.title,
        'site_name',new.site_name,
        'site_address',new.site_address,
        'shop_time',new.shop_time,
        'onsite_time',new.onsite_time,
        'scheduled_end',new.scheduled_end,
        'status',new.status
      )
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.notify_assigned_operators_job_update() from public,anon,authenticated;
drop trigger if exists jobs_notify_assigned_operators_update on public.jobs;
create trigger jobs_notify_assigned_operators_update
after update on public.jobs
for each row execute function private.notify_assigned_operators_job_update();