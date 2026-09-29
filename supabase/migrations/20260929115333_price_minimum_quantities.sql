alter table public.price_sheet_items add column minimum_quantity numeric(12,3) not null default 0 check(minimum_quantity>=0 and minimum_quantity<>'NaN'::numeric);
create or replace function public.create_invoice_from_field_ticket(_organization_id uuid,_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  _user_id uuid := (select auth.uid());
  _ticket public.field_tickets%rowtype;
  _customer public.customers%rowtype;
  _organization public.organizations%rowtype;
  _job public.jobs%rowtype;
  _invoice_id uuid;
  _invoice_number text;
  _item record;
  _rate numeric;
  _minimum numeric;
  _sort integer := 0;
begin
  if _user_id is null then raise exception 'Sign in required.'; end if;
  if not private.has_org_permission(_organization_id,'tickets.manage') then raise exception 'You do not have permission to bill field tickets.'; end if;
  if not private.has_org_permission(_organization_id,'invoices.manage') then raise exception 'You do not have permission to create invoice drafts.'; end if;

  select * into _ticket from public.field_tickets where id=_ticket_id and organization_id=_organization_id for update;
  if _ticket.id is null then raise exception 'Field ticket not found.'; end if;
  if _ticket.status<>'approved' then raise exception 'Approve the field ticket before creating an invoice.'; end if;
  if _ticket.invoice_id is not null then
    select invoice_number into _invoice_number from public.invoices where id=_ticket.invoice_id and organization_id=_organization_id;
    return jsonb_build_object('invoice_id',_ticket.invoice_id,'invoice_number',_invoice_number,'existing',true);
  end if;

  select * into _customer from public.customers where id=_ticket.customer_id and organization_id=_organization_id;
  select * into _organization from public.organizations where id=_organization_id;
  if _ticket.job_id is not null then select * into _job from public.jobs where id=_ticket.job_id and organization_id=_organization_id; end if;

  insert into public.invoices(
    organization_id,customer_id,job_id,invoice_number,status,invoice_date,due_date,purchase_order,afe_number,
    project,location,job_description,authorization_date,authorized_by_name,
    billed_to_name,billed_to_address,billed_to_email,
    seller_name,seller_address,seller_phone,seller_email,gst_number,permit_number,wcb_number,
    currency_code,tax_rate,notes,terms,created_by
  ) values (
    _organization_id,_ticket.customer_id,_ticket.job_id,'','draft',current_date,current_date+30,_ticket.purchase_order,_ticket.afe_number,
    coalesce(_job.title,_ticket.ticket_number),coalesce(_ticket.site_address,_ticket.site_name,_job.site_address,_job.site_name),_ticket.work_description,
    case when _ticket.customer_signed_at is not null then (_ticket.customer_signed_at at time zone 'UTC')::date else _ticket.work_date end,
    _ticket.customer_signed_by,
    _customer.name,_customer.address,_customer.billing_email,
    coalesce(nullif(_organization.settings->>'invoice_company_name',''),_organization.name),
    nullif(_organization.settings->>'invoice_address',''),nullif(_organization.settings->>'invoice_phone',''),nullif(_organization.settings->>'invoice_email',''),
    nullif(_organization.settings->>'gst_number',''),nullif(_organization.settings->>'permit_number',''),nullif(_organization.settings->>'wcb_number',''),
    'CAD',coalesce(nullif(_organization.settings->>'invoice_tax_rate','')::numeric,5),
    concat_ws(E'\n','Created from field ticket '||_ticket.ticket_number,nullif(_ticket.operator_notes,'')),
    nullif(_organization.settings->>'invoice_terms',''),_user_id
  ) returning id,invoice_number into _invoice_id,_invoice_number;

  for _item in
    select ti.* from public.field_ticket_items ti where ti.organization_id=_organization_id and ti.ticket_id=_ticket_id order by ti.sort_order,ti.created_at
  loop
    _rate := _item.rate_snapshot;
    _minimum := 0;
    select p.minimum_quantity into _minimum from public.price_sheet_items p
    where p.organization_id=_organization_id and p.is_active and
      (p.id=_item.price_item_id or (_item.price_item_id is null and lower(trim(p.name))=lower(trim(_item.description))))
    order by p.sort_order,p.name limit 1;
    if _rate is null and _item.price_item_id is not null then
      select coalesce(o.rate,p.default_rate) into _rate
      from public.price_sheet_items p
      left join public.customer_price_overrides o on o.organization_id=p.organization_id and o.customer_id=_ticket.customer_id and o.price_item_id=p.id
      where p.id=_item.price_item_id and p.organization_id=_organization_id and p.is_active=true;
    end if;
    if _rate is null then
      select coalesce(o.rate,p.default_rate) into _rate
      from public.price_sheet_items p
      left join public.customer_price_overrides o on o.organization_id=p.organization_id and o.customer_id=_ticket.customer_id and o.price_item_id=p.id
      where p.organization_id=_organization_id and p.is_active=true and lower(trim(p.name))=lower(trim(_item.description))
      order by p.sort_order,p.name limit 1;
    end if;
    insert into public.invoice_line_items(organization_id,invoice_id,category,description,quantity,unit,rate,sort_order,created_by)
    values(_organization_id,_invoice_id,_item.category,_item.description,greatest(_item.quantity,coalesce(_minimum,0)),_item.unit,greatest(coalesce(_rate,0),0),_sort,_user_id);
    _sort := _sort+1;
  end loop;

  if _sort=0 then
    insert into public.invoice_line_items(organization_id,invoice_id,category,description,quantity,unit,rate,sort_order,created_by)
    values(_organization_id,_invoice_id,'other',coalesce(nullif(_ticket.work_description,''),_ticket.ticket_number),1,'flat',0,0,_user_id);
  end if;

  update public.field_tickets set invoice_id=_invoice_id,updated_at=now() where id=_ticket_id and organization_id=_organization_id;
  return jsonb_build_object('invoice_id',_invoice_id,'invoice_number',_invoice_number,'existing',false);
end;
$function$;

revoke all on function public.create_invoice_from_field_ticket(uuid,uuid) from public,anon;
grant execute on function public.create_invoice_from_field_ticket(uuid,uuid) to authenticated,service_role;

