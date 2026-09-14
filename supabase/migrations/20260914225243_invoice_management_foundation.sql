create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  invoice_number text not null,
  status text not null default 'draft' check (status in ('draft','issued','partially_paid','paid','overdue','void')),
  invoice_date date not null default current_date,
  due_date date,
  purchase_order text,
  afe_number text,
  project text,
  location text,
  area text,
  job_description text,
  authorization_date date,
  authorized_by_name text,
  authorization_contact text,
  authorization_email text,
  billed_to_name text,
  billed_to_address text,
  billed_to_email text,
  seller_name text,
  seller_address text,
  seller_phone text,
  seller_email text,
  gst_number text,
  permit_number text,
  wcb_number text,
  currency_code text not null default 'CAD' check (char_length(currency_code)=3),
  tax_rate numeric(7,4) not null default 5.0000 check (tax_rate >= 0 and tax_rate <= 100),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  tax_total numeric(12,2) not null default 0 check (tax_total >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  balance_due numeric(12,2) generated always as (greatest(total - amount_paid, 0::numeric)) stored,
  notes text,
  terms text,
  issued_at timestamptz,
  paid_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number),
  unique (id, organization_id)
);

create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null,
  category text not null default 'other' check (category in ('equipment','labour','material','disposal','overtime','transport','other')),
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity >= 0),
  unit text not null default 'hour',
  rate numeric(12,2) not null default 0 check (rate >= 0),
  amount numeric(12,2) generated always as (round(quantity * rate, 2)) stored,
  sort_order integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_line_items_invoice_org_fk foreign key (invoice_id, organization_id) references public.invoices(id, organization_id) on delete cascade
);

create table if not exists public.invoice_number_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_year integer not null,
  next_number bigint not null default 1 check (next_number > 0),
  primary key (organization_id, invoice_year)
);

create index if not exists invoices_org_status_idx on public.invoices(organization_id,status,invoice_date desc);
create index if not exists invoices_customer_date_idx on public.invoices(customer_id,invoice_date desc);
create index if not exists invoices_job_idx on public.invoices(job_id) where job_id is not null;
create index if not exists invoice_line_items_invoice_idx on public.invoice_line_items(invoice_id,sort_order,id);
create index if not exists invoice_line_items_org_idx on public.invoice_line_items(organization_id);

create or replace function private.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  _year integer;
  _number bigint;
begin
  if nullif(trim(new.invoice_number),'') is not null then
    new.invoice_number := trim(new.invoice_number);
    return new;
  end if;
  _year := extract(year from coalesce(new.invoice_date,current_date))::integer;
  insert into public.invoice_number_counters(organization_id,invoice_year,next_number)
  values(new.organization_id,_year,2)
  on conflict(organization_id,invoice_year) do update
    set next_number=public.invoice_number_counters.next_number+1
  returning next_number-1 into _number;
  new.invoice_number := 'INV-' || _year::text || '-' || lpad(_number::text,4,'0');
  return new;
end;
$function$;

create or replace function private.validate_invoice_relationships()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id) then
    raise exception 'Invoice customer must belong to the same organization';
  end if;
  if new.job_id is not null and not exists(
    select 1 from public.jobs j
    where j.id=new.job_id and j.organization_id=new.organization_id and j.customer_id=new.customer_id
  ) then
    raise exception 'Invoice job must belong to the selected customer and organization';
  end if;
  return new;
end;
$function$;

create or replace function private.calculate_invoice_totals_row()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  new.tax_total := round(new.subtotal * new.tax_rate / 100,2);
  new.total := new.subtotal + new.tax_total;
  if new.status='paid' and new.amount_paid < new.total then
    new.amount_paid := new.total;
  end if;
  if new.amount_paid >= new.total and new.total > 0 and new.status in ('issued','partially_paid','overdue') then
    new.status := 'paid';
    new.paid_at := coalesce(new.paid_at,now());
  elsif new.amount_paid > 0 and new.amount_paid < new.total and new.status in ('issued','overdue','paid') then
    new.status := 'partially_paid';
    new.paid_at := null;
  elsif new.amount_paid = 0 and new.status='partially_paid' then
    new.status := 'issued';
    new.paid_at := null;
  end if;
  if new.status='issued' and new.issued_at is null then new.issued_at := now(); end if;
  if new.status='paid' and new.paid_at is null then new.paid_at := now(); end if;
  return new;
end;
$function$;

create or replace function private.refresh_invoice_subtotal()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  _invoice_id uuid;
begin
  _invoice_id := coalesce(new.invoice_id,old.invoice_id);
  update public.invoices i
  set subtotal=coalesce((select sum(li.amount) from public.invoice_line_items li where li.invoice_id=_invoice_id),0),
      updated_at=now()
  where i.id=_invoice_id;
  return coalesce(new,old);
end;
$function$;

create trigger invoices_assign_number before insert on public.invoices for each row execute function private.assign_invoice_number();
create trigger invoices_validate_relationships before insert or update of organization_id,customer_id,job_id on public.invoices for each row execute function private.validate_invoice_relationships();
create trigger invoices_calculate_totals before insert or update of subtotal,tax_rate,amount_paid,status on public.invoices for each row execute function private.calculate_invoice_totals_row();
create trigger invoices_updated_at before update on public.invoices for each row execute function private.set_updated_at();
create trigger invoice_line_items_updated_at before update on public.invoice_line_items for each row execute function private.set_updated_at();
create trigger invoice_line_items_refresh_totals after insert or update or delete on public.invoice_line_items for each row execute function private.refresh_invoice_subtotal();
create trigger invoices_audit after insert or update or delete on public.invoices for each row execute function private.write_audit_log();
create trigger invoice_line_items_audit after insert or update or delete on public.invoice_line_items for each row execute function private.write_audit_log();

alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.invoice_number_counters enable row level security;

revoke all on public.invoices from anon, authenticated;
revoke all on public.invoice_line_items from anon, authenticated;
revoke all on public.invoice_number_counters from anon, authenticated;
grant select,insert,update,delete on public.invoices to authenticated;
grant select,insert,update,delete on public.invoice_line_items to authenticated;
grant all on public.invoices,public.invoice_line_items,public.invoice_number_counters to service_role;

create policy invoices_select on public.invoices for select to authenticated using (private.has_org_permission(organization_id,'invoices.view'));
create policy invoices_insert on public.invoices for insert to authenticated with check (private.has_org_permission(organization_id,'invoices.manage') and created_by=(select auth.uid()));
create policy invoices_update on public.invoices for update to authenticated using (private.has_org_permission(organization_id,'invoices.manage')) with check (private.has_org_permission(organization_id,'invoices.manage'));
create policy invoices_delete on public.invoices for delete to authenticated using (private.has_org_permission(organization_id,'invoices.manage'));
create policy invoice_line_items_select on public.invoice_line_items for select to authenticated using (private.has_org_permission(organization_id,'invoices.view'));
create policy invoice_line_items_insert on public.invoice_line_items for insert to authenticated with check (private.has_org_permission(organization_id,'invoices.manage') and created_by=(select auth.uid()));
create policy invoice_line_items_update on public.invoice_line_items for update to authenticated using (private.has_org_permission(organization_id,'invoices.manage')) with check (private.has_org_permission(organization_id,'invoices.manage'));
create policy invoice_line_items_delete on public.invoice_line_items for delete to authenticated using (private.has_org_permission(organization_id,'invoices.manage'));

create or replace function public.get_my_customer_invoices(_customer_id uuid)
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
  currency_code text
)
language sql
stable
security definer
set search_path=''
as $function$
  select i.id,i.invoice_number,i.invoice_date,i.due_date,i.status,i.job_id,j.job_number,j.title,i.subtotal,i.tax_total,i.total,i.amount_paid,i.balance_due,i.currency_code
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

create or replace function public.get_my_customer_invoice_line_items(_customer_id uuid,_invoice_id uuid)
returns table(
  line_item_id uuid,
  category text,
  description text,
  quantity numeric,
  unit text,
  rate numeric,
  amount numeric,
  sort_order integer
)
language sql
stable
security definer
set search_path=''
as $function$
  select li.id,li.category,li.description,li.quantity,li.unit,li.rate,li.amount,li.sort_order
  from public.invoice_line_items li
  join public.invoices i on i.id=li.invoice_id and i.organization_id=li.organization_id
  where i.id=_invoice_id
    and i.customer_id=_customer_id
    and i.status in ('issued','partially_paid','paid','overdue')
    and exists(
      select 1 from public.customer_portal_users cpu
      where cpu.user_id=auth.uid() and cpu.customer_id=i.customer_id and cpu.organization_id=i.organization_id and cpu.status='active'
    )
  order by li.sort_order,li.created_at,li.id;
$function$;

revoke all on function public.get_my_customer_invoices(uuid) from public;
revoke all on function public.get_my_customer_invoice_line_items(uuid,uuid) from public;
grant execute on function public.get_my_customer_invoices(uuid) to authenticated;
grant execute on function public.get_my_customer_invoice_line_items(uuid,uuid) to authenticated;
