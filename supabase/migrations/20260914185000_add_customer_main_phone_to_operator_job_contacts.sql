drop function if exists public.get_my_assigned_job_contacts(uuid);

create function public.get_my_assigned_job_contacts(_organization_id uuid)
returns table(
  job_id uuid,
  customer_id uuid,
  customer_name text,
  customer_phone text,
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
set search_path = ''
as $$
  select
    j.id,
    c.id,
    c.name,
    c.phone,
    cc.id,
    cc.name,
    cc.title,
    cc.phone,
    cc.email,
    cc.contact_type,
    coalesce(jc.is_primary,false)
  from public.jobs j
  join public.customers c on c.id=j.customer_id and c.organization_id=j.organization_id
  left join public.job_contacts jc on jc.job_id=j.id and jc.organization_id=j.organization_id
  left join public.customer_contacts cc on cc.id=jc.contact_id and cc.organization_id=j.organization_id and cc.customer_id=j.customer_id and cc.status='active'
  where j.organization_id=_organization_id
    and private.has_org_permission(j.organization_id,'jobs.assigned.view')
    and private.is_user_assigned_to_job(j.id,j.organization_id)
  order by j.id, coalesce(jc.is_primary,false) desc, cc.name nulls last;
$$;

revoke all on function public.get_my_assigned_job_contacts(uuid) from public, anon;
grant execute on function public.get_my_assigned_job_contacts(uuid) to authenticated;
