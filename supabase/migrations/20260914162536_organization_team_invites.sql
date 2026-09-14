create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  role_id uuid not null references public.roles(id),
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_invites_org_status_idx
  on public.organization_invites(organization_id, status, created_at desc);
create index organization_invites_email_idx
  on public.organization_invites(email);

create trigger organization_invites_updated_at
before update on public.organization_invites
for each row execute function private.set_updated_at();

alter table public.organization_invites enable row level security;

create policy organization_invites_select_manager
on public.organization_invites for select to authenticated
using (private.has_org_permission(organization_id, 'members.manage'));

revoke all on public.organization_invites from anon, authenticated;
grant select on public.organization_invites to authenticated;
grant all on public.organization_invites to service_role;

create or replace function public.create_organization_invite(
  _organization_id uuid,
  _email text,
  _role_key text default 'operator'
)
returns table (invite_id uuid, invite_token uuid, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  selected_role_id uuid;
  created_invite public.organization_invites%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in';
  end if;

  if not private.has_org_permission(_organization_id, 'members.manage') then
    raise exception 'You do not have permission to invite members';
  end if;

  normalized_email := lower(trim(_email));
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;

  select r.id into selected_role_id
  from public.roles r
  where r.key = _role_key
    and (r.organization_id is null or r.organization_id = _organization_id)
    and (
      r.key <> 'owner'
      or private.has_org_permission(_organization_id, 'organization.ownership.manage')
    )
  order by (r.organization_id is not null) desc
  limit 1;

  if selected_role_id is null then
    raise exception 'That role is not available for this organization';
  end if;

  if exists (
    select 1
    from public.organization_members m
    join auth.users u on u.id = m.user_id
    where m.organization_id = _organization_id
      and m.status = 'active'
      and lower(u.email) = normalized_email
  ) then
    raise exception 'That email is already a member of this company';
  end if;

  update public.organization_invites
  set status = 'revoked'
  where organization_id = _organization_id
    and email = normalized_email
    and status = 'pending';

  insert into public.organization_invites (organization_id, email, role_id, created_by)
  values (_organization_id, normalized_email, selected_role_id, (select auth.uid()))
  returning * into created_invite;

  return query select created_invite.id, created_invite.token, created_invite.expires_at;
end;
$$;

create or replace function public.revoke_organization_invite(_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_org uuid;
begin
  select organization_id into invite_org
  from public.organization_invites
  where id = _invite_id;

  if invite_org is null then
    raise exception 'Invite not found';
  end if;

  if not private.has_org_permission(invite_org, 'members.manage') then
    raise exception 'You do not have permission to revoke this invite';
  end if;

  update public.organization_invites
  set status = 'revoked'
  where id = _invite_id and status = 'pending';
end;
$$;

create or replace function public.get_organization_invite_details(_token uuid)
returns table (organization_name text, role_name text, invite_status text, invite_expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, r.name, i.status, i.expires_at
  from public.organization_invites i
  join public.organizations o on o.id = i.organization_id
  join public.roles r on r.id = i.role_id
  where i.token = _token
  limit 1;
$$;

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

  select * into invite_row
  from public.organization_invites
  where token = _token
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

  select lower(email) into current_email
  from auth.users
  where id = (select auth.uid());

  if current_email is null or current_email <> invite_row.email then
    raise exception 'Sign in with the email address this invite was sent to';
  end if;

  insert into public.organization_members (organization_id, user_id, status, created_by)
  values (invite_row.organization_id, (select auth.uid()), 'active', invite_row.created_by)
  on conflict (organization_id, user_id)
  do update set status = 'active'
  returning id into membership_uuid;

  insert into public.membership_roles (membership_id, role_id)
  values (membership_uuid, invite_row.role_id)
  on conflict (membership_id, role_id) do nothing;

  update public.employees
  set user_id = (select auth.uid())
  where organization_id = invite_row.organization_id
    and user_id is null
    and email is not null
    and lower(email) = current_email;

  update public.organization_invites
  set status = 'accepted', accepted_by = (select auth.uid()), accepted_at = now()
  where id = invite_row.id;

  select r.key into accepted_role_key from public.roles r where r.id = invite_row.role_id;
  select o.name into accepted_org_name from public.organizations o where o.id = invite_row.organization_id;

  return query select invite_row.organization_id, accepted_org_name, accepted_role_key;
end;
$$;

revoke all on function public.create_organization_invite(uuid,text,text) from public;
revoke all on function public.revoke_organization_invite(uuid) from public;
revoke all on function public.get_organization_invite_details(uuid) from public;
revoke all on function public.accept_organization_invite(uuid) from public;

grant execute on function public.create_organization_invite(uuid,text,text) to authenticated;
grant execute on function public.revoke_organization_invite(uuid) to authenticated;
grant execute on function public.get_organization_invite_details(uuid) to anon, authenticated;
grant execute on function public.accept_organization_invite(uuid) to authenticated;
