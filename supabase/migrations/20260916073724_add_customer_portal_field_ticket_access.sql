create or replace function public.get_my_customer_field_tickets(_customer_id uuid)
returns table(
  ticket_id uuid,
  ticket_number text,
  ticket_type text,
  work_date date,
  job_id uuid,
  job_number text,
  job_title text,
  site_name text,
  site_address text,
  work_description text,
  travel_hours numeric,
  work_hours numeric,
  standby_hours numeric,
  quantity numeric,
  quantity_unit text,
  customer_signed_by text,
  customer_signed_at timestamptz,
  approved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    ft.id,
    ft.ticket_number,
    ft.ticket_type,
    ft.work_date,
    ft.job_id,
    j.job_number,
    j.title,
    coalesce(ft.site_name,j.site_name),
    coalesce(ft.site_address,j.site_address),
    ft.work_description,
    ft.travel_hours,
    ft.work_hours,
    ft.standby_hours,
    ft.quantity,
    ft.quantity_unit,
    ft.customer_signed_by,
    ft.customer_signed_at,
    ft.reviewed_at
  from public.field_tickets ft
  left join public.jobs j on j.id=ft.job_id and j.organization_id=ft.organization_id and j.customer_id=ft.customer_id
  where ft.customer_id=_customer_id
    and ft.status='approved'
    and exists(
      select 1
      from public.customer_portal_users cpu
      where cpu.user_id=(select auth.uid())
        and cpu.customer_id=ft.customer_id
        and cpu.organization_id=ft.organization_id
        and cpu.status='active'
    )
  order by ft.work_date desc,ft.reviewed_at desc nulls last,ft.created_at desc;
$function$;

create or replace function public.get_my_customer_field_ticket_detail(_customer_id uuid,_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  _ticket jsonb;
  _items jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select to_jsonb(x) into _ticket
  from (
    select
      ft.id as ticket_id,
      ft.ticket_number,
      ft.ticket_type,
      ft.work_date,
      ft.job_id,
      j.job_number,
      j.title as job_title,
      coalesce(ft.site_name,j.site_name) as site_name,
      coalesce(ft.site_address,j.site_address) as site_address,
      ft.purchase_order,
      ft.afe_number,
      ft.start_time,
      ft.end_time,
      ft.travel_hours,
      ft.work_hours,
      ft.standby_hours,
      ft.quantity,
      ft.quantity_unit,
      ft.disposal_location,
      ft.disposal_manifest,
      ft.work_description,
      ft.customer_signed_by,
      ft.customer_signature_data,
      ft.customer_signed_at,
      ft.reviewed_at as approved_at,
      c.name as customer_name,
      c.address as customer_address,
      trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')) as operator_name,
      fv.unit_number,
      fv.name as unit_name,
      fv.vehicle_type,
      o.name as organization_name,
      nullif(trim(o.settings->>'invoice_company_name'),'') as seller_name,
      nullif(trim(o.settings->>'invoice_address'),'') as seller_address,
      nullif(trim(o.settings->>'invoice_phone'),'') as seller_phone,
      nullif(trim(o.settings->>'invoice_email'),'') as seller_email
    from public.field_tickets ft
    join public.customers c on c.id=ft.customer_id and c.organization_id=ft.organization_id
    join public.organizations o on o.id=ft.organization_id
    left join public.jobs j on j.id=ft.job_id and j.organization_id=ft.organization_id and j.customer_id=ft.customer_id
    left join public.employees e on e.id=ft.primary_employee_id and e.organization_id=ft.organization_id
    left join public.fleet_vehicles fv on fv.id=ft.vehicle_id and fv.organization_id=ft.organization_id
    where ft.id=_ticket_id
      and ft.customer_id=_customer_id
      and ft.status='approved'
      and exists(
        select 1
        from public.customer_portal_users cpu
        where cpu.user_id=(select auth.uid())
          and cpu.customer_id=ft.customer_id
          and cpu.organization_id=ft.organization_id
          and cpu.status='active'
      )
  ) x;

  if _ticket is null then
    raise exception 'Field ticket not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id',fti.id,
    'category',fti.category,
    'description',fti.description,
    'quantity',fti.quantity,
    'unit',fti.unit,
    'sort_order',fti.sort_order
  ) order by fti.sort_order,fti.created_at,fti.id),'[]'::jsonb)
  into _items
  from public.field_ticket_items fti
  join public.field_tickets ft on ft.id=fti.ticket_id and ft.organization_id=fti.organization_id
  where fti.ticket_id=_ticket_id
    and ft.customer_id=_customer_id
    and ft.status='approved'
    and exists(
      select 1
      from public.customer_portal_users cpu
      where cpu.user_id=(select auth.uid())
        and cpu.customer_id=ft.customer_id
        and cpu.organization_id=ft.organization_id
        and cpu.status='active'
    );

  return jsonb_build_object('ticket',_ticket,'line_items',_items);
end;
$function$;

revoke execute on function public.get_my_customer_field_tickets(uuid) from public, anon;
revoke execute on function public.get_my_customer_field_ticket_detail(uuid,uuid) from public, anon;
grant execute on function public.get_my_customer_field_tickets(uuid) to authenticated;
grant execute on function public.get_my_customer_field_ticket_detail(uuid,uuid) to authenticated;
