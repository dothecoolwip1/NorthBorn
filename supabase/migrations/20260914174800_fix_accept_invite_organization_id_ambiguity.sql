create or replace function public.accept_organization_invite(_token uuid)
returns table (organization_id uuid, organization_name text, role_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_row public.organization_invites%rowtype;
  current_email text;
  membership_uuid uuid;
  accepted_role_key text;
  accepted_org_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in';
  end if;

  select i.* into invite_row
  from public.organization_invites as i
  where i.token = _token
  for update;

  if invite_row.id is null then
    raise exception 'Invite not found';
  end if;
  if invite_row.status <> 'pending' then
    raise exception 'This invite is no longer active';
  end if;
  if invite_row.expires_at <= now() then
    raise exception 'This invite has expired';
  end if;

  select lower(u.email) into current_email
  from auth.users as u
  where u.id = (select auth.uid());

  if current_email is null or current_email <> invite_row.email then
    raise exception 'Sign in with the email address this invite was sent to';
  end if;

  insert into public.organization_members as om (organization_id, user_id, status, created_by)
  values (invite_row.organization_id, (select auth.uid()), 'active', invite_row.created_by)
  on conflict on constraint organization_members_organization_id_user_id_key
  do update set status = 'active'
  returning om.id into membership_uuid;

  insert into public.membership_roles as mr (membership_id, role_id)
  values (membership_uuid, invite_row.role_id)
  on conflict (membership_id, role_id) do nothing;

  update public.employees as e
  set user_id = (select auth.uid())
  where e.organization_id = invite_row.organization_id
    and e.user_id is null
    and e.email is not null
    and lower(e.email) = current_email;

  update public.organization_invites as i
  set status = 'accepted', accepted_by = (select auth.uid()), accepted_at = now()
  where i.id = invite_row.id;

  select r.key into accepted_role_key
  from public.roles as r
  where r.id = invite_row.role_id;

  select o.name into accepted_org_name
  from public.organizations as o
  where o.id = invite_row.organization_id;

  return query
  select invite_row.organization_id, accepted_org_name, accepted_role_key;
end;
$$;

revoke all on function public.accept_organization_invite(uuid) from public, anon;
grant execute on function public.accept_organization_invite(uuid) to authenticated, service_role;
