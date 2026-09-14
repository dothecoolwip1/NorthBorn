create or replace function public.get_my_assigned_job_contacts(_organization_id uuid)
returns table (
  job_id uuid,
  customer_id uuid,
  customer_name text,
  contact_phone text,
  contact_email text,
  customer_address text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct
    j.id as job_id,
    c.id as customer_id,
    c.name as customer_name,
    c.phone as contact_phone,
    c.billing_email as contact_email,
    c.address as customer_address
  from public.jobs j
  join public.customers c
    on c.id = j.customer_id
   and c.organization_id = j.organization_id
  join public.dispatch_assignments da
    on da.job_id = j.id
   and da.organization_id = j.organization_id
  join public.employees e
    on e.id = da.employee_id
   and e.organization_id = da.organization_id
  where j.organization_id = _organization_id
    and e.user_id = (select auth.uid())
    and e.status <> 'archived'
    and private.has_org_permission(_organization_id, 'jobs.assigned.view');
$$;

revoke all on function public.get_my_assigned_job_contacts(uuid) from public, anon;
grant execute on function public.get_my_assigned_job_contacts(uuid) to authenticated, service_role;
