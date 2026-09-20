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

  return true;
end;
$function$;

revoke all on function public.restore_my_northborn_test_workspace() from public;
revoke all on function public.restore_my_northborn_test_workspace() from anon;
grant execute on function public.restore_my_northborn_test_workspace() to authenticated;

create or replace function public.set_my_northborn_test_role(_role_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _uid uuid := auth.uid();
  _email text;
  _membership uuid;
  _role uuid;
begin
  if _uid is null then
    raise exception 'Authentication required.';
  end if;

  select lower(email) into _email
  from auth.users
  where id = _uid;

  if _email <> 'manager@test.com' then
    raise exception 'Only the Northborn manager functional test account can switch internal test roles.';
  end if;

  if _role_key not in ('owner','admin','supervisor','dispatcher','safety','mechanic','accounting') then
    raise exception 'Unsupported Northborn functional test role.';
  end if;

  select om.id into _membership
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where om.user_id = _uid
    and om.status = 'active'
    and o.slug = 'northborn-test-company'
  limit 1;

  if _membership is null then
    raise exception 'No active Northborn functional test membership was found.';
  end if;

  select id into _role
  from public.roles
  where key = _role_key
  limit 1;

  if _role is null then
    raise exception 'Requested Northborn role does not exist.';
  end if;

  delete from public.membership_roles where membership_id = _membership;
  insert into public.membership_roles(membership_id, role_id) values (_membership, _role);

  return _role_key;
end;
$function$;

revoke all on function public.set_my_northborn_test_role(text) from public;
revoke all on function public.set_my_northborn_test_role(text) from anon;
grant execute on function public.set_my_northborn_test_role(text) to authenticated;
