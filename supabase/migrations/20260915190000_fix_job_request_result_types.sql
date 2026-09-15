create or replace function public.get_customer_job_requests_for_org(_organization_id uuid)
returns table(
  request_id uuid,
  customer_id uuid,
  customer_name text,
  requested_by uuid,
  requested_by_email text,
  title text,
  requested_start timestamptz,
  site_name text,
  site_address text,
  onsite_contact_id uuid,
  onsite_contact_name text,
  client_notes text,
  status text,
  linked_job_id uuid,
  decision_type text,
  decision_reason text,
  reviewed_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not private.has_org_permission(_organization_id,'jobs.view') then
    raise exception 'You do not have permission to view job requests';
  end if;

  return query
  select
    r.id::uuid,
    r.customer_id::uuid,
    c.name::text,
    r.requested_by::uuid,
    coalesce(u.email::text,'')::text,
    r.title::text,
    r.requested_start::timestamptz,
    r.site_name::text,
    r.site_address::text,
    r.onsite_contact_id::uuid,
    cc.name::text,
    r.client_notes::text,
    r.status::text,
    r.linked_job_id::uuid,
    r.decision_type::text,
    r.decision_reason::text,
    r.reviewed_at::timestamptz,
    r.created_at::timestamptz
  from public.customer_job_requests r
  join public.customers c on c.id=r.customer_id and c.organization_id=r.organization_id
  left join auth.users u on u.id=r.requested_by
  left join public.customer_contacts cc on cc.id=r.onsite_contact_id and cc.customer_id=r.customer_id and cc.organization_id=r.organization_id
  where r.organization_id=_organization_id
  order by case r.status when 'submitted' then 0 when 'reviewing' then 1 else 2 end, r.created_at desc;
end;
$function$;

create or replace function public.get_my_customer_job_requests(_customer_id uuid)
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
  decision_type text,
  decision_reason text,
  reviewed_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  select
    r.id::uuid,
    r.title::text,
    r.requested_start::timestamptz,
    r.site_name::text,
    r.site_address::text,
    r.onsite_contact_id::uuid,
    cc.name::text,
    r.client_notes::text,
    r.status::text,
    r.linked_job_id::uuid,
    r.decision_type::text,
    r.decision_reason::text,
    r.reviewed_at::timestamptz,
    r.created_at::timestamptz
  from public.customer_job_requests r
  left join public.customer_contacts cc on cc.id=r.onsite_contact_id and cc.customer_id=r.customer_id and cc.organization_id=r.organization_id
  where r.customer_id=_customer_id
    and exists(
      select 1 from public.customer_portal_users cpu
      where cpu.user_id=auth.uid()
        and cpu.customer_id=r.customer_id
        and cpu.organization_id=r.organization_id
        and cpu.status='active'
    )
  order by r.created_at desc;
$function$;
