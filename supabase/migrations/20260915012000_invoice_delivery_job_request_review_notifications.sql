alter table public.invoices
  add column if not exists sent_count integer not null default 0 check (sent_count >= 0),
  add column if not exists last_sent_at timestamptz,
  add column if not exists last_delivery_error text;

alter table public.customer_job_requests
  add column if not exists decision_type text check (decision_type is null or decision_type in ('approved','modified','declined')),
  add column if not exists decision_reason text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create or replace function private.calculate_invoice_totals_row()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  new.tax_total := round(new.subtotal * new.tax_rate / 100,2);
  new.total := new.subtotal + new.tax_total;
  if new.status='paid' and new.amount_paid < new.total then new.amount_paid := new.total; end if;
  if new.amount_paid >= new.total and new.total > 0 and new.status in ('issued','partially_paid','overdue') then
    new.status := 'paid';
    new.paid_at := coalesce(new.paid_at,now());
  elsif new.amount_paid > 0 and new.amount_paid < new.total and new.status in ('issued','overdue','paid') then
    new.status := 'partially_paid';
    new.paid_at := null;
  elsif new.amount_paid = 0 and new.status in ('partially_paid','paid') then
    new.status := 'issued';
    new.paid_at := null;
  end if;
  if new.status='issued' and new.issued_at is null then new.issued_at := now(); end if;
  if new.status='paid' and new.paid_at is null then new.paid_at := now(); end if;
  if new.status <> 'paid' then new.paid_at := null; end if;
  return new;
end;
$function$;

create or replace function private.notify_client_invoice_status()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  _title text;
  _message text;
  _type text;
begin
  if new.status not in ('issued','partially_paid','paid','overdue') then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  if new.status='paid' then
    _type := 'invoice_paid';
    _title := 'Invoice marked paid';
    _message := new.invoice_number || ' has been marked paid.';
  else
    _type := 'invoice_available';
    _title := 'Invoice available';
    _message := new.invoice_number || ' is available in your client portal.';
  end if;
  insert into public.user_notifications(organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload)
  select new.organization_id,cpu.user_id,_type,_title,_message,'invoice',new.id,
    jsonb_build_object('invoice_number',new.invoice_number,'status',new.status,'total',new.total,'balance_due',new.balance_due,'customer_id',new.customer_id)
  from public.customer_portal_users cpu
  where cpu.organization_id=new.organization_id
    and cpu.customer_id=new.customer_id
    and cpu.status='active';
  return new;
end;
$function$;

drop trigger if exists invoices_notify_client_status on public.invoices;
create trigger invoices_notify_client_status
after insert or update of status on public.invoices
for each row execute function private.notify_client_invoice_status();

drop function if exists public.get_my_customer_invoices(uuid);
create function public.get_my_customer_invoices(_customer_id uuid)
returns table(
  invoice_id uuid,
  invoice_number text,
  invoice_date date,
  due_date date,
  status text,
  job_id uuid,
  job_number text,
  job_title text,
  subtotal numeric,
  tax_total numeric,
  total numeric,
  amount_paid numeric,
  balance_due numeric,
  currency_code text,
  last_sent_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  select i.id,i.invoice_number,i.invoice_date,i.due_date,i.status,i.job_id,j.job_number,j.title,i.subtotal,i.tax_total,i.total,i.amount_paid,i.balance_due,i.currency_code,i.last_sent_at
  from public.invoices i
  left join public.jobs j on j.id=i.job_id and j.organization_id=i.organization_id
  where i.customer_id=_customer_id
    and i.status in ('issued','partially_paid','paid','overdue')
    and exists(
      select 1 from public.customer_portal_users cpu
      where cpu.user_id=auth.uid() and cpu.customer_id=i.customer_id and cpu.organization_id=i.organization_id and cpu.status='active'
    )
  order by i.invoice_date desc,i.created_at desc;
$function$;

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
        where cpu.user_id=auth.uid() and cpu.customer_id=i.customer_id and cpu.organization_id=i.organization_id and cpu.status='active'
      )
  ) x;
  if _invoice is null then raise exception 'Invoice not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(li) order by li.sort_order,li.created_at,li.line_item_id),'[]'::jsonb) into _lines
  from (
    select l.id as line_item_id,l.category,l.description,l.quantity,l.unit,l.rate,l.amount,l.sort_order,l.created_at
    from public.invoice_line_items l where l.invoice_id=_invoice_id
  ) li;
  return jsonb_build_object('invoice',_invoice,'line_items',_lines);
end;
$function$;

create or replace function public.get_invoice_delivery_payload(_organization_id uuid,_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  _invoice jsonb;
  _lines jsonb;
begin
  if not private.has_org_permission(_organization_id,'invoices.manage') then raise exception 'You do not have permission to send invoices'; end if;
  select to_jsonb(x) into _invoice
  from (
    select i.id as invoice_id,i.organization_id,i.customer_id,i.invoice_number,i.invoice_date,i.due_date,i.status,i.purchase_order,i.afe_number,i.project,i.location,i.area,i.job_description,
      i.billed_to_name,i.billed_to_address,i.billed_to_email,i.seller_name,i.seller_address,i.seller_phone,i.seller_email,i.gst_number,i.permit_number,i.wcb_number,
      i.currency_code,i.tax_rate,i.subtotal,i.tax_total,i.total,i.amount_paid,i.balance_due,i.notes,i.terms,c.name as customer_name
    from public.invoices i
    join public.customers c on c.id=i.customer_id and c.organization_id=i.organization_id
    where i.id=_invoice_id and i.organization_id=_organization_id
  ) x;
  if _invoice is null then raise exception 'Invoice not found'; end if;
  if nullif(trim(coalesce(_invoice->>'billed_to_email','')),'') is null then raise exception 'This invoice has no billing email'; end if;
  select coalesce(jsonb_agg(to_jsonb(li) order by li.sort_order,li.created_at,li.id),'[]'::jsonb) into _lines
  from (
    select l.id,l.category,l.description,l.quantity,l.unit,l.rate,l.amount,l.sort_order,l.created_at
    from public.invoice_line_items l where l.invoice_id=_invoice_id and l.organization_id=_organization_id
  ) li;
  return jsonb_build_object('invoice',_invoice,'line_items',_lines);
end;
$function$;

drop function if exists public.get_my_customer_job_requests(uuid);
create function public.get_my_customer_job_requests(_customer_id uuid)
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
  select r.id,r.title,r.requested_start,r.site_name,r.site_address,r.onsite_contact_id,cc.name,r.client_notes,r.status,r.linked_job_id,r.decision_type,r.decision_reason,r.reviewed_at,r.created_at
  from public.customer_job_requests r
  left join public.customer_contacts cc on cc.id=r.onsite_contact_id and cc.customer_id=r.customer_id and cc.organization_id=r.organization_id
  where r.customer_id=_customer_id
    and exists(
      select 1 from public.customer_portal_users cpu
      where cpu.user_id=auth.uid() and cpu.customer_id=r.customer_id and cpu.organization_id=r.organization_id and cpu.status='active'
    )
  order by r.created_at desc;
$function$;

create or replace function public.create_my_customer_job_request(
  _customer_id uuid,
  _title text,
  _requested_start timestamptz,
  _site_name text,
  _site_address text,
  _onsite_contact_id uuid,
  _client_notes text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  _org_id uuid;
  _role text;
  _id uuid;
  _customer_name text;
begin
  select cpu.organization_id,cpu.portal_role into _org_id,_role
  from public.customer_portal_users cpu
  where cpu.user_id=auth.uid() and cpu.customer_id=_customer_id and cpu.status='active'
  order by case cpu.portal_role when 'admin' then 1 when 'operations' then 2 else 3 end
  limit 1;
  if _org_id is null or _role not in ('admin','operations') then raise exception 'You do not have permission to request jobs'; end if;
  if trim(coalesce(_title,''))='' then raise exception 'Request title is required'; end if;
  if _onsite_contact_id is not null and not exists(
    select 1 from public.customer_contacts cc where cc.id=_onsite_contact_id and cc.customer_id=_customer_id and cc.organization_id=_org_id and cc.status<>'archived'
  ) then raise exception 'Contact not found'; end if;

  insert into public.customer_job_requests(organization_id,customer_id,requested_by,title,requested_start,site_name,site_address,onsite_contact_id,client_notes)
  values(_org_id,_customer_id,auth.uid(),trim(_title),_requested_start,nullif(trim(_site_name),''),nullif(trim(_site_address),''),_onsite_contact_id,nullif(trim(_client_notes),''))
  returning id into _id;

  select c.name into _customer_name from public.customers c where c.id=_customer_id and c.organization_id=_org_id;
  insert into public.user_notifications(organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload)
  select distinct _org_id,om.user_id,'job_request_submitted','New client job request',coalesce(_customer_name,'Client') || ' requested: ' || trim(_title),'job_request',_id,
    jsonb_build_object('customer_id',_customer_id,'customer_name',_customer_name,'requested_start',_requested_start)
  from public.organization_members om
  join public.membership_roles mr on mr.membership_id=om.id
  join public.role_permissions rp on rp.role_id=mr.role_id and rp.permission_key='jobs.edit'
  where om.organization_id=_org_id and om.status='active';
  return _id;
end;
$function$;

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
  if not private.has_org_permission(_organization_id,'jobs.view') then raise exception 'You do not have permission to view job requests'; end if;
  return query
  select r.id,r.customer_id,c.name,r.requested_by,coalesce(u.email,''),r.title,r.requested_start,r.site_name,r.site_address,r.onsite_contact_id,cc.name,
    r.client_notes,r.status,r.linked_job_id,r.decision_type,r.decision_reason,r.reviewed_at,r.created_at
  from public.customer_job_requests r
  join public.customers c on c.id=r.customer_id and c.organization_id=r.organization_id
  left join auth.users u on u.id=r.requested_by
  left join public.customer_contacts cc on cc.id=r.onsite_contact_id and cc.customer_id=r.customer_id and cc.organization_id=r.organization_id
  where r.organization_id=_organization_id
  order by case r.status when 'submitted' then 0 when 'reviewing' then 1 else 2 end,r.created_at desc;
end;
$function$;

create or replace function public.review_customer_job_request(
  _organization_id uuid,
  _request_id uuid,
  _decision text,
  _reason text,
  _title text,
  _scheduled_start timestamptz,
  _site_name text,
  _site_address text,
  _notes text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  _request public.customer_job_requests%rowtype;
  _job_id uuid;
  _job_number text;
  _decision_norm text := lower(trim(coalesce(_decision,'')));
  _client_title text;
  _client_message text;
begin
  if not private.has_org_permission(_organization_id,'jobs.edit') then raise exception 'You do not have permission to review job requests'; end if;
  if _decision_norm not in ('approved','modified','declined') then raise exception 'Decision must be approved, modified or declined'; end if;
  if _decision_norm in ('modified','declined') and trim(coalesce(_reason,''))='' then raise exception 'A reason is required when modifying or declining a request'; end if;

  select * into _request from public.customer_job_requests where id=_request_id and organization_id=_organization_id for update;
  if _request.id is null then raise exception 'Job request not found'; end if;
  if _request.status not in ('submitted','reviewing') then raise exception 'This job request has already been reviewed'; end if;

  if _decision_norm in ('approved','modified') then
    _job_number := 'JOB-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
    insert into public.jobs(organization_id,customer_id,job_number,title,site_name,site_address,scheduled_start,onsite_time,notes,status,created_by)
    values(_organization_id,_request.customer_id,_job_number,coalesce(nullif(trim(_title),''),_request.title),
      coalesce(nullif(trim(_site_name),''),_request.site_name),coalesce(nullif(trim(_site_address),''),_request.site_address),
      coalesce(_scheduled_start,_request.requested_start),coalesce(_scheduled_start,_request.requested_start),
      coalesce(nullif(trim(_notes),''),_request.client_notes),'scheduled',auth.uid())
    returning id into _job_id;
    if _request.onsite_contact_id is not null then
      insert into public.job_contacts(organization_id,job_id,contact_id,is_primary,created_by)
      values(_organization_id,_job_id,_request.onsite_contact_id,true,auth.uid())
      on conflict do nothing;
    end if;
  end if;

  update public.customer_job_requests
  set status=case when _decision_norm='declined' then 'declined' else 'approved' end,
      linked_job_id=_job_id,
      decision_type=_decision_norm,
      decision_reason=nullif(trim(_reason),''),
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      updated_at=now()
  where id=_request_id;

  if _decision_norm='declined' then
    _client_title := 'Job request declined';
    _client_message := _request.title || ' was declined. ' || trim(_reason);
  elsif _decision_norm='modified' then
    _client_title := 'Job request approved with changes';
    _client_message := _request.title || ' was approved with changes. ' || trim(_reason);
  else
    _client_title := 'Job request approved';
    _client_message := _request.title || ' was approved and added to the schedule.';
  end if;

  insert into public.user_notifications(organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload)
  select _organization_id,cpu.user_id,'job_request_' || _decision_norm,_client_title,_client_message,'job_request',_request_id,
    jsonb_build_object('decision',_decision_norm,'reason',nullif(trim(_reason),''),'linked_job_id',_job_id,'customer_id',_request.customer_id)
  from public.customer_portal_users cpu
  where cpu.organization_id=_organization_id and cpu.customer_id=_request.customer_id and cpu.status='active';

  return _job_id;
end;
$function$;

create or replace function public.record_invoice_delivery(_organization_id uuid,_invoice_id uuid,_error text default null)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.has_org_permission(_organization_id,'invoices.manage') then raise exception 'You do not have permission to update invoice delivery'; end if;
  update public.invoices
  set sent_count=case when nullif(trim(coalesce(_error,'')),'') is null then sent_count+1 else sent_count end,
      last_sent_at=case when nullif(trim(coalesce(_error,'')),'') is null then now() else last_sent_at end,
      last_delivery_error=nullif(trim(coalesce(_error,'')),'')
  where id=_invoice_id and organization_id=_organization_id;
end;
$function$;

create index if not exists invoices_last_sent_idx on public.invoices(organization_id,last_sent_at desc) where last_sent_at is not null;

grant select,update on public.invoices to authenticated;

revoke all on function public.get_my_customer_invoices(uuid) from public;
revoke all on function public.get_my_customer_invoice_detail(uuid,uuid) from public;
revoke all on function public.get_invoice_delivery_payload(uuid,uuid) from public;
revoke all on function public.get_my_customer_job_requests(uuid) from public;
revoke all on function public.create_my_customer_job_request(uuid,text,timestamptz,text,text,uuid,text) from public;
revoke all on function public.get_customer_job_requests_for_org(uuid) from public;
revoke all on function public.review_customer_job_request(uuid,uuid,text,text,text,timestamptz,text,text,text) from public;
revoke all on function public.record_invoice_delivery(uuid,uuid,text) from public;

grant execute on function public.get_my_customer_invoices(uuid) to authenticated;
grant execute on function public.get_my_customer_invoice_detail(uuid,uuid) to authenticated;
grant execute on function public.get_invoice_delivery_payload(uuid,uuid) to authenticated;
grant execute on function public.get_my_customer_job_requests(uuid) to authenticated;
grant execute on function public.create_my_customer_job_request(uuid,text,timestamptz,text,text,uuid,text) to authenticated;
grant execute on function public.get_customer_job_requests_for_org(uuid) to authenticated;
grant execute on function public.review_customer_job_request(uuid,uuid,text,text,text,timestamptz,text,text,text) to authenticated;
grant execute on function public.record_invoice_delivery(uuid,uuid,text) to authenticated;
