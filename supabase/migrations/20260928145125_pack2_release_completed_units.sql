create or replace function private.release_closed_job_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status in ('completed','cancelled') or new.dispatch_stage = 'work_completed' then
    update public.fleet_vehicles v
    set status = 'available',
        updated_at = now()
    where v.organization_id = new.organization_id
      and v.status = 'assigned'
      and exists (
        select 1
        from public.dispatch_assignments a
        where a.organization_id = new.organization_id
          and a.job_id = new.id
          and a.vehicle_id = v.id
      )
      and not exists (
        select 1
        from public.dispatch_assignments other_a
        join public.jobs other_j on other_j.id = other_a.job_id
        where other_a.organization_id = new.organization_id
          and other_a.vehicle_id = v.id
          and other_a.job_id <> new.id
          and other_j.organization_id = new.organization_id
          and other_j.status not in ('completed','cancelled')
      );
  end if;

  return new;
end;
$function$;

revoke all on function private.release_closed_job_units() from public;
revoke all on function private.release_closed_job_units() from anon;
revoke all on function private.release_closed_job_units() from authenticated;
revoke all on function private.release_closed_job_units() from service_role;

drop trigger if exists jobs_release_units_on_close on public.jobs;
create trigger jobs_release_units_on_close
after update of status, dispatch_stage on public.jobs
for each row
when (
  new.status in ('completed','cancelled')
  or new.dispatch_stage = 'work_completed'
)
execute function private.release_closed_job_units();

update public.fleet_vehicles v
set status = 'available',
    updated_at = now()
where v.status = 'assigned'
  and exists (
    select 1
    from public.dispatch_assignments a
    join public.jobs j on j.id = a.job_id
    where a.vehicle_id = v.id
      and a.organization_id = v.organization_id
      and j.organization_id = v.organization_id
      and j.status in ('completed','cancelled')
  )
  and not exists (
    select 1
    from public.dispatch_assignments a
    join public.jobs j on j.id = a.job_id
    where a.vehicle_id = v.id
      and a.organization_id = v.organization_id
      and j.organization_id = v.organization_id
      and j.status not in ('completed','cancelled')
  );
