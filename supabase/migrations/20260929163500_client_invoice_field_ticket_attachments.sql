create or replace function public.get_my_customer_invoice_detail(_customer_id uuid,_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  _invoice jsonb;
  _lines jsonb;
  _tickets jsonb;
begin
  select to_jsonb(x) into _invoice
  from (
    select i.id as invoice_id,i.invoice_number,i.invoice_date,i.due_date,i.status,i.job_id,j.job_number,j.title as job_title,
      i.purchase_order,i.afe_number,i.project,i.location,i.area,i.job_description,i.authorization_date,i.authorized_by_name,i.authorization_contact,i.authorization_email,
      i.billed_to_name,i.billed_to_address,i.billed_to_email,i.seller_name,i.seller_address,i.seller_phone,i.seller_email,i.gst_number,i.permit_number,i.wcb_number,
      i.currency_code,i.tax_rate,i.subtotal,i.tax_total,i.total,i.amount_paid,i.balance_due,i.notes,i.terms,i.last_sent_at
    from public.invoices i
    left join public.jobs j on j.id=i.job_id and j.organization_id=i.organization_id
    where i.id=_invoice_id and i.customer_id=_customer_id
      and i.status in ('issued','partially_paid','paid','overdue')
      and exists(
        select 1 from public.customer_portal_users cpu
        where cpu.user_id=(select auth.uid())
          and cpu.customer_id=i.customer_id
          and cpu.organization_id=i.organization_id
          and cpu.status='active'
      )
  ) x;

  if _invoice is null then raise exception 'Invoice not found'; end if;

  select coalesce(jsonb_agg(to_jsonb(li) order by li.sort_order,li.created_at,li.line_item_id),'[]'::jsonb) into _lines
  from (
    select l.id as line_item_id,l.category,l.description,l.quantity,l.unit,l.rate,l.amount,l.sort_order,l.created_at
    from public.invoice_line_items l
    where l.invoice_id=_invoice_id
  ) li;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ticket_id',ft.id,
    'ticket_number',ft.ticket_number,
    'ticket_type',ft.ticket_type,
    'work_date',ft.work_date,
    'job_id',ft.job_id,
    'work_description',ft.work_description,
    'customer_signed_by',ft.customer_signed_by,
    'customer_signed_at',ft.customer_signed_at,
    'approved_at',ft.reviewed_at
  ) order by ft.work_date,ft.created_at),'[]'::jsonb)
  into _tickets
  from public.field_tickets ft
  join public.invoices i
    on i.id=_invoice_id
   and i.organization_id=ft.organization_id
   and i.customer_id=ft.customer_id
  where ft.invoice_id=_invoice_id
    and ft.customer_id=_customer_id
    and ft.status='approved'
    and exists(
      select 1 from public.customer_portal_users cpu
      where cpu.user_id=(select auth.uid())
        and cpu.customer_id=ft.customer_id
        and cpu.organization_id=ft.organization_id
        and cpu.status='active'
    );

  return jsonb_build_object('invoice',_invoice,'line_items',_lines,'field_tickets',_tickets);
end;
$function$;

revoke execute on function public.get_my_customer_invoice_detail(uuid,uuid) from public, anon;
grant execute on function public.get_my_customer_invoice_detail(uuid,uuid) to authenticated;
