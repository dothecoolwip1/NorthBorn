alter table public.jobs add column if not exists shop_time timestamptz;
alter table public.jobs add column if not exists onsite_time timestamptz;

update public.jobs
set onsite_time=scheduled_start
where onsite_time is null and scheduled_start is not null;

create index if not exists jobs_org_shop_time_idx on public.jobs(organization_id, shop_time);
create index if not exists jobs_org_onsite_time_idx on public.jobs(organization_id, onsite_time);

create or replace function private.notify_dispatch_assignment_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  target_employee_id uuid;
  target_user_id uuid;
  target_org_id uuid;
  target_job_id uuid;
  target_vehicle_id uuid;
  job_row public.jobs%rowtype;
  vehicle_row public.fleet_vehicles%rowtype;
  event_kind text;
  crew_user record;
begin
  if tg_op='INSERT' then
    target_employee_id := new.employee_id;
    target_vehicle_id := new.vehicle_id;
    target_org_id := new.organization_id;
    target_job_id := new.job_id;
  elsif tg_op='DELETE' then
    target_employee_id := old.employee_id;
    target_vehicle_id := old.vehicle_id;
    target_org_id := old.organization_id;
    target_job_id := old.job_id;
  else
    return coalesce(new,old);
  end if;

  select j.* into job_row from public.jobs j where j.id=target_job_id and j.organization_id=target_org_id;

  if target_employee_id is not null then
    select e.user_id into target_user_id
    from public.employees e
    where e.id=target_employee_id and e.organization_id=target_org_id;

    if target_user_id is not null then
      event_kind := case when tg_op='INSERT' then 'job_assigned' else 'job_unassigned' end;
      insert into public.user_notifications(
        organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload
      ) values (
        target_org_id,target_user_id,event_kind,
        case when event_kind='job_assigned' then 'New job assigned' else 'Removed from job' end,
        job_row.title,'job',target_job_id,
        jsonb_build_object(
          'job_number',job_row.job_number,
          'job_title',job_row.title,
          'site_name',job_row.site_name,
          'site_address',job_row.site_address,
          'shop_time',job_row.shop_time,
          'onsite_time',job_row.onsite_time,
          'scheduled_start',job_row.scheduled_start
        )
      );
    end if;
  elsif target_vehicle_id is not null then
    select v.* into vehicle_row from public.fleet_vehicles v where v.id=target_vehicle_id and v.organization_id=target_org_id;
    for crew_user in
      select distinct e.user_id
      from public.dispatch_assignments da
      join public.employees e on e.id=da.employee_id and e.organization_id=da.organization_id
      where da.organization_id=target_org_id and da.job_id=target_job_id and e.user_id is not null
    loop
      insert into public.user_notifications(
        organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload
      ) values (
        target_org_id,crew_user.user_id,'job_equipment_updated',
        case when tg_op='INSERT' then 'Unit assigned to your job' else 'Unit removed from your job' end,
        case when vehicle_row.id is null then job_row.title else concat('Unit ',vehicle_row.unit_number,' · ',coalesce(vehicle_row.name,vehicle_row.vehicle_type)) end,
        'job',target_job_id,
        jsonb_build_object(
          'job_number',job_row.job_number,
          'job_title',job_row.title,
          'vehicle_id',target_vehicle_id,
          'unit_number',vehicle_row.unit_number,
          'unit_name',coalesce(vehicle_row.name,vehicle_row.vehicle_type),
          'equipment_action',case when tg_op='INSERT' then 'assigned' else 'unassigned' end
        )
      );
    end loop;
  end if;

  return coalesce(new,old);
end;
$$;

revoke all on function private.notify_dispatch_assignment_change() from public, anon, authenticated;