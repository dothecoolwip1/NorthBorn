alter table public.invoices
 add column approval_status text not null default 'draft' check(approval_status in ('draft','submitted','approved','returned')),
 add column approval_note text,
 add column approved_by uuid references auth.users(id),
 add column approved_at timestamptz,
 add column submitted_for_approval_at timestamptz;
-- Preserve issued historical documents without pretending to know their original reviewer.
update public.invoices set approval_status='approved' where status<>'draft';
create or replace function private.guard_invoice_approval() returns trigger language plpgsql security invoker set search_path='' as $function$
begin
 if tg_op='UPDATE' then
  new.approved_by:=old.approved_by;new.approved_at:=old.approved_at;new.submitted_for_approval_at:=old.submitted_for_approval_at;
  if row(new.customer_id,new.job_id,new.invoice_date,new.due_date,new.purchase_order,new.afe_number,new.project,new.location,new.job_description,new.billed_to_name,new.billed_to_address,new.billed_to_email,new.seller_name,new.seller_address,new.seller_phone,new.seller_email,new.currency_code,new.tax_rate,new.subtotal,new.notes,new.terms)
   is distinct from row(old.customer_id,old.job_id,old.invoice_date,old.due_date,old.purchase_order,old.afe_number,old.project,old.location,old.job_description,old.billed_to_name,old.billed_to_address,old.billed_to_email,old.seller_name,old.seller_address,old.seller_phone,old.seller_email,old.currency_code,old.tax_rate,old.subtotal,old.notes,old.terms) then
   new.approval_status:='draft';new.approved_by:=null;new.approved_at:=null;new.approval_note:=null;
  end if;
  if new.approval_status is distinct from old.approval_status then
   if new.approval_status in ('draft','submitted') then new.approved_by:=null;new.approved_at:=null;end if;
   if new.approval_status='submitted' then new.submitted_for_approval_at:=now();end if;
   if new.approval_status in ('approved','returned') then
    if old.approval_status<>'submitted' then raise exception 'Submit the invoice for approval before reviewing it';end if;
    if new.approval_status='returned' and nullif(trim(new.approval_note),'') is null then raise exception 'Explain why the invoice is being returned';end if;
    new.approved_by:=auth.uid();new.approved_at:=now();
   end if;
  end if;
 else
  new.approved_by:=null;new.approved_at:=null;new.submitted_for_approval_at:=null;
  if new.status<>'draft' or new.approval_status<>'draft' then raise exception 'New invoices must start as drafts';end if;
 end if;
 if new.status not in ('draft','void') and new.approval_status<>'approved' then raise exception 'An approved invoice is required before issuing it';end if;
 return new;
end;
$function$;
create trigger invoices_approval_guard before insert or update on public.invoices for each row execute function private.guard_invoice_approval();
-- A line edit of equal value still changes what was approved. Lock its invoice and invalidate the review.
create or replace function private.invalidate_invoice_line_approval() returns trigger language plpgsql security invoker set search_path='' as $function$
declare invoice_uuid uuid; i public.invoices;
begin
 if tg_op='UPDATE' and row(new.invoice_id,new.organization_id) is distinct from row(old.invoice_id,old.organization_id) then raise exception 'Invoice lines cannot be moved between invoices';end if;
 invoice_uuid:=case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;
 select * into i from public.invoices where id=invoice_uuid for update;
 if i.status<>'draft' then raise exception 'Issued invoice lines cannot be changed. Use a credit or void the invoice.';end if;
 if i.approval_status<>'draft' then update public.invoices set approval_status='draft',approved_by=null,approved_at=null where id=i.id;end if;
 return case when tg_op='DELETE' then old else new end;
end;
$function$;
create trigger invoice_lines_approval_guard before insert or update or delete on public.invoice_line_items for each row execute function private.invalidate_invoice_line_approval();
