alter table public.customers
  add column if not exists billing_address text,
  add column if not exists default_purchase_order text,
  add column if not exists default_afe_number text,
  add column if not exists payment_terms text,
  add column if not exists internal_notes text,
  add column if not exists portal_notes text;

update public.customers
set internal_notes = notes
where internal_notes is null and notes is not null;

create table if not exists public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  address text,
  access_directions text,
  contact_id uuid references public.customer_contacts(id) on delete set null,
  purchase_order text,
  afe_number text,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_sites_customer_idx
  on public.customer_sites(customer_id,status,name);
create index if not exists customer_sites_organization_idx
  on public.customer_sites(organization_id,customer_id);

create table if not exists public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  site_id uuid references public.customer_sites(id) on delete set null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  category text not null default 'general' check (category in ('general','agreement','insurance','po_afe','site','safety','other')),
  description text,
  visible_to_client boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_documents_customer_idx
  on public.customer_documents(customer_id,visible_to_client,created_at desc);
create index if not exists customer_documents_organization_idx
  on public.customer_documents(organization_id,customer_id);

create or replace function private.is_customer_portal_member(
  _customer_id uuid,
  _roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.customer_portal_users cpu
    where cpu.user_id=(select auth.uid())
      and cpu.customer_id=_customer_id
      and cpu.status='active'
      and (_roles is null or cpu.portal_role=any(_roles))
  );
$$;

revoke all on function private.is_customer_portal_member(uuid,text[]) from public,anon,authenticated,service_role;

alter table public.customer_sites enable row level security;
alter table public.customer_documents enable row level security;

drop policy if exists "customer sites view" on public.customer_sites;
create policy "customer sites view"
on public.customer_sites for select
to authenticated
using (
  private.has_org_permission(organization_id,'customers.view')
  or private.is_customer_portal_member(customer_id,null)
);

drop policy if exists "customer sites insert" on public.customer_sites;
create policy "customer sites insert"
on public.customer_sites for insert
to authenticated
with check (
  private.has_org_permission(organization_id,'customers.edit')
  or private.is_customer_portal_member(customer_id,array['admin','operations'])
);

drop policy if exists "customer sites update" on public.customer_sites;
create policy "customer sites update"
on public.customer_sites for update
to authenticated
using (
  private.has_org_permission(organization_id,'customers.edit')
  or private.is_customer_portal_member(customer_id,array['admin','operations'])
)
with check (
  private.has_org_permission(organization_id,'customers.edit')
  or private.is_customer_portal_member(customer_id,array['admin','operations'])
);

drop policy if exists "customer sites delete" on public.customer_sites;
create policy "customer sites delete"
on public.customer_sites for delete
to authenticated
using (private.has_org_permission(organization_id,'customers.edit'));

drop policy if exists "customer documents view" on public.customer_documents;
create policy "customer documents view"
on public.customer_documents for select
to authenticated
using (
  private.has_org_permission(organization_id,'customers.view')
  or (visible_to_client and private.is_customer_portal_member(customer_id,null))
);

drop policy if exists "customer documents insert" on public.customer_documents;
create policy "customer documents insert"
on public.customer_documents for insert
to authenticated
with check (private.has_org_permission(organization_id,'customers.edit'));

drop policy if exists "customer documents update" on public.customer_documents;
create policy "customer documents update"
on public.customer_documents for update
to authenticated
using (private.has_org_permission(organization_id,'customers.edit'))
with check (private.has_org_permission(organization_id,'customers.edit'));

drop policy if exists "customer documents delete" on public.customer_documents;
create policy "customer documents delete"
on public.customer_documents for delete
to authenticated
using (private.has_org_permission(organization_id,'customers.edit'));

grant select,insert,update,delete on public.customer_sites to authenticated;
grant select,insert,update,delete on public.customer_documents to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'customer-documents',
  'customer-documents',
  false,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Northborn customer document read" on storage.objects;
create policy "Northborn customer document read"
on storage.objects for select
to authenticated
using (
  bucket_id='customer-documents'
  and exists(
    select 1
    from public.customer_documents d
    where d.storage_path=name
      and (
        private.has_org_permission(d.organization_id,'customers.view')
        or (d.visible_to_client and private.is_customer_portal_member(d.customer_id,null))
      )
  )
);

drop policy if exists "Northborn customer document upload" on storage.objects;
create policy "Northborn customer document upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id='customer-documents'
  and exists(
    select 1
    from public.organization_members m
    join public.customers c on c.organization_id=m.organization_id
    where m.user_id=(select auth.uid())
      and m.status='active'
      and private.has_org_permission(m.organization_id,'customers.edit')
      and m.organization_id::text=(storage.foldername(name))[1]
      and c.id::text=(storage.foldername(name))[2]
  )
);

drop policy if exists "Northborn customer document update" on storage.objects;
create policy "Northborn customer document update"
on storage.objects for update
to authenticated
using (
  bucket_id='customer-documents'
  and exists(
    select 1
    from public.customer_documents d
    where d.storage_path=name
      and private.has_org_permission(d.organization_id,'customers.edit')
  )
)
with check (
  bucket_id='customer-documents'
  and exists(
    select 1
    from public.customer_documents d
    where d.storage_path=name
      and private.has_org_permission(d.organization_id,'customers.edit')
  )
);

drop policy if exists "Northborn customer document delete" on storage.objects;
create policy "Northborn customer document delete"
on storage.objects for delete
to authenticated
using (
  bucket_id='customer-documents'
  and exists(
    select 1
    from public.customer_documents d
    where d.storage_path=name
      and private.has_org_permission(d.organization_id,'customers.edit')
  )
);

create or replace function public.get_my_customer_profile(_customer_id uuid)
returns table(
  customer_id uuid,
  billing_address text,
  default_purchase_order text,
  default_afe_number text,
  payment_terms text,
  portal_notes text
)
language sql
stable
security definer
set search_path=''
as $$
  select c.id,c.billing_address,c.default_purchase_order,c.default_afe_number,c.payment_terms,c.portal_notes
  from public.customers c
  where c.id=_customer_id
    and exists(
      select 1
      from public.customer_portal_users cpu
      where cpu.user_id=(select auth.uid())
        and cpu.customer_id=c.id
        and cpu.organization_id=c.organization_id
        and cpu.status='active'
    );
$$;

revoke all on function public.get_my_customer_profile(uuid) from public,anon;
grant execute on function public.get_my_customer_profile(uuid) to authenticated,service_role;

create or replace function public.update_my_customer_profile(
  _customer_id uuid,
  _billing_address text,
  _default_purchase_order text,
  _default_afe_number text,
  _payment_terms text,
  _portal_notes text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare _org_id uuid;
begin
  select cpu.organization_id into _org_id
  from public.customer_portal_users cpu
  where cpu.user_id=(select auth.uid())
    and cpu.customer_id=_customer_id
    and cpu.status='active'
    and cpu.portal_role='admin'
  limit 1;

  if _org_id is null then
    raise exception 'You do not have permission to edit this client';
  end if;

  update public.customers
  set billing_address=nullif(trim(_billing_address),''),
      default_purchase_order=nullif(trim(_default_purchase_order),''),
      default_afe_number=nullif(trim(_default_afe_number),''),
      payment_terms=nullif(trim(_payment_terms),''),
      portal_notes=nullif(trim(_portal_notes),''),
      updated_at=now()
  where id=_customer_id and organization_id=_org_id;
end;
$$;

revoke all on function public.update_my_customer_profile(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.update_my_customer_profile(uuid,text,text,text,text,text) to authenticated,service_role;

create or replace function public.get_my_customer_jobs(_customer_id uuid)
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
set search_path=''
as $$
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
    coalesce(
      nullif(trim(pe.first_name || ' ' || pe.last_name),''),
      op.operator_name
    ),
    coalesce(pe.phone,op.operator_phone),
    coalesce(nullif(trim(j.dispatch_contact_phone),''),nullif(trim(o.settings->>'dispatch_phone'),'')),
    coalesce(nullif(trim(j.emergency_contact_phone),''),nullif(trim(o.settings->>'emergency_phone'),'')),
    n.notes
  from public.jobs j
  join public.organizations o on o.id=j.organization_id
  left join public.employees pe
    on pe.id=j.primary_operator_employee_id
   and pe.organization_id=j.organization_id
  left join public.customer_job_notes n
    on n.job_id=j.id
   and n.customer_id=j.customer_id
   and n.organization_id=j.organization_id
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
    join public.employees e
      on e.id=da.employee_id
     and e.organization_id=da.organization_id
    where da.job_id=j.id
      and da.organization_id=j.organization_id
      and da.employee_id is not null
      and (
        lower(coalesce(da.role,''))='operator'
        or lower(coalesce(e.position,'')) like '%operator%'
      )
    order by case when lower(coalesce(da.role,''))='operator' then 0 else 1 end,da.created_at asc
    limit 1
  ) op on true
  where j.customer_id=_customer_id
    and exists(
      select 1
      from public.customer_portal_users cpu
      where cpu.user_id=(select auth.uid())
        and cpu.customer_id=j.customer_id
        and cpu.organization_id=j.organization_id
        and cpu.status='active'
    )
  order by coalesce(j.onsite_time,j.scheduled_start,j.created_at) desc;
$$;

revoke all on function public.get_my_customer_jobs(uuid) from public,anon;
grant execute on function public.get_my_customer_jobs(uuid) to authenticated,service_role;
