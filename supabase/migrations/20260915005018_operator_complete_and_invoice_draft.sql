create or replace function public.complete_my_assigned_job(_organization_id uuid, _job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _user_id uuid := (select auth.uid());
  _job public.jobs%rowtype;
begin
  if _user_id is null then raise exception 'Sign in required.'; end if;
  select * into _job from public.jobs where id=_job_id and organization_id=_organization_id;
  if _job.id is null then raise exception 'Job not found.'; end if;
  if not private.has_org_permission(_organization_id,'jobs.assigned.view') or not private.is_user_assigned_to_job(_job_id,_organization_id) then
    raise exception 'You can only complete jobs assigned to you.';
  end if;
  if _job.status='cancelled' then raise exception 'A cancelled job cannot be completed.'; end if;
  if _job.status<>'completed' then
    update public.jobs set status='completed',completed_at=coalesce(completed_at,now()),completed_by=coalesce(completed_by,_user_id),updated_at=now()
    where id=_job_id and organization_id=_organization_id;
  end if;
  return jsonb_build_object('job_id',_job_id,'status','completed','completed_at',coalesce(_job.completed_at,now()));
end;
$$;

create or replace function public.get_my_assigned_job_invoice_draft(_organization_id uuid, _job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _user_id uuid := (select auth.uid());
  _job public.jobs%rowtype;
  _invoice public.invoices%rowtype;
  _lines jsonb := '[]'::jsonb;
begin
  if _user_id is null then raise exception 'Sign in required.'; end if;
  select * into _job from public.jobs where id=_job_id and organization_id=_organization_id;
  if _job.id is null then raise exception 'Job not found.'; end if;
  if not private.has_org_permission(_organization_id,'jobs.assigned.view') or not private.is_user_assigned_to_job(_job_id,_organization_id) then
    raise exception 'You can only access invoices for jobs assigned to you.';
  end if;
  select * into _invoice from public.invoices where organization_id=_organization_id and job_id=_job_id and status='draft' order by updated_at desc limit 1;
  if _invoice.id is null then return jsonb_build_object('invoice',null,'line_items','[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',li.id,'category',li.category,'description',li.description,'quantity',li.quantity,'unit',li.unit,'rate',li.rate,'amount',li.amount,'sort_order',li.sort_order) order by li.sort_order,li.created_at),'[]'::jsonb)
  into _lines from public.invoice_line_items li where li.organization_id=_organization_id and li.invoice_id=_invoice.id;
  return jsonb_build_object('invoice',to_jsonb(_invoice),'line_items',_lines);
end;
$$;

create or replace function public.save_my_assigned_job_invoice_draft(_organization_id uuid,_job_id uuid,_invoice jsonb,_line_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _user_id uuid := (select auth.uid());
  _job public.jobs%rowtype;
  _customer public.customers%rowtype;
  _organization public.organizations%rowtype;
  _invoice_id uuid;
  _existing_status text;
  _item jsonb;
  _sort integer := 0;
  _tax_rate numeric := 5;
begin
  if _user_id is null then raise exception 'Sign in required.'; end if;
  select * into _job from public.jobs where id=_job_id and organization_id=_organization_id;
  if _job.id is null then raise exception 'Job not found.'; end if;
  if not private.has_org_permission(_organization_id,'jobs.assigned.view') or not private.is_user_assigned_to_job(_job_id,_organization_id) then
    raise exception 'You can only create invoice drafts for jobs assigned to you.';
  end if;
  if _job.status<>'completed' then raise exception 'Complete the job before starting its invoice.'; end if;
  if jsonb_typeof(coalesce(_line_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(_line_items,'[]'::jsonb))=0 then raise exception 'Add at least one invoice line item.'; end if;
  select * into _customer from public.customers where id=_job.customer_id and organization_id=_organization_id;
  select * into _organization from public.organizations where id=_organization_id;
  select i.id,i.status into _invoice_id,_existing_status from public.invoices i where i.organization_id=_organization_id and i.job_id=_job_id order by case when i.status='draft' then 0 else 1 end,i.updated_at desc limit 1;
  if _invoice_id is not null and _existing_status<>'draft' then raise exception 'This job already has an invoice that is no longer a draft.'; end if;
  begin _tax_rate:=coalesce(nullif(_invoice->>'tax_rate','')::numeric,5); exception when others then _tax_rate:=5; end;
  _tax_rate:=greatest(0,least(_tax_rate,100));
  if _invoice_id is null then
    insert into public.invoices(organization_id,customer_id,job_id,invoice_number,status,invoice_date,due_date,purchase_order,afe_number,project,location,area,job_description,authorization_date,authorized_by_name,authorization_contact,authorization_email,billed_to_name,billed_to_address,billed_to_email,seller_name,seller_address,seller_phone,seller_email,gst_number,permit_number,wcb_number,currency_code,tax_rate,notes,terms,created_by)
    values(_organization_id,_job.customer_id,_job_id,'','draft',current_date,current_date+30,nullif(trim(_invoice->>'purchase_order'),''),nullif(trim(_invoice->>'afe_number'),''),coalesce(nullif(trim(_invoice->>'project'),''),_job.title),coalesce(nullif(trim(_invoice->>'location'),''),_job.site_address,_job.site_name),nullif(trim(_invoice->>'area'),''),coalesce(nullif(trim(_invoice->>'job_description'),''),_job.title),nullif(_invoice->>'authorization_date','')::date,nullif(trim(_invoice->>'authorized_by_name'),''),nullif(trim(_invoice->>'authorization_contact'),''),nullif(trim(_invoice->>'authorization_email'),''),_customer.name,_customer.address,_customer.billing_email,coalesce(nullif(_organization.settings->>'invoice_company_name',''),_organization.name),nullif(_organization.settings->>'invoice_address',''),nullif(_organization.settings->>'invoice_phone',''),nullif(_organization.settings->>'invoice_email',''),nullif(_organization.settings->>'gst_number',''),nullif(_organization.settings->>'permit_number',''),nullif(_organization.settings->>'wcb_number',''),'CAD',_tax_rate,nullif(trim(_invoice->>'notes'),''),nullif(_organization.settings->>'invoice_terms',''),_user_id)
    returning id into _invoice_id;
  else
    update public.invoices set purchase_order=nullif(trim(_invoice->>'purchase_order'),''),afe_number=nullif(trim(_invoice->>'afe_number'),''),project=coalesce(nullif(trim(_invoice->>'project'),''),project),location=coalesce(nullif(trim(_invoice->>'location'),''),location),area=nullif(trim(_invoice->>'area'),''),job_description=coalesce(nullif(trim(_invoice->>'job_description'),''),job_description),authorization_date=nullif(_invoice->>'authorization_date','')::date,authorized_by_name=nullif(trim(_invoice->>'authorized_by_name'),''),authorization_contact=nullif(trim(_invoice->>'authorization_contact'),''),authorization_email=nullif(trim(_invoice->>'authorization_email'),''),tax_rate=_tax_rate,notes=nullif(trim(_invoice->>'notes'),''),updated_at=now()
    where id=_invoice_id and organization_id=_organization_id and status='draft';
  end if;
  delete from public.invoice_line_items where organization_id=_organization_id and invoice_id=_invoice_id;
  for _item in select value from jsonb_array_elements(_line_items) loop
    if nullif(trim(_item->>'description'),'') is null then continue; end if;
    insert into public.invoice_line_items(organization_id,invoice_id,category,description,quantity,unit,rate,sort_order,created_by)
    values(_organization_id,_invoice_id,coalesce(nullif(trim(_item->>'category'),''),'other'),trim(_item->>'description'),greatest(coalesce(nullif(_item->>'quantity','')::numeric,1),0),coalesce(nullif(trim(_item->>'unit'),''),'hour'),greatest(coalesce(nullif(_item->>'rate','')::numeric,0),0),_sort,_user_id);
    _sort:=_sort+1;
  end loop;
  if _sort=0 then raise exception 'Add at least one valid invoice line item.'; end if;
  return _invoice_id;
end;
$$;

revoke all on function public.complete_my_assigned_job(uuid,uuid) from public;
revoke all on function public.get_my_assigned_job_invoice_draft(uuid,uuid) from public;
revoke all on function public.save_my_assigned_job_invoice_draft(uuid,uuid,jsonb,jsonb) from public;
grant execute on function public.complete_my_assigned_job(uuid,uuid) to authenticated;
grant execute on function public.get_my_assigned_job_invoice_draft(uuid,uuid) to authenticated;
grant execute on function public.save_my_assigned_job_invoice_draft(uuid,uuid,jsonb,jsonb) to authenticated;
