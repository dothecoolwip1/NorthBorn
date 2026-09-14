-- Client portal account boundary and contact self-service.
create table if not exists public.customer_portal_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  portal_role text not null default 'admin' check (portal_role in ('admin','viewer')),
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_id, user_id)
);
create index if not exists customer_portal_users_user_idx on public.customer_portal_users(user_id,status);
create index if not exists customer_portal_users_customer_idx on public.customer_portal_users(organization_id,customer_id,status);
alter table public.customer_portal_users enable row level security;
drop policy if exists customer_portal_users_select_self_or_manager on public.customer_portal_users;
create policy customer_portal_users_select_self_or_manager on public.customer_portal_users for select to authenticated using (user_id=auth.uid() or private.has_org_permission(organization_id,'customers.view'));

create table if not exists public.customer_portal_invites (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade, email text not null, token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check(status in('pending','accepted','revoked','expired')), expires_at timestamptz not null default(now()+interval '7 days'),
  created_by uuid not null references auth.users(id) on delete cascade, accepted_by uuid null references auth.users(id) on delete set null, accepted_at timestamptz null,
  delivery_status text null check(delivery_status is null or delivery_status in('sending','sent','failed')), delivery_error text null, delivery_attempted_at timestamptz null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists customer_portal_invites_customer_idx on public.customer_portal_invites(organization_id,customer_id,created_at desc);
create index if not exists customer_portal_invites_email_idx on public.customer_portal_invites(lower(email),status);
alter table public.customer_portal_invites enable row level security;
drop policy if exists customer_portal_invites_manager_select on public.customer_portal_invites;
create policy customer_portal_invites_manager_select on public.customer_portal_invites for select to authenticated using(private.has_org_permission(organization_id,'customers.view'));

create or replace function public.create_customer_portal_invite(_organization_id uuid,_customer_id uuid,_email text)
returns table(invite_id uuid,invite_token uuid,invite_expires_at timestamptz) language plpgsql security definer set search_path='' as $$
declare _uid uuid:=auth.uid();_normalized_email text:=lower(trim(_email));_invite public.customer_portal_invites%rowtype;
begin
 if _uid is null then raise exception 'Authentication required'; end if;
 if not private.has_org_permission(_organization_id,'customers.edit') then raise exception 'You do not have permission to manage client portal access'; end if;
 if _normalized_email='' or position('@' in _normalized_email)<2 then raise exception 'A valid email is required'; end if;
 if not exists(select 1 from public.customers c where c.id=_customer_id and c.organization_id=_organization_id) then raise exception 'Customer not found'; end if;
 update public.customer_portal_invites set status='revoked',updated_at=now() where organization_id=_organization_id and customer_id=_customer_id and lower(email)=_normalized_email and status='pending';
 insert into public.customer_portal_invites(organization_id,customer_id,email,created_by) values(_organization_id,_customer_id,_normalized_email,_uid) returning * into _invite;
 return query select _invite.id,_invite.token,_invite.expires_at;
end$$;

create or replace function public.get_customer_portal_invite_details(_token uuid)
returns table(organization_name text,customer_name text,invite_status text,invite_expires_at timestamptz) language sql stable security definer set search_path='' as $$
 select o.name,c.name,case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,i.expires_at from public.customer_portal_invites i join public.organizations o on o.id=i.organization_id join public.customers c on c.id=i.customer_id and c.organization_id=i.organization_id where i.token=_token limit 1
$$;

create or replace function public.accept_customer_portal_invite(_token uuid)
returns table(organization_id uuid,customer_id uuid,customer_name text) language plpgsql security definer set search_path='' as $$
declare _uid uuid:=auth.uid();_email text;_invite public.customer_portal_invites%rowtype;_customer_name text;
begin
 if _uid is null then raise exception 'Authentication required'; end if; select lower(u.email) into _email from auth.users u where u.id=_uid;
 select * into _invite from public.customer_portal_invites i where i.token=_token for update; if _invite.id is null then raise exception 'Invitation not found'; end if;
 if _invite.status<>'pending' then raise exception 'This invitation is no longer active'; end if; if _invite.expires_at<=now() then update public.customer_portal_invites set status='expired',updated_at=now() where id=_invite.id; raise exception 'This invitation has expired'; end if;
 if _email is null or lower(_invite.email)<>_email then raise exception 'Sign in with the email address this invitation was sent to'; end if;
 insert into public.customer_portal_users(organization_id,customer_id,user_id,portal_role,status,created_by) values(_invite.organization_id,_invite.customer_id,_uid,'admin','active',_invite.created_by) on conflict(organization_id,customer_id,user_id) do update set status='active',portal_role='admin',updated_at=now();
 update public.customer_portal_invites set status='accepted',accepted_by=_uid,accepted_at=now(),updated_at=now() where id=_invite.id; select c.name into _customer_name from public.customers c where c.id=_invite.customer_id; return query select _invite.organization_id,_invite.customer_id,_customer_name;
end$$;

create or replace function public.get_my_customer_portal_context()
returns table(portal_user_id uuid,organization_id uuid,organization_name text,customer_id uuid,customer_name text,customer_phone text,customer_address text,billing_email text,portal_role text) language sql stable security definer set search_path='' as $$
 select cpu.id,cpu.organization_id,o.name,cpu.customer_id,c.name,c.phone,c.address,c.billing_email,cpu.portal_role from public.customer_portal_users cpu join public.customers c on c.id=cpu.customer_id and c.organization_id=cpu.organization_id join public.organizations o on o.id=cpu.organization_id where cpu.user_id=auth.uid() and cpu.status='active' and c.status='active' order by cpu.created_at
$$;
create or replace function public.get_my_customer_contacts(_customer_id uuid)
returns table(id uuid,name text,title text,phone text,email text,contact_type text,status text,updated_at timestamptz) language sql stable security definer set search_path='' as $$
 select cc.id,cc.name,cc.title,cc.phone,cc.email,cc.contact_type,cc.status,cc.updated_at from public.customer_contacts cc where cc.customer_id=_customer_id and cc.status<>'archived' and exists(select 1 from public.customer_portal_users cpu where cpu.user_id=auth.uid() and cpu.customer_id=cc.customer_id and cpu.organization_id=cc.organization_id and cpu.status='active') order by cc.name
$$;
create or replace function public.update_my_customer_portal_company(_customer_id uuid,_name text,_phone text,_address text,_billing_email text) returns void language plpgsql security definer set search_path='' as $$
declare _org_id uuid; begin select cpu.organization_id into _org_id from public.customer_portal_users cpu where cpu.user_id=auth.uid() and cpu.customer_id=_customer_id and cpu.status='active' and cpu.portal_role='admin' limit 1; if _org_id is null then raise exception 'You do not have permission to edit this client'; end if; update public.customers set name=trim(_name),phone=nullif(trim(_phone),''),address=nullif(trim(_address),''),billing_email=nullif(lower(trim(_billing_email)),''),updated_at=now() where id=_customer_id and organization_id=_org_id; end$$;
create or replace function public.upsert_my_customer_contact(_customer_id uuid,_contact_id uuid,_name text,_title text,_phone text,_email text,_contact_type text) returns uuid language plpgsql security definer set search_path='' as $$
declare _org_id uuid;_result_id uuid;_type text:=lower(trim(_contact_type)); begin select cpu.organization_id into _org_id from public.customer_portal_users cpu where cpu.user_id=auth.uid() and cpu.customer_id=_customer_id and cpu.status='active' and cpu.portal_role='admin' limit 1; if _org_id is null then raise exception 'You do not have permission to edit contacts for this client'; end if; if trim(_name)='' then raise exception 'Contact name is required'; end if; if _type not in('field','supervisor','dispatch','office','billing','accounting','other') then _type:='other'; end if; if _contact_id is null then insert into public.customer_contacts(organization_id,customer_id,name,title,phone,email,contact_type,status,created_by) values(_org_id,_customer_id,trim(_name),nullif(trim(_title),''),nullif(trim(_phone),''),nullif(lower(trim(_email)),''),_type,'active',auth.uid()) returning id into _result_id; else update public.customer_contacts set name=trim(_name),title=nullif(trim(_title),''),phone=nullif(trim(_phone),''),email=nullif(lower(trim(_email)),''),contact_type=_type,updated_at=now() where id=_contact_id and organization_id=_org_id and customer_id=_customer_id and status<>'archived' returning id into _result_id; if _result_id is null then raise exception 'Contact not found'; end if; end if; return _result_id; end$$;
create or replace function public.archive_my_customer_contact(_customer_id uuid,_contact_id uuid) returns void language plpgsql security definer set search_path='' as $$ declare _org_id uuid; begin select cpu.organization_id into _org_id from public.customer_portal_users cpu where cpu.user_id=auth.uid() and cpu.customer_id=_customer_id and cpu.status='active' and cpu.portal_role='admin' limit 1; if _org_id is null then raise exception 'You do not have permission to edit contacts for this client'; end if; update public.customer_contacts set status='archived',updated_at=now() where id=_contact_id and organization_id=_org_id and customer_id=_customer_id; end$$;

revoke all on function public.create_customer_portal_invite(uuid,uuid,text) from public,anon; grant execute on function public.create_customer_portal_invite(uuid,uuid,text) to authenticated;
revoke all on function public.get_customer_portal_invite_details(uuid) from public; grant execute on function public.get_customer_portal_invite_details(uuid) to anon,authenticated;
revoke all on function public.accept_customer_portal_invite(uuid) from public,anon; grant execute on function public.accept_customer_portal_invite(uuid) to authenticated;
revoke all on function public.get_my_customer_portal_context() from public,anon; grant execute on function public.get_my_customer_portal_context() to authenticated;
revoke all on function public.get_my_customer_contacts(uuid) from public,anon; grant execute on function public.get_my_customer_contacts(uuid) to authenticated;
revoke all on function public.update_my_customer_portal_company(uuid,text,text,text,text) from public,anon; grant execute on function public.update_my_customer_portal_company(uuid,text,text,text,text) to authenticated;
revoke all on function public.upsert_my_customer_contact(uuid,uuid,text,text,text,text,text) from public,anon; grant execute on function public.upsert_my_customer_contact(uuid,uuid,text,text,text,text,text) to authenticated;
revoke all on function public.archive_my_customer_contact(uuid,uuid) from public,anon; grant execute on function public.archive_my_customer_contact(uuid,uuid) to authenticated;
