drop function if exists public.get_my_assigned_job_contacts(uuid);

create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  title text,
  phone text,
  email text,
  contact_type text not null default 'field' check (contact_type in ('field','dispatch','supervisor','billing','accounting','office','other')),
  notes text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  contact_id uuid not null references public.customer_contacts(id) on delete cascade,
  is_primary boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(job_id, contact_id)
);

create index if not exists customer_contacts_org_customer_idx on public.customer_contacts(organization_id, customer_id);
create index if not exists job_contacts_org_job_idx on public.job_contacts(organization_id, job_id);
create index if not exists job_contacts_contact_idx on public.job_contacts(contact_id);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='customer_contacts_updated_at') then
    create trigger customer_contacts_updated_at before update on public.customer_contacts for each row execute function private.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='customer_contacts_audit') then
    create trigger customer_contacts_audit after insert or update or delete on public.customer_contacts for each row execute function private.write_audit_log();
  end if;
  if not exists (select 1 from pg_trigger where tgname='job_contacts_audit') then
    create trigger job_contacts_audit after insert or update or delete on public.job_contacts for each row execute function private.write_audit_log();
  end if;
end $$;

alter table public.customer_contacts enable row level security;
alter table public.job_contacts enable row level security;

grant select, insert, update, delete on public.customer_contacts to authenticated;
grant select, insert, update, delete on public.job_contacts to authenticated;
grant all on public.customer_contacts, public.job_contacts to service_role;

drop policy if exists customer_contacts_select on public.customer_contacts;
create policy customer_contacts_select on public.customer_contacts for select to authenticated
using (private.has_org_permission(organization_id,'customers.view'));
drop policy if exists customer_contacts_insert on public.customer_contacts;
create policy customer_contacts_insert on public.customer_contacts for insert to authenticated
with check (private.has_org_permission(organization_id,'customers.edit') and created_by=(select auth.uid()));
drop policy if exists customer_contacts_update on public.customer_contacts;
create policy customer_contacts_update on public.customer_contacts for update to authenticated
using (private.has_org_permission(organization_id,'customers.edit'))
with check (private.has_org_permission(organization_id,'customers.edit'));
drop policy if exists customer_contacts_delete on public.customer_contacts;
create policy customer_contacts_delete on public.customer_contacts for delete to authenticated
using (private.has_org_permission(organization_id,'customers.edit'));

drop policy if exists job_contacts_select on public.job_contacts;
create policy job_contacts_select on public.job_contacts for select to authenticated
using (private.has_org_permission(organization_id,'jobs.view'));
drop policy if exists job_contacts_insert on public.job_contacts;
create policy job_contacts_insert on public.job_contacts for insert to authenticated
with check (private.has_org_permission(organization_id,'jobs.edit') and created_by=(select auth.uid()));
drop policy if exists job_contacts_update on public.job_contacts;
create policy job_contacts_update on public.job_contacts for update to authenticated
using (private.has_org_permission(organization_id,'jobs.edit'))
with check (private.has_org_permission(organization_id,'jobs.edit'));
drop policy if exists job_contacts_delete on public.job_contacts;
create policy job_contacts_delete on public.job_contacts for delete to authenticated
using (private.has_org_permission(organization_id,'jobs.edit'));

create function public.get_my_assigned_job_contacts(_organization_id uuid)
returns table (
  job_id uuid,
  customer_id uuid,
  customer_name text,
  contact_id uuid,
  contact_name text,
  contact_title text,
  contact_phone text,
  contact_email text,
  contact_type text,
  is_primary boolean
)
language sql
stable
security definer
set search_path=''
as $$
  select
    j.id as job_id,
    c.id as customer_id,
    c.name as customer_name,
    cc.id as contact_id,
    cc.name as contact_name,
    cc.title as contact_title,
    cc.phone as contact_phone,
    cc.email as contact_email,
    cc.contact_type,
    jc.is_primary
  from public.jobs j
  join public.customers c on c.id=j.customer_id and c.organization_id=j.organization_id
  join public.job_contacts jc on jc.job_id=j.id and jc.organization_id=j.organization_id
  join public.customer_contacts cc on cc.id=jc.contact_id and cc.organization_id=j.organization_id and cc.customer_id=j.customer_id
  where j.organization_id=_organization_id
    and cc.status='active'
    and private.has_org_permission(j.organization_id,'jobs.assigned.view')
    and private.is_user_assigned_to_job(j.id,j.organization_id)
  order by jc.is_primary desc, cc.name;
$$;

revoke all on function public.get_my_assigned_job_contacts(uuid) from public, anon;
grant execute on function public.get_my_assigned_job_contacts(uuid) to authenticated, service_role;