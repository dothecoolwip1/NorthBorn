-- Repository-only migration. Apply after Packs 6 and 7 before deploying this client.
create or replace function public.save_invoice_with_lines(
  _organization_id uuid, _invoice_id uuid, _invoice jsonb, _lines jsonb,
  _expected_updated_at timestamptz default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  _row public.invoices;
  _existing public.invoices;
  _id uuid;
  _status text;
  _paid numeric;
begin
  if auth.uid() is null or not private.has_org_permission(_organization_id,'invoices.manage') then
    raise exception 'Invoice management permission required';
  end if;
  if jsonb_typeof(_invoice) is distinct from 'object' or jsonb_typeof(_lines) is distinct from 'array' then
    raise exception 'Invoice and line items are required';
  end if;
  if jsonb_array_length(_lines) < 1 or jsonb_array_length(_lines) > 500 then
    raise exception 'An invoice must contain between 1 and 500 line items';
  end if;
  if exists(select 1 from jsonb_array_elements(_lines) l where
    jsonb_typeof(l) <> 'object' or nullif(trim(l->>'description'),'') is null
    or (l->>'quantity') is null or (l->>'rate') is null
    or (l->>'quantity')::numeric < 0 or (l->>'rate')::numeric < 0
    or lower(l->>'quantity') in ('nan','infinity','-infinity')
    or lower(l->>'rate') in ('nan','infinity','-infinity')) then
    raise exception 'Every line requires a description and nonnegative finite quantity and rate';
  end if;
  _row := jsonb_populate_record(null::public.invoices, _invoice);
  _status := coalesce(_row.status,'draft');
  _paid := coalesce(_row.amount_paid,0);
  if _invoice_id is not null then
    select * into _existing from public.invoices where id=_invoice_id and organization_id=_organization_id for update;
    if not found then raise exception 'Invoice not found or not accessible'; end if;
    if _expected_updated_at is null or _existing.updated_at <> _expected_updated_at then
      raise exception 'This invoice changed since you opened it. Reload it before saving.';
    end if;
    _id := _invoice_id;
  end if;
  -- Keep the header in draft while line triggers recalculate intermediate totals.
  -- Publish the requested status only once the complete invoice exists.
  if _id is null then
    insert into public.invoices(organization_id,customer_id,job_id,invoice_number,status,invoice_date,created_by)
    values(_organization_id,_row.customer_id,_row.job_id,coalesce(_row.invoice_number,''),'draft',coalesce(_row.invoice_date,current_date),auth.uid())
    returning id into _id;
  end if;
  update public.invoices set
    customer_id=_row.customer_id, job_id=_row.job_id,
    invoice_number=coalesce(nullif(trim(_row.invoice_number),''),invoice_number),
    invoice_date=coalesce(_row.invoice_date,current_date), due_date=_row.due_date,
    purchase_order=_row.purchase_order, afe_number=_row.afe_number,
    project=_row.project, location=_row.location, area=_row.area, job_description=_row.job_description,
    billed_to_name=_row.billed_to_name,billed_to_address=_row.billed_to_address,billed_to_email=_row.billed_to_email,
    seller_name=_row.seller_name,seller_address=_row.seller_address,seller_phone=_row.seller_phone,seller_email=_row.seller_email,
    gst_number=_row.gst_number,permit_number=_row.permit_number,wcb_number=_row.wcb_number,
    currency_code=coalesce(_row.currency_code,'CAD'),tax_rate=coalesce(_row.tax_rate,0),
    notes=_row.notes,terms=_row.terms,status='draft',amount_paid=0
  where id=_id and organization_id=_organization_id;
  delete from public.invoice_line_items where invoice_id=_id and organization_id=_organization_id;
  insert into public.invoice_line_items(organization_id,invoice_id,category,description,quantity,unit,rate,sort_order,created_by)
  select _organization_id,_id,coalesce(l.value->>'category','other'),trim(l.value->>'description'),
    (l.value->>'quantity')::numeric,coalesce(l.value->>'unit','each'),(l.value->>'rate')::numeric,
    l.ordinality::integer-1,auth.uid()
  from jsonb_array_elements(_lines) with ordinality as l(value,ordinality);
  if _paid > (select total from public.invoices where id=_id) then
    raise exception 'Payment cannot exceed the invoice total';
  end if;
  update public.invoices set status=_status,amount_paid=_paid where id=_id and organization_id=_organization_id
  returning * into _row;
  return to_jsonb(_row);
end;
$function$;
revoke all on function public.save_invoice_with_lines(uuid,uuid,jsonb,jsonb,timestamptz) from public,anon;
grant execute on function public.save_invoice_with_lines(uuid,uuid,jsonb,jsonb,timestamptz) to authenticated;
