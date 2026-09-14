create or replace function public.accept_customer_portal_invite_by_code(_code text)
returns table (organization_id uuid, customer_id uuid, customer_name text, portal_role text)
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid()); current_email text; invite_row public.customer_portal_invites%rowtype; accepted_customer_name text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select lower(u.email) into current_email from auth.users as u where u.id=current_user_id;
  select i.* into invite_row from public.customer_portal_invites as i where lower(i.invite_code)=lower(trim(_code)) for update;
  if invite_row.id is null then raise exception 'Access code not found'; end if;
  if invite_row.status<>'pending' then raise exception 'This access code is no longer active'; end if;
  if invite_row.expires_at<=now() then update public.customer_portal_invites as i set status='expired',updated_at=now() where i.id=invite_row.id; raise exception 'This access code has expired'; end if;
  if current_email is null or lower(invite_row.email)<>current_email then raise exception 'Sign in with the email address this access code was issued to'; end if;
  insert into public.customer_portal_users as cpu (organization_id,customer_id,user_id,portal_role,status,created_by)
  values(invite_row.organization_id,invite_row.customer_id,current_user_id,invite_row.portal_role,'active',invite_row.created_by)
  on conflict on constraint customer_portal_users_organization_id_customer_id_user_id_key
  do update set status='active',portal_role=excluded.portal_role,updated_at=now();
  update public.customer_portal_invites as i set status='accepted',accepted_by=current_user_id,accepted_at=now(),updated_at=now() where i.id=invite_row.id;
  select c.name into accepted_customer_name from public.customers as c where c.id=invite_row.customer_id and c.organization_id=invite_row.organization_id;
  return query select invite_row.organization_id,invite_row.customer_id,accepted_customer_name,invite_row.portal_role;
end; $$;

create or replace function public.accept_customer_portal_invite(_token uuid)
returns table (organization_id uuid, customer_id uuid, customer_name text, portal_role text)
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid()); current_email text; invite_row public.customer_portal_invites%rowtype; accepted_customer_name text;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select lower(u.email) into current_email from auth.users as u where u.id=current_user_id;
  select i.* into invite_row from public.customer_portal_invites as i where i.token=_token for update;
  if invite_row.id is null then raise exception 'Invitation not found'; end if;
  if invite_row.status<>'pending' then raise exception 'This invitation is no longer active'; end if;
  if invite_row.expires_at<=now() then update public.customer_portal_invites as i set status='expired',updated_at=now() where i.id=invite_row.id; raise exception 'This invitation has expired'; end if;
  if current_email is null or lower(invite_row.email)<>current_email then raise exception 'Sign in with the email address this invitation was sent to'; end if;
  insert into public.customer_portal_users as cpu (organization_id,customer_id,user_id,portal_role,status,created_by)
  values(invite_row.organization_id,invite_row.customer_id,current_user_id,invite_row.portal_role,'active',invite_row.created_by)
  on conflict on constraint customer_portal_users_organization_id_customer_id_user_id_key
  do update set status='active',portal_role=excluded.portal_role,updated_at=now();
  update public.customer_portal_invites as i set status='accepted',accepted_by=current_user_id,accepted_at=now(),updated_at=now() where i.id=invite_row.id;
  select c.name into accepted_customer_name from public.customers as c where c.id=invite_row.customer_id and c.organization_id=invite_row.organization_id;
  return query select invite_row.organization_id,invite_row.customer_id,accepted_customer_name,invite_row.portal_role;
end; $$;

revoke all on function public.accept_customer_portal_invite_by_code(text) from public,anon;
grant execute on function public.accept_customer_portal_invite_by_code(text) to authenticated,service_role;
revoke all on function public.accept_customer_portal_invite(uuid) from public,anon;
grant execute on function public.accept_customer_portal_invite(uuid) to authenticated,service_role;
