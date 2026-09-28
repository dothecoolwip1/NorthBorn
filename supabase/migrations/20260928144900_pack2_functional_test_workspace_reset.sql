create or replace function public.restore_my_northborn_test_workspace()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _uid uuid := auth.uid();
  _email text;
  _membership uuid;
  _role uuid;
  _role_key text;
  _org uuid;
begin
  if _uid is null then
    raise exception 'Authentication required.';
  end if;

  select lower(email) into _email
  from auth.users
  where id = _uid;

  if _email not in ('manager@test.com','operator@test.com','client@test.com') then
    raise exception 'This function is limited to Northborn functional test accounts.';
  end if;

  perform private.ensure_northborn_test_workspace();

  if _email in ('manager@test.com','operator@test.com') then
    _role_key := case when _email = 'manager@test.com' then 'owner' else 'operator' end;

    select om.id into _membership
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.user_id = _uid
      and om.status = 'active'
      and o.slug = 'northborn-test-company'
    limit 1;

    select id into _role
    from public.roles
    where key = _role_key
    limit 1;

    if _membership is null or _role is null then
      raise exception 'Northborn functional test workspace could not be restored.';
    end if;

    delete from public.membership_roles where membership_id = _membership;
    insert into public.membership_roles(membership_id, role_id) values (_membership, _role);
  end if;

  if _email = 'manager@test.com' then
    select id into _org
    from public.organizations
    where slug = 'northborn-test-company'
    limit 1;

    delete from public.dispatch_assignments da
    using public.jobs j
    where da.job_id = j.id
      and j.organization_id = _org
      and j.job_number like 'PACK2-%';

    delete from public.job_operation_events e
    using public.jobs j
    where e.job_id = j.id
      and j.organization_id = _org
      and j.job_number like 'PACK2-%';

    delete from public.jobs
    where organization_id = _org
      and job_number like 'PACK2-%';

    update public.fleet_vehicles v
    set status = 'available'
    where v.organization_id = _org
      and v.unit_number = 'TEST-101'
      and not exists (
        select 1
        from public.dispatch_assignments da
        join public.jobs j on j.id = da.job_id
        where da.vehicle_id = v.id
          and j.status not in ('completed','cancelled')
      );
  end if;

  return true;
end;
$function$;

revoke all on function public.restore_my_northborn_test_workspace() from public;
revoke all on function public.restore_my_northborn_test_workspace() from anon;
grant execute on function public.restore_my_northborn_test_workspace() to authenticated;
