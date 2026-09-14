create table if not exists public.customer_job_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  notes text,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, job_id)
);

create table if not exists public.customer_job_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  requested_start timestamptz,
  site_name text,
  site_address text,
  onsite_contact_id uuid references public.customer_contacts(id) on delete set null,
  client_notes text,
  status text not null default 'submitted' check (status in ('submitted','reviewing','approved','declined','cancelled')),
  linked_job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_job_notes_job_idx on public.customer_job_notes(job_id);
create index if not exists customer_job_requests_customer_status_idx on public.customer_job_requests(customer_id,status,created_at desc);
create index if not exists customer_job_requests_org_idx on public.customer_job_requests(organization_id,created_at desc);

alter table public.customer_job_notes enable row level security;
alter table public.customer_job_requests enable row level security;

revoke all on public.customer_job_notes from anon, authenticated;
revoke all on public.customer_job_requests from anon, authenticated;

drop function if exists public.get_my_customer_jobs(uuid);
create function public.get_my_customer_jobs(_customer_id uuid)
returns table(
  job_id uuid,
  job_number text,
  title text,
  site_name text,
  site_address text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text,
  completed_at timestamptz,
  onsite_contact_id uuid,
  onsite_contact_name text,
  onsite_contact_title text,
  onsite_contact_phone text,
  onsite_contact_email text,
  operator_name text,
  operator_phone text,
  dispatch_phone text,
  emergency_phone text,
  client_notes text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    j.id,
    j.job_number,
    j.title,
    j.site_name,
    j.site_address,
    coalesce(j.onsite_time,j.scheduled_start),
    j.scheduled_end,
    j.status,
    j.completed_at,
    pc.id,
    pc.name,
    pc.title,
    pc.phone,
    pc.email,
    op.operator_name,
    op.operator_phone,
    nullif(trim(o.settings->>'dispatch_phone'),''),
    nullif(trim(o.settings->>'emergency_phone'),''),
    n.notes
  from public.jobs j
  join public.organizations o on o.id=j.organization_id
  left join public.customer_job_notes n on n.job_id=j.id and n.customer_id=j.customer_id and n.organization_id=j.organization_id
  left join lateral (
    select cc.id,cc.name,cc.title,cc.phone,cc.email
    from public.job_contacts jc
    join public.customer_contacts cc on cc.id=jc.contact_id
    where jc.job_id=j.id
      and jc.organization_id=j.organization_id
      and cc.customer_id=j.customer_id
      and cc.organization_id=j.organization_id
      and cc.status<>'archived'
    order by jc.is_primary desc,jc.created_at asc
    limit 1
  ) pc on true
  left join lateral (
    select trim(e.first_name || ' ' || e.last_name) as operator_name,e.phone as operator_phone
    from public.dispatch_assignments da
    join public.employees e on e.id=da.employee_id and e.organization_id=da.organization_id
    where da.job_id=j.id
      and da.organization_id=j.organization_id
      and da.employee_id is not null
      and (
        lower(coalesce(da.role,''))='operator'
        or lower(coalesce(e.position,'')) like '%operator%'
      )
    order by case when lower(coalesce(da.role,''))='operator' then 0 else 1 end, da.created_at asc
    limit 1
  ) op on true
  where j.customer_id=_customer_id
    and exists (
      select 1
      from public.customer_portal_users cpu
      where cpu.user_id=auth.uid()
        and cpu.customer_id=j.customer_id
        and cpu.organization_id=j.organization_id
        and cpu.status='active'
    )
  order by coalesce(j.onsite_time,j.scheduled_start,j.created_at) desc;
$function$;

drop function if exists public.save_my_customer_job_note(uuid,uuid,text);
create function public.save_my_customer_job_note(_customer_id uuid,_job_id uuid,_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _org_id uuid;
  _role text;
begin
  select cpu.organization_id,cpu.portal_role into _org_id,_role
  from public.customer_portal_users cpu
  where cpu.user_id=auth.uid() and cpu.customer_id=_customer_id and cpu.status='active'
  order by case cpu.portal_role when 'admin' then 1 when 'operations' then 2 else 3 end
  limit 1;
  if _org_id is null or _role not in ('admin','operations') then
    raise exception 'You do not have permission to edit job notes';
  end if;
  if not exists(select 1 from public.jobs j where j.id=_job_id and j.customer_id=_customer_id and j.organization_id=_org_id) then
    raise exception 'Job not found';
  end if;
  insert into public.customer_job_notes(organization_id,customer_id,job_id,notes,updated_by)
  values(_org_id,_customer_id,_job_id,nullif(trim(_notes),''),auth.uid())
  on conflict(customer_id,job_id) do update
    set notes=excluded.notes,updated_by=excluded.updated_by,updated_at=now();
end;
$function$;

drop function if exists public.set_my_customer_job_contact(uuid,uuid,uuid);
create function public.set_my_customer_job_contact(_customer_id uuid,_job_id uuid,_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _org_id uuid;
  _role text;
begin
  select cpu.organization_id,cpu.portal_role into _org_id,_role
  from public.customer_portal_users cpu
  where cpu.user_id=auth.uid() and cpu.customer_id=_customer_id and cpu.status='active'
  order by case cpu.portal_role when 'admin' then 1 when 'operations' then 2 else 3 end
  limit 1;
  if _org_id is null or _role not in ('admin','operations') then
    raise exception 'You do not have permission to change the onsite contact';
  end if;
  if not exists(select 1 from public.jobs j where j.id=_job_id and j.customer_id=_customer_id and j.organization_id=_org_id) then
    raise exception 'Job not found';
  end if;
  update public.job_contacts set is_primary=false where organization_id=_org_id and job_id=_job_id and is_primary=true;
  if _contact_id is null then return; end if;
  if not exists(select 1 from public.customer_contacts cc where cc.id=_contact_id and cc.customer_id=_customer_id and cc.organization_id=_org_id and cc.status<>'archived') then
    raise exception 'Contact not found';
  end if;
  if exists(select 1 from public.job_contacts jc where jc.organization_id=_org_id and jc.job_id=_job_id and jc.contact_id=_contact_id) then
    update public.job_contacts set is_primary=true where organization_id=_org_id and job_id=_job_id and contact_id=_contact_id;
  else
    insert into public.job_contacts(organization_id,job_id,contact_id,is_primary,created_by)
    values(_org_id,_job_id,_contact_id,true,auth.uid());
  end if;
end;
$function$;

drop function if exists public.get_my_customer_job_requests(uuid);
create function public.get_my_customer_job_requests(_customer_id uuid)
returns table(
  request_id uuid,
  title text,
  requested_start timestamptz,
  site_name text,
  site_address text,
  onsite_contact_id uuid,
  onsite_contact_name text,
  client_notes text,
  status text,
  linked_job_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select r.id,r.title,r.requested_start,r.site_name,r.site_address,r.onsite_contact_id,cc.name,r.client_notes,r.status,r.linked_job_id,r.created_at
  from public.customer_job_requests r
  left join public.customer_contacts cc on cc.id=r.onsite_contact_id and cc.customer_id=r.customer_id and cc.organization_id=r.organization_id
  where r.customer_id=_customer_id
    and exists (
      select 1 from public.customer_portal_users cpu
      where cpu.user_id=auth.uid() and cpu.customer_id=r.customer_id and cpu.organization_id=r.organization_id and cpu.status='active'
    )
  order by r.created_at desc;
$function$;

drop function if exists public.create_my_customer_job_request(uuid,text,timestamptz,text,text,uuid,text);
create function public.create_my_customer_job_request(
  _customer_id uuid,
  _title text,
  _requested_start timestamptz,
  _site_name text,
  _site_address text,
  _onsite_contact_id uuid,
  _client_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _org_id uuid;
  _role text;
  _id uuid;
begin
  select cpu.organization_id,cpu.portal_role into _org_id,_role
  from public.customer_portal_users cpu
  where cpu.user_id=auth.uid() and cpu.customer_id=_customer_id and cpu.status='active'
  order by case cpu.portal_role when 'admin' then 1 when 'operations' then 2 else 3 end
  limit 1;
  if _org_id is null or _role not in ('admin','operations') then
    raise exception 'You do not have permission to request jobs';
  end if;
  if trim(coalesce(_title,''))='' then raise exception 'Request title is required'; end if;
  if _onsite_contact_id is not null and not exists(
    select 1 from public.customer_contacts cc where cc.id=_onsite_contact_id and cc.customer_id=_customer_id and cc.organization_id=_org_id and cc.status<>'archived'
  ) then raise exception 'Contact not found'; end if;
  insert into public.customer_job_requests(organization_id,customer_id,requested_by,title,requested_start,site_name,site_address,onsite_contact_id,client_notes)
  values(_org_id,_customer_id,auth.uid(),trim(_title),_requested_start,nullif(trim(_site_name),''),nullif(trim(_site_address),''),_onsite_contact_id,nullif(trim(_client_notes),''))
  returning id into _id;
  return _id;
end;
$function$;

revoke all on function public.get_my_customer_jobs(uuid) from public;
revoke all on function public.save_my_customer_job_note(uuid,uuid,text) from public;
revoke all on function public.set_my_customer_job_contact(uuid,uuid,uuid) from public;
revoke all on function public.get_my_customer_job_requests(uuid) from public;
revoke all on function public.create_my_customer_job_request(uuid,text,timestamptz,text,text,uuid,text) from public;

grant execute on function public.get_my_customer_jobs(uuid) to authenticated;
grant execute on function public.save_my_customer_job_note(uuid,uuid,text) to authenticated;
grant execute on function public.set_my_customer_job_contact(uuid,uuid,uuid) to authenticated;
grant execute on function public.get_my_customer_job_requests(uuid) to authenticated;
grant execute on function public.create_my_customer_job_request(uuid,text,timestamptz,text,text,uuid,text) to authenticated;
