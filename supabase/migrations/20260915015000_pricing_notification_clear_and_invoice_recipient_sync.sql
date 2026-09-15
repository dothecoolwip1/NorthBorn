create table if not exists public.price_sheet_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'other' check (category in ('equipment','labour','material','disposal','overtime','transport','other')),
  unit text not null default 'hour',
  default_rate numeric(12,2) not null default 0 check (default_rate >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.customer_price_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  price_item_id uuid not null references public.price_sheet_items(id) on delete cascade,
  rate numeric(12,2) not null check (rate >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, price_item_id)
);

create index if not exists price_sheet_items_org_active_idx on public.price_sheet_items(organization_id,is_active,sort_order,name);
create index if not exists customer_price_overrides_customer_idx on public.customer_price_overrides(organization_id,customer_id,price_item_id);

alter table public.price_sheet_items enable row level security;
alter table public.customer_price_overrides enable row level security;

drop policy if exists price_sheet_items_select on public.price_sheet_items;
create policy price_sheet_items_select on public.price_sheet_items for select to authenticated using (private.has_org_permission(organization_id,'invoices.view'));
drop policy if exists price_sheet_items_insert on public.price_sheet_items;
create policy price_sheet_items_insert on public.price_sheet_items for insert to authenticated with check (private.has_org_permission(organization_id,'invoices.manage') and created_by=auth.uid());
drop policy if exists price_sheet_items_update on public.price_sheet_items;
create policy price_sheet_items_update on public.price_sheet_items for update to authenticated using (private.has_org_permission(organization_id,'invoices.manage')) with check (private.has_org_permission(organization_id,'invoices.manage'));
drop policy if exists price_sheet_items_delete on public.price_sheet_items;
create policy price_sheet_items_delete on public.price_sheet_items for delete to authenticated using (private.has_org_permission(organization_id,'invoices.manage'));

drop policy if exists customer_price_overrides_select on public.customer_price_overrides;
create policy customer_price_overrides_select on public.customer_price_overrides for select to authenticated using (private.has_org_permission(organization_id,'invoices.view'));
drop policy if exists customer_price_overrides_insert on public.customer_price_overrides;
create policy customer_price_overrides_insert on public.customer_price_overrides for insert to authenticated with check (private.has_org_permission(organization_id,'invoices.manage') and created_by=auth.uid());
drop policy if exists customer_price_overrides_update on public.customer_price_overrides;
create policy customer_price_overrides_update on public.customer_price_overrides for update to authenticated using (private.has_org_permission(organization_id,'invoices.manage')) with check (private.has_org_permission(organization_id,'invoices.manage'));
drop policy if exists customer_price_overrides_delete on public.customer_price_overrides;
create policy customer_price_overrides_delete on public.customer_price_overrides for delete to authenticated using (private.has_org_permission(organization_id,'invoices.manage'));

drop trigger if exists price_sheet_items_updated_at on public.price_sheet_items;
create trigger price_sheet_items_updated_at before update on public.price_sheet_items for each row execute function private.set_updated_at();
drop trigger if exists price_sheet_items_audit on public.price_sheet_items;
create trigger price_sheet_items_audit after insert or update or delete on public.price_sheet_items for each row execute function private.write_audit_log();
drop trigger if exists customer_price_overrides_updated_at on public.customer_price_overrides;
create trigger customer_price_overrides_updated_at before update on public.customer_price_overrides for each row execute function private.set_updated_at();
drop trigger if exists customer_price_overrides_audit on public.customer_price_overrides;
create trigger customer_price_overrides_audit after insert or update or delete on public.customer_price_overrides for each row execute function private.write_audit_log();

create or replace function public.get_effective_price_sheet(_organization_id uuid,_customer_id uuid default null)
returns table(price_item_id uuid,name text,category text,unit text,default_rate numeric,customer_rate numeric,effective_rate numeric,is_active boolean,sort_order integer)
language plpgsql stable security definer set search_path=''
as $function$
begin
  if not private.has_org_permission(_organization_id,'invoices.view') then raise exception 'You do not have permission to view pricing'; end if;
  if _customer_id is not null and not exists(select 1 from public.customers c where c.id=_customer_id and c.organization_id=_organization_id) then raise exception 'Client not found'; end if;
  return query
  select p.id,p.name,p.category,p.unit,p.default_rate,o.rate,coalesce(o.rate,p.default_rate),p.is_active,p.sort_order
  from public.price_sheet_items p
  left join public.customer_price_overrides o on o.organization_id=p.organization_id and o.customer_id=_customer_id and o.price_item_id=p.id
  where p.organization_id=_organization_id
  order by p.sort_order,p.name;
end;
$function$;

grant execute on function public.get_effective_price_sheet(uuid,uuid) to authenticated;

create or replace function public.get_my_assigned_job_price_sheet(_organization_id uuid,_job_id uuid)
returns table(price_item_id uuid,name text,category text,unit text,effective_rate numeric,sort_order integer)
language plpgsql stable security definer set search_path=''
as $function$
declare _customer_id uuid;
begin
  select j.customer_id into _customer_id
  from public.jobs j
  where j.id=_job_id and j.organization_id=_organization_id
    and exists(
      select 1 from public.dispatch_assignments da
      join public.employees e on e.id=da.employee_id and e.organization_id=da.organization_id
      where da.organization_id=_organization_id and da.job_id=j.id and e.user_id=auth.uid()
    );
  if _customer_id is null then raise exception 'This job is not assigned to you'; end if;
  return query
  select p.id,p.name,p.category,p.unit,coalesce(o.rate,p.default_rate),p.sort_order
  from public.price_sheet_items p
  left join public.customer_price_overrides o on o.organization_id=p.organization_id and o.customer_id=_customer_id and o.price_item_id=p.id
  where p.organization_id=_organization_id and p.is_active=true
  order by p.sort_order,p.name;
end;
$function$;

grant execute on function public.get_my_assigned_job_price_sheet(uuid,uuid) to authenticated;

create or replace function public.clear_my_notifications()
returns integer
language plpgsql security definer set search_path=''
as $function$
declare _count integer;
begin
  delete from public.user_notifications where recipient_user_id=auth.uid();
  get diagnostics _count = row_count;
  return _count;
end;
$function$;
grant execute on function public.clear_my_notifications() to authenticated;

create or replace function private.sync_customer_billing_email_to_draft_invoices()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if old.billing_email is distinct from new.billing_email then
    update public.invoices
    set billed_to_email=new.billing_email
    where organization_id=new.organization_id and customer_id=new.id and status='draft';
  end if;
  return new;
end;
$function$;

drop trigger if exists customers_sync_invoice_email on public.customers;
create trigger customers_sync_invoice_email after update of billing_email on public.customers for each row execute function private.sync_customer_billing_email_to_draft_invoices();

create or replace function public.get_invoice_delivery_payload(_organization_id uuid,_invoice_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare _invoice jsonb; _lines jsonb;
begin
  if not private.has_org_permission(_organization_id,'invoices.manage') then raise exception 'You do not have permission to send invoices'; end if;
  select to_jsonb(x) into _invoice from (
    select i.id as invoice_id,i.organization_id,i.customer_id,i.invoice_number,i.invoice_date,i.due_date,i.status,i.purchase_order,i.afe_number,i.project,i.location,i.area,i.job_description,
      i.billed_to_name,i.billed_to_address,coalesce(nullif(trim(c.billing_email),''),i.billed_to_email) as billed_to_email,
      i.seller_name,i.seller_address,i.seller_phone,i.seller_email,i.gst_number,i.permit_number,i.wcb_number,
      i.currency_code,i.tax_rate,i.subtotal,i.tax_total,i.total,i.amount_paid,i.balance_due,i.notes,i.terms,c.name as customer_name
    from public.invoices i
    join public.customers c on c.id=i.customer_id and c.organization_id=i.organization_id
    where i.id=_invoice_id and i.organization_id=_organization_id
  ) x;
  if _invoice is null then raise exception 'Invoice not found'; end if;
  if nullif(trim(coalesce(_invoice->>'billed_to_email','')),'') is null then raise exception 'This client has no billing email'; end if;
  select coalesce(jsonb_agg(to_jsonb(li) order by li.sort_order,li.created_at,li.id),'[]'::jsonb) into _lines
  from (select l.id,l.category,l.description,l.quantity,l.unit,l.rate,l.amount,l.sort_order,l.created_at from public.invoice_line_items l where l.invoice_id=_invoice_id and l.organization_id=_organization_id) li;
  return jsonb_build_object('invoice',_invoice,'line_items',_lines);
end;
$function$;
