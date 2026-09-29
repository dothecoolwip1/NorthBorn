-- GitHub-only: validates on PostgreSQL 17+. Existing paid amounts become opening entries.
alter table public.invoices add column credit_total numeric(12,2) not null default 0 check(credit_total>=0);
alter table public.invoices alter column balance_due set expression as (greatest(total-amount_paid-credit_total,0::numeric));
create table public.invoice_settlements(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 invoice_id uuid not null,
 kind text not null check(kind in ('payment','credit','payment_reversal','credit_reversal')),
 amount numeric(12,2) not null check(amount>0 and amount<>'NaN'::numeric),
 effective_date date not null default current_date,
 reference text,
 note text not null check(length(trim(note))>0),
 reverses_id uuid unique references public.invoice_settlements(id),
 request_id uuid not null,
 is_opening_balance boolean not null default false,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(organization_id,request_id),
 foreign key(invoice_id,organization_id) references public.invoices(id,organization_id) on delete restrict,
 check((kind in ('payment_reversal','credit_reversal'))=(reverses_id is not null))
);
create index invoice_settlements_invoice_idx on public.invoice_settlements(organization_id,invoice_id,created_at);
insert into public.invoice_settlements(organization_id,invoice_id,kind,amount,effective_date,note,request_id,is_opening_balance,created_by)
select organization_id,id,'payment',amount_paid,current_date,'Opening balance imported from existing invoice; original receipt date unavailable',gen_random_uuid(),true,created_by
from public.invoices where amount_paid>0;
alter table public.invoice_settlements enable row level security;
revoke all on public.invoice_settlements from public,anon,authenticated;
grant select,insert on public.invoice_settlements to authenticated;
grant all on public.invoice_settlements to service_role;
create policy settlements_select on public.invoice_settlements for select to authenticated using(private.has_org_permission(organization_id,'invoices.view'));
create policy settlements_insert on public.invoice_settlements for insert to authenticated with check(private.has_org_permission(organization_id,'invoices.manage') and created_by=auth.uid() and not is_opening_balance);

-- Settlements never fabricate cash: paid status reflects payment plus credit.
create or replace function private.calculate_invoice_totals_row() returns trigger language plpgsql set search_path='' as $function$
begin
 new.tax_total:=round(new.subtotal*new.tax_rate/100,2);new.total:=new.subtotal+new.tax_total;
 if new.status not in ('draft','void') then
  if new.amount_paid+new.credit_total>=new.total and new.total>0 then new.status:='paid';new.paid_at:=coalesce(new.paid_at,now());
  elsif new.amount_paid+new.credit_total>0 then new.status:='partially_paid';new.paid_at:=null;
  else new.status:=case when new.due_date<current_date then 'overdue' else 'issued' end;new.paid_at:=null;end if;
  new.issued_at:=coalesce(new.issued_at,now());
 end if;
 return new;
end;
$function$;
drop trigger invoices_calculate_totals on public.invoices;
create trigger invoices_calculate_totals before insert or update of subtotal,tax_rate,amount_paid,credit_total,status,due_date on public.invoices for each row execute function private.calculate_invoice_totals_row();

create or replace function private.apply_invoice_settlement() returns trigger language plpgsql security invoker set search_path='' as $function$
declare i public.invoices; original public.invoice_settlements; delta numeric;
begin
 select * into i from public.invoices where id=new.invoice_id and organization_id=new.organization_id for update;
 if not found then raise exception 'Invoice not accessible';end if;
 if i.status in ('draft','void') then raise exception 'Payments and credits require an issued invoice';end if;
 if new.effective_date>current_date then raise exception 'Settlement date cannot be in the future';end if;
 if new.reverses_id is not null then
  select * into original from public.invoice_settlements where id=new.reverses_id and invoice_id=new.invoice_id and organization_id=new.organization_id;
  if not found or original.kind not in ('payment','credit') or new.kind<>original.kind||'_reversal' or new.amount<>original.amount then raise exception 'Reversal must exactly match an original payment or credit';end if;
  delta:=-new.amount;
 else
  if new.amount>i.balance_due then raise exception 'Amount exceeds the outstanding balance';end if;
  delta:=new.amount;
 end if;
 if new.kind in ('payment','payment_reversal') then
  update public.invoices set amount_paid=amount_paid+delta where id=i.id;
 else
  update public.invoices set credit_total=credit_total+delta where id=i.id;
 end if;
 return new;
end;
$function$;
create trigger settlements_apply after insert on public.invoice_settlements for each row execute function private.apply_invoice_settlement();

-- Validate final transaction state; atomic invoice line replacement may have intermediate totals.
create or replace function private.check_invoice_settlement_totals() returns trigger language plpgsql security invoker set search_path='' as $function$
declare i public.invoices; paid numeric; credits numeric;
begin
 select * into i from public.invoices where id=new.id;
 if not found then return new;end if;
 select coalesce(sum(case when kind='payment' then amount when kind='payment_reversal' then -amount else 0 end),0),
 coalesce(sum(case when kind='credit' then amount when kind='credit_reversal' then -amount else 0 end),0)
 into paid,credits from public.invoice_settlements where invoice_id=i.id and organization_id=i.organization_id;
 if i.amount_paid<>paid or i.credit_total<>credits then raise exception 'Record payments and credits through invoice settlement history';end if;
 if paid+credits>i.total then raise exception 'Invoice total cannot be below applied payments and credits';end if;
 if i.status in ('draft','void') and paid+credits>0 then raise exception 'Reverse payments and credits before returning to draft or voiding an invoice';end if;
 return new;
end;
$function$;
create constraint trigger invoices_check_settlements after insert or update on public.invoices deferrable initially deferred for each row execute function private.check_invoice_settlement_totals();
revoke all on function private.check_invoice_settlement_totals() from public,anon,authenticated;

create or replace function public.record_invoice_settlement(_organization_id uuid,_invoice_id uuid,_kind text,_amount numeric,_date date,_reference text,_note text,_request_id uuid,_reverses_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $function$
declare existing public.invoice_settlements; i public.invoices; result public.invoice_settlements;
begin
 if auth.uid() is null or not private.has_org_permission(_organization_id,'invoices.manage') then raise exception 'Invoice management permission required';end if;
 if _amount is null or _amount<>round(_amount,2) then raise exception 'Amount must have at most two decimal places';end if;
 select * into i from public.invoices where id=_invoice_id and organization_id=_organization_id for update;
 if not found then raise exception 'Invoice not found';end if;
 select * into existing from public.invoice_settlements where organization_id=_organization_id and request_id=_request_id;
 if found then
  if existing.invoice_id<>_invoice_id or existing.kind<>_kind or existing.amount<>_amount or existing.reverses_id is distinct from _reverses_id then raise exception 'Request ID already used for a different settlement';end if;
  return to_jsonb(existing);
 end if;
 insert into public.invoice_settlements(organization_id,invoice_id,kind,amount,effective_date,reference,note,request_id,reverses_id,created_by)
 values(_organization_id,_invoice_id,_kind,_amount,coalesce(_date,current_date),nullif(trim(_reference),''),_note,_request_id,_reverses_id,auth.uid()) returning * into result;
 return to_jsonb(result);
end;
$function$;
revoke all on function public.record_invoice_settlement(uuid,uuid,text,numeric,date,text,text,uuid,uuid) from public,anon;
grant execute on function public.record_invoice_settlement(uuid,uuid,text,numeric,date,text,text,uuid,uuid) to authenticated;

create or replace function private.stamp_invoice_settlement() returns trigger language plpgsql set search_path='' as $function$
begin new.created_at:=now();return new;end;
$function$;
create trigger settlements_stamp before insert on public.invoice_settlements for each row execute function private.stamp_invoice_settlement();
