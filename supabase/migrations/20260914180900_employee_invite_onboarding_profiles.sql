create or replace function public.accept_organization_invite_with_profile(
  _token uuid,
  _first_name text,
  _last_name text,
  _phone text,
  _position text
)
returns table (organization_id uuid, organization_name text, role_key text, employee_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_row public.organization_invites%rowtype;
  current_user_id uuid := (select auth.uid());
  current_email text;
  membership_uuid uuid;
  employee_uuid uuid;
  accepted_role_key text;
  accepted_role_name text;
  accepted_org_name text;
  first_name_value text := btrim(coalesce(_first_name, ''));
  last_name_value text := btrim(coalesce(_last_name, ''));
  phone_value text := btrim(coalesce(_phone, ''));
  position_value text := btrim(coalesce(_position, ''));
begin
  if current_user_id is null then raise exception 'You must be signed in'; end if;
  if char_length(first_name_value) < 1 or char_length(first_name_value) > 80 then raise exception 'Enter your first name'; end if;
  if char_length(last_name_value) < 1 or char_length(last_name_value) > 80 then raise exception 'Enter your last name'; end if;
  if char_length(phone_value) < 7 or char_length(phone_value) > 40 then raise exception 'Enter a valid phone number'; end if;

  select i.* into invite_row from public.organization_invites as i where i.token = _token for update;
  if invite_row.id is null then raise exception 'Invite not found'; end if;
  if invite_row.status <> 'pending' then raise exception 'This invite is no longer active'; end if;
  if invite_row.expires_at <= now() then raise exception 'This invite has expired'; end if;

  select lower(u.email) into current_email from auth.users as u where u.id = current_user_id;
  if current_email is null or current_email <> invite_row.email then
    raise exception 'Sign in with the email address this invite was sent to';
  end if;

  select r.key, r.name into accepted_role_key, accepted_role_name from public.roles as r where r.id = invite_row.role_id;
  if position_value = '' then position_value := coalesce(accepted_role_name, 'Employee'); end if;

  insert into public.organization_members as om (organization_id, user_id, status, created_by)
  values (invite_row.organization_id, current_user_id, 'active', invite_row.created_by)
  on conflict on constraint organization_members_organization_id_user_id_key do update set status = 'active'
  returning om.id into membership_uuid;

  insert into public.membership_roles as mr (membership_id, role_id)
  values (membership_uuid, invite_row.role_id)
  on conflict (membership_id, role_id) do nothing;

  select e.id into employee_uuid
  from public.employees as e
  where e.organization_id = invite_row.organization_id
    and (e.user_id = current_user_id or (e.user_id is null and e.email is not null and lower(e.email) = current_email))
  order by (e.user_id = current_user_id) desc
  limit 1;

  if employee_uuid is null then
    insert into public.employees (organization_id, user_id, first_name, last_name, email, phone, position, status, created_by)
    values (invite_row.organization_id, current_user_id, first_name_value, last_name_value, current_email, phone_value, position_value, 'active', invite_row.created_by)
    returning id into employee_uuid;
  else
    update public.employees as e
    set user_id = current_user_id,
        first_name = first_name_value,
        last_name = last_name_value,
        email = current_email,
        phone = phone_value,
        position = position_value,
        status = case when e.status = 'archived' then 'active' else e.status end
    where e.id = employee_uuid;
  end if;

  insert into public.profiles (user_id, first_name, last_name, display_name, phone)
  values (current_user_id, first_name_value, last_name_value, first_name_value || ' ' || last_name_value, phone_value)
  on conflict (user_id) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      display_name = excluded.display_name,
      phone = excluded.phone,
      updated_at = now();

  update public.organization_invites as i
  set status = 'accepted', accepted_by = current_user_id, accepted_at = now()
  where i.id = invite_row.id;

  select o.name into accepted_org_name from public.organizations as o where o.id = invite_row.organization_id;
  return query select invite_row.organization_id, accepted_org_name, accepted_role_key, employee_uuid;
end;
$$;

create or replace function public.complete_employee_profile(
  _organization_id uuid,
  _first_name text,
  _last_name text,
  _phone text,
  _position text
)
returns table (employee_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text;
  employee_uuid uuid;
  role_name_value text;
  first_name_value text := btrim(coalesce(_first_name, ''));
  last_name_value text := btrim(coalesce(_last_name, ''));
  phone_value text := btrim(coalesce(_phone, ''));
  position_value text := btrim(coalesce(_position, ''));
begin
  if current_user_id is null then raise exception 'You must be signed in'; end if;
  if not exists (
    select 1 from public.organization_members as m
    where m.organization_id = _organization_id and m.user_id = current_user_id and m.status = 'active'
  ) then raise exception 'You are not an active member of this company'; end if;
  if char_length(first_name_value) < 1 or char_length(first_name_value) > 80 then raise exception 'Enter your first name'; end if;
  if char_length(last_name_value) < 1 or char_length(last_name_value) > 80 then raise exception 'Enter your last name'; end if;
  if char_length(phone_value) < 7 or char_length(phone_value) > 40 then raise exception 'Enter a valid phone number'; end if;

  select lower(u.email) into current_email from auth.users as u where u.id = current_user_id;
  select r.name into role_name_value
  from public.organization_members as m
  join public.membership_roles as mr on mr.membership_id = m.id
  join public.roles as r on r.id = mr.role_id
  where m.organization_id = _organization_id and m.user_id = current_user_id and m.status = 'active'
  order by mr.created_at limit 1;
  if position_value = '' then position_value := coalesce(role_name_value, 'Employee'); end if;

  select e.id into employee_uuid
  from public.employees as e
  where e.organization_id = _organization_id
    and (e.user_id = current_user_id or (e.user_id is null and current_email is not null and e.email is not null and lower(e.email) = current_email))
  order by (e.user_id = current_user_id) desc
  limit 1;

  if employee_uuid is null then
    insert into public.employees (organization_id, user_id, first_name, last_name, email, phone, position, status, created_by)
    values (_organization_id, current_user_id, first_name_value, last_name_value, current_email, phone_value, position_value, 'active', current_user_id)
    returning id into employee_uuid;
  else
    update public.employees as e
    set user_id = current_user_id,
        first_name = first_name_value,
        last_name = last_name_value,
        email = current_email,
        phone = phone_value,
        position = position_value,
        status = case when e.status = 'archived' then 'active' else e.status end
    where e.id = employee_uuid;
  end if;

  insert into public.profiles (user_id, first_name, last_name, display_name, phone)
  values (current_user_id, first_name_value, last_name_value, first_name_value || ' ' || last_name_value, phone_value)
  on conflict (user_id) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      display_name = excluded.display_name,
      phone = excluded.phone,
      updated_at = now();

  return query select employee_uuid;
end;
$$;

revoke all on function public.accept_organization_invite_with_profile(uuid,text,text,text,text) from public, anon;
grant execute on function public.accept_organization_invite_with_profile(uuid,text,text,text,text) to authenticated, service_role;
revoke all on function public.complete_employee_profile(uuid,text,text,text,text) from public, anon;
grant execute on function public.complete_employee_profile(uuid,text,text,text,text) to authenticated, service_role;
