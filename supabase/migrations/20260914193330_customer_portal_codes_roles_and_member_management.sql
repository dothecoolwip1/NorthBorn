-- Expand client portal roles, add human-readable invite codes, and let client admins manage their own members.

alter table public.customer_portal_users
  drop constraint if exists customer_portal_users_portal_role_check;
alter table public.customer_portal_users
  add constraint customer_portal_users_portal_role_check
  check (portal_role in ('admin','operations','billing','viewer'));

alter table public.customer_portal_invites
  add column if not exists portal_role text not null default 'admin',
  add column if not exists invite_code text;

alter table public.customer_portal_invites
  drop constraint if exists customer_portal_invites_portal_role_check;
alter table public.customer_portal_invites
  add constraint customer_portal_invites_portal_role_check
  check (portal_role in ('admin','operations','billing','viewer'));

update public.customer_portal_invites
set invite_code = 'NB-' || upper(substr(replace(id::text,'-',''),1,12))
where invite_code is null;

alter table public.customer_portal_invites
  alter column invite_code set not null;

create unique index if not exists customer_portal_invites_code_uidx
  on public.customer_portal_invites (lower(invite_code));

create or replace function private.generate_customer_portal_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _code text;
begin
  loop
    _code := 'NB-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
    exit when not exists (
      select 1 from public.customer_portal_invites i where lower(i.invite_code)=lower(_code)
    );
  end loop;
  return _code;
end;
$$;

-- Replace the original manager-created invite RPC with a role-aware version.
drop function if exists public.create_customer_portal_invite(uuid,uuid,text);
create function public.create_customer_portal_invite(
  _organization_id uuid,
  _customer_id uuid,
  _email text,
  _portal_role text default 'admin'
)
returns table(invite_id uuid, invite_token uuid, invite_code text, invite_expires_at timestamptz, portal_role text)
language plpgsql
security definer
set search_path=''
as $$
declare
  _uid uuid := auth.uid();
  _normalized_email text := lower(trim(_email));
  _role text := lower(trim(coalesce(_portal_role,'admin')));
  _invite public.customer_portal_invites%rowtype;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  if not private.has_org_permission(_organization_id,'customers.edit') then
    raise exception 'You do not have permission to manage client portal access';
  end if;
  if _normalized_email='' or position('@' in _normalized_email)<2 then raise exception 'A valid email is required'; end if;
  if _role not in ('admin','operations','billing','viewer') then raise exception 'Invalid client portal role'; end if;
  if not exists(select 1 from public.customers c where c.id=_customer_id and c.organization_id=_organization_id) then
    raise exception 'Customer not found';
  end if;
  if exists(
    select 1
    from public.customer_portal_users cpu
    join auth.users u on u.id=cpu.user_id
    where cpu.organization_id=_organization_id and cpu.customer_id=_customer_id
      and cpu.status='active' and lower(u.email)=_normalized_email
  ) then raise exception 'That email already has access to this client portal'; end if;

  update public.customer_portal_invites
  set status='revoked',updated_at=now()
  where organization_id=_organization_id and customer_id=_customer_id
    and lower(email)=_normalized_email and status='pending';

  insert into public.customer_portal_invites(
    organization_id,customer_id,email,portal_role,invite_code,created_by
  ) values(
    _organization_id,_customer_id,_normalized_email,_role,private.generate_customer_portal_code(),_uid
  ) returning * into _invite;

  return query select _invite.id,_invite.token,_invite.invite_code,_invite.expires_at,_invite.portal_role;
end;
$$;

-- Client Admins can invite additional members into only their own client profile.
create or replace function public.create_my_customer_portal_invite(
  _customer_id uuid,
  _email text,
  _portal_role text
)
returns table(invite_id uuid, invite_token uuid, invite_code text, invite_expires_at timestamptz, portal_role text)
language plpgsql
security definer
set search_path=''
as $$
declare
  _uid uuid := auth.uid();
  _org_id uuid;
  _normalized_email text := lower(trim(_email));
  _role text := lower(trim(_portal_role));
  _invite public.customer_portal_invites%rowtype;
begin
  select cpu.organization_id into _org_id
  from public.customer_portal_users cpu
  where cpu.user_id=_uid and cpu.customer_id=_customer_id
    and cpu.status='active' and cpu.portal_role='admin'
  limit 1;
  if _org_id is null then raise exception 'Only a Client Admin can add portal members'; end if;
  if _normalized_email='' or position('@' in _normalized_email)<2 then raise exception 'A valid email is required'; end if;
  if _role not in ('admin','operations','billing','viewer') then raise exception 'Invalid client portal role'; end if;
  if exists(
    select 1 from public.customer_portal_users cpu
    join auth.users u on u.id=cpu.user_id
    where cpu.organization_id=_org_id and cpu.customer_id=_customer_id
      and cpu.status='active' and lower(u.email)=_normalized_email
  ) then raise exception 'That email already has access to this client portal'; end if;

  update public.customer_portal_invites
  set status='revoked',updated_at=now()
  where organization_id=_org_id and customer_id=_customer_id
    and lower(email)=_normalized_email and status='pending';

  insert into public.customer_portal_invites(
    organization_id,customer_id,email,portal_role,invite_code,created_by
  ) values(
    _org_id,_customer_id,_normalized_email,_role,private.generate_customer_portal_code(),_uid
  ) returning * into _invite;

  return query select _invite.id,_invite.token,_invite.invite_code,_invite.expires_at,_invite.portal_role;
end;
$$;

create or replace function public.get_customer_portal_invite_by_code(_code text)
returns table(
  organization_name text,
  customer_name text,
  portal_role text,
  invite_status text,
  invite_expires_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select o.name,c.name,i.portal_role,
    case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,
    i.expires_at
  from public.customer_portal_invites i
  join public.organizations o on o.id=i.organization_id
  join public.customers c on c.id=i.customer_id and c.organization_id=i.organization_id
  where lower(i.invite_code)=lower(trim(_code))
  limit 1
$$;

-- Replace token acceptance so member role is taken from the invite.
drop function if exists public.accept_customer_portal_invite(uuid);
create function public.accept_customer_portal_invite(_token uuid)
returns table(organization_id uuid,customer_id uuid,customer_name text,portal_role text)
language plpgsql
security definer
set search_path=''
as $$
declare
  _uid uuid:=auth.uid();
  _email text;
  _invite public.customer_portal_invites%rowtype;
  _customer_name text;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  select lower(u.email) into _email from auth.users u where u.id=_uid;
  select * into _invite from public.customer_portal_invites i where i.token=_token for update;
  if _invite.id is null then raise exception 'Invitation not found'; end if;
  if _invite.status<>'pending' then raise exception 'This invitation is no longer active'; end if;
  if _invite.expires_at<=now() then
    update public.customer_portal_invites set status='expired',updated_at=now() where id=_invite.id;
    raise exception 'This invitation has expired';
  end if;
  if _email is null or lower(_invite.email)<>_email then
    raise exception 'Sign in with the email address this invitation was sent to';
  end if;
  insert into public.customer_portal_users(organization_id,customer_id,user_id,portal_role,status,created_by)
  values(_invite.organization_id,_invite.customer_id,_uid,_invite.portal_role,'active',_invite.created_by)
  on conflict(organization_id,customer_id,user_id)
  do update set status='active',portal_role=excluded.portal_role,updated_at=now();
  update public.customer_portal_invites
  set status='accepted',accepted_by=_uid,accepted_at=now(),updated_at=now()
  where id=_invite.id;
  select c.name into _customer_name from public.customers c where c.id=_invite.customer_id;
  return query select _invite.organization_id,_invite.customer_id,_customer_name,_invite.portal_role;
end;
$$;

create or replace function public.accept_customer_portal_invite_by_code(_code text)
returns table(organization_id uuid,customer_id uuid,customer_name text,portal_role text)
language plpgsql
security definer
set search_path=''
as $$
declare
  _uid uuid:=auth.uid();
  _email text;
  _invite public.customer_portal_invites%rowtype;
  _customer_name text;
begin
  if _uid is null then raise exception 'Authentication required'; end if;
  select lower(u.email) into _email from auth.users u where u.id=_uid;
  select * into _invite
  from public.customer_portal_invites i
  where lower(i.invite_code)=lower(trim(_code))
  for update;
  if _invite.id is null then raise exception 'Access code not found'; end if;
  if _invite.status<>'pending' then raise exception 'This access code is no longer active'; end if;
  if _invite.expires_at<=now() then
    update public.customer_portal_invites set status='expired',updated_at=now() where id=_invite.id;
    raise exception 'This access code has expired';
  end if;
  if _email is null or lower(_invite.email)<>_email then
    raise exception 'Sign in with the email address this access code was issued to';
  end if;
  insert into public.customer_portal_users(organization_id,customer_id,user_id,portal_role,status,created_by)
  values(_invite.organization_id,_invite.customer_id,_uid,_invite.portal_role,'active',_invite.created_by)
  on conflict(organization_id,customer_id,user_id)
  do update set status='active',portal_role=excluded.portal_role,updated_at=now();
  update public.customer_portal_invites
  set status='accepted',accepted_by=_uid,accepted_at=now(),updated_at=now()
  where id=_invite.id;
  select c.name into _customer_name from public.customers c where c.id=_invite.customer_id;
  return query select _invite.organization_id,_invite.customer_id,_customer_name,_invite.portal_role;
end;
$$;

create or replace function public.get_my_customer_portal_members(_customer_id uuid)
returns table(
  portal_user_id uuid,
  user_id uuid,
  email text,
  portal_role text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select cpu.id,cpu.user_id,u.email,cpu.portal_role,cpu.status,cpu.created_at
  from public.customer_portal_users cpu
  join auth.users u on u.id=cpu.user_id
  where cpu.customer_id=_customer_id
    and exists(
      select 1 from public.customer_portal_users me
      where me.user_id=auth.uid() and me.customer_id=_customer_id
        and me.organization_id=cpu.organization_id and me.status='active' and me.portal_role='admin'
    )
  order by cpu.created_at
$$;

create or replace function public.get_my_customer_portal_invites(_customer_id uuid)
returns table(
  invite_id uuid,
  email text,
  portal_role text,
  invite_code text,
  status text,
  expires_at timestamptz,
  delivery_status text
)
language sql
stable
security definer
set search_path=''
as $$
  select i.id,i.email,i.portal_role,i.invite_code,i.status,i.expires_at,i.delivery_status
  from public.customer_portal_invites i
  where i.customer_id=_customer_id
    and exists(
      select 1 from public.customer_portal_users me
      where me.user_id=auth.uid() and me.customer_id=_customer_id
        and me.organization_id=i.organization_id and me.status='active' and me.portal_role='admin'
    )
  order by i.created_at desc
$$;

create or replace function public.update_my_customer_portal_member_role(
  _customer_id uuid,
  _portal_user_id uuid,
  _portal_role text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _uid uuid:=auth.uid();
  _org_id uuid;
  _role text:=lower(trim(_portal_role));
  _target public.customer_portal_users%rowtype;
  _admin_count integer;
begin
  select me.organization_id into _org_id
  from public.customer_portal_users me
  where me.user_id=_uid and me.customer_id=_customer_id and me.status='active' and me.portal_role='admin'
  limit 1;
  if _org_id is null then raise exception 'Only a Client Admin can manage portal members'; end if;
  if _role not in ('admin','operations','billing','viewer') then raise exception 'Invalid client portal role'; end if;
  select * into _target from public.customer_portal_users cpu
  where cpu.id=_portal_user_id and cpu.organization_id=_org_id and cpu.customer_id=_customer_id;
  if _target.id is null then raise exception 'Portal member not found'; end if;
  if _target.user_id=_uid then raise exception 'Use another Client Admin to change your own role'; end if;
  if _target.portal_role='admin' and _role<>'admin' then
    select count(*) into _admin_count from public.customer_portal_users cpu
    where cpu.organization_id=_org_id and cpu.customer_id=_customer_id and cpu.status='active' and cpu.portal_role='admin';
    if _admin_count<=1 then raise exception 'A client portal must keep at least one active Admin'; end if;
  end if;
  update public.customer_portal_users set portal_role=_role,updated_at=now() where id=_target.id;
end;
$$;

create or replace function public.deactivate_my_customer_portal_member(
  _customer_id uuid,
  _portal_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _uid uuid:=auth.uid();
  _org_id uuid;
  _target public.customer_portal_users%rowtype;
  _admin_count integer;
begin
  select me.organization_id into _org_id
  from public.customer_portal_users me
  where me.user_id=_uid and me.customer_id=_customer_id and me.status='active' and me.portal_role='admin'
  limit 1;
  if _org_id is null then raise exception 'Only a Client Admin can manage portal members'; end if;
  select * into _target from public.customer_portal_users cpu
  where cpu.id=_portal_user_id and cpu.organization_id=_org_id and cpu.customer_id=_customer_id;
  if _target.id is null then raise exception 'Portal member not found'; end if;
  if _target.user_id=_uid then raise exception 'You cannot remove your own portal access'; end if;
  if _target.portal_role='admin' and _target.status='active' then
    select count(*) into _admin_count from public.customer_portal_users cpu
    where cpu.organization_id=_org_id and cpu.customer_id=_customer_id and cpu.status='active' and cpu.portal_role='admin';
    if _admin_count<=1 then raise exception 'A client portal must keep at least one active Admin'; end if;
  end if;
  update public.customer_portal_users set status='inactive',updated_at=now() where id=_target.id;
end;
$$;

-- Operations and Billing roles can maintain the contact types relevant to them.
create or replace function public.upsert_my_customer_contact(_customer_id uuid,_contact_id uuid,_name text,_title text,_phone text,_email text,_contact_type text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _org_id uuid;
  _my_role text;
  _result_id uuid;
  _type text:=lower(trim(_contact_type));
begin
  select cpu.organization_id,cpu.portal_role into _org_id,_my_role
  from public.customer_portal_users cpu
  where cpu.user_id=auth.uid() and cpu.customer_id=_customer_id and cpu.status='active'
  order by case cpu.portal_role when 'admin' then 1 when 'operations' then 2 when 'billing' then 3 else 4 end
  limit 1;
  if _org_id is null or _my_role='viewer' then raise exception 'You do not have permission to edit contacts for this client'; end if;
  if trim(_name)='' then raise exception 'Contact name is required'; end if;
  if _type not in('field','supervisor','dispatch','office','billing','accounting','other') then _type:='other'; end if;
  if _my_role='operations' and _type not in('field','supervisor','dispatch','office','other') then
    raise exception 'Operations members can edit field, supervisor, dispatch and office contacts';
  end if;
  if _my_role='billing' and _type not in('billing','accounting','office','other') then
    raise exception 'Billing members can edit billing, accounting and office contacts';
  end if;
  if _contact_id is null then
    insert into public.customer_contacts(organization_id,customer_id,name,title,phone,email,contact_type,status,created_by)
    values(_org_id,_customer_id,trim(_name),nullif(trim(_title),''),nullif(trim(_phone),''),nullif(lower(trim(_email)),''),_type,'active',auth.uid())
    returning id into _result_id;
  else
    update public.customer_contacts
    set name=trim(_name),title=nullif(trim(_title),''),phone=nullif(trim(_phone),''),email=nullif(lower(trim(_email)),''),contact_type=_type,updated_at=now()
    where id=_contact_id and organization_id=_org_id and customer_id=_customer_id and status<>'archived'
    returning id into _result_id;
    if _result_id is null then raise exception 'Contact not found'; end if;
  end if;
  return _result_id;
end;
$$;

create or replace function public.archive_my_customer_contact(_customer_id uuid,_contact_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _org_id uuid;
  _my_role text;
  _contact_type text;
begin
  select cpu.organization_id,cpu.portal_role into _org_id,_my_role
  from public.customer_portal_users cpu
  where cpu.user_id=auth.uid() and cpu.customer_id=_customer_id and cpu.status='active'
  order by case cpu.portal_role when 'admin' then 1 when 'operations' then 2 when 'billing' then 3 else 4 end
  limit 1;
  if _org_id is null or _my_role='viewer' then raise exception 'You do not have permission to edit contacts for this client'; end if;
  select cc.contact_type into _contact_type from public.customer_contacts cc
  where cc.id=_contact_id and cc.organization_id=_org_id and cc.customer_id=_customer_id and cc.status<>'archived';
  if _contact_type is null then raise exception 'Contact not found'; end if;
  if _my_role='operations' and _contact_type not in('field','supervisor','dispatch','office','other') then raise exception 'You cannot remove that contact type'; end if;
  if _my_role='billing' and _contact_type not in('billing','accounting','office','other') then raise exception 'You cannot remove that contact type'; end if;
  update public.customer_contacts set status='archived',updated_at=now()
  where id=_contact_id and organization_id=_org_id and customer_id=_customer_id;
end;
$$;

revoke all on function private.generate_customer_portal_code() from public;
revoke all on function public.create_customer_portal_invite(uuid,uuid,text,text) from public,anon;
grant execute on function public.create_customer_portal_invite(uuid,uuid,text,text) to authenticated;
revoke all on function public.create_my_customer_portal_invite(uuid,text,text) from public,anon;
grant execute on function public.create_my_customer_portal_invite(uuid,text,text) to authenticated;
revoke all on function public.get_customer_portal_invite_by_code(text) from public;
grant execute on function public.get_customer_portal_invite_by_code(text) to anon,authenticated;
revoke all on function public.accept_customer_portal_invite(uuid) from public,anon;
grant execute on function public.accept_customer_portal_invite(uuid) to authenticated;
revoke all on function public.accept_customer_portal_invite_by_code(text) from public,anon;
grant execute on function public.accept_customer_portal_invite_by_code(text) to authenticated;
revoke all on function public.get_my_customer_portal_members(uuid) from public,anon;
grant execute on function public.get_my_customer_portal_members(uuid) to authenticated;
revoke all on function public.get_my_customer_portal_invites(uuid) from public,anon;
grant execute on function public.get_my_customer_portal_invites(uuid) to authenticated;
revoke all on function public.update_my_customer_portal_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.update_my_customer_portal_member_role(uuid,uuid,text) to authenticated;
revoke all on function public.deactivate_my_customer_portal_member(uuid,uuid) from public,anon;
grant execute on function public.deactivate_my_customer_portal_member(uuid,uuid) to authenticated;
revoke all on function public.upsert_my_customer_contact(uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.upsert_my_customer_contact(uuid,uuid,text,text,text,text,text) to authenticated;
revoke all on function public.archive_my_customer_contact(uuid,uuid) from public,anon;
grant execute on function public.archive_my_customer_contact(uuid,uuid) to authenticated;
