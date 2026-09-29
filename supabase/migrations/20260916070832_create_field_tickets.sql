create table if not exists public.field_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  customer_id uuid not null references public.customers(id),
  primary_employee_id uuid references public.employees(id) on delete set null,
  vehicle_id uuid references public.fleet_vehicles(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  ticket_number text not null default '',
  ticket_type text not null default 'field' check (ticket_type in ('field','hydrovac','vacuum','water','disposal','other')),
  work_date date not null default current_date,
  site_name text,
  site_address text,
  purchase_order text,
  afe_number text,
  start_time time,
  end_time time,
  travel_hours numeric(6,2) not null default 0 check (travel_hours between 0 and 24),
  work_hours numeric(6,2) not null default 0 check (work_hours between 0 and 24),
  standby_hours numeric(6,2) not null default 0 check (standby_hours between 0 and 24),
  quantity numeric(12,3),
  quantity_unit text,
  disposal_location text,
  disposal_manifest text,
  work_description text,
  operator_notes text,
  customer_signed_by text,
  customer_signature_data text,
  customer_signed_at timestamptz,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_ticket_total_hours_reasonable check ((travel_hours + work_hours + standby_hours) <= 24),
  constraint field_tickets_org_number_unique unique (organization_id,ticket_number)
);

create table if not exists public.field_ticket_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.field_tickets(id) on delete cascade,
  price_item_id uuid references public.price_sheet_items(id) on delete set null,
  category text not null default 'other',
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity >= 0),
  unit text not null default 'hour',
  rate_snapshot numeric(12,2),
  sort_order integer not null default 0,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists field_tickets_org_date_idx on public.field_tickets(organization_id,work_date desc);
create index if not exists field_tickets_job_idx on public.field_tickets(job_id) where job_id is not null;
create index if not exists field_tickets_customer_idx on public.field_tickets(customer_id,work_date desc);
create index if not exists field_tickets_employee_idx on public.field_tickets(primary_employee_id,work_date desc) where primary_employee_id is not null;
create index if not exists field_tickets_status_idx on public.field_tickets(organization_id,status,work_date desc);
create index if not exists field_ticket_items_ticket_idx on public.field_ticket_items(ticket_id,sort_order);

create or replace function private.prepare_field_ticket()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if coalesce(trim(new.ticket_number),'')='' then
    new.ticket_number := 'TKT-' || to_char(coalesce(new.work_date,current_date),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  end if;
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.organization_id=new.organization_id) then
    raise exception 'Customer does not belong to this organization.';
  end if;
  if new.job_id is not null and not exists(select 1 from public.jobs j where j.id=new.job_id and j.organization_id=new.organization_id and j.customer_id=new.customer_id) then
    raise exception 'Job does not belong to this customer and organization.';
  end if;
  if new.primary_employee_id is not null and not exists(select 1 from public.employees e where e.id=new.primary_employee_id and e.organization_id=new.organization_id) then
    raise exception 'Employee does not belong to this organization.';
  end if;
  if new.vehicle_id is not null and not exists(select 1 from public.fleet_vehicles v where v.id=new.vehicle_id and v.organization_id=new.organization_id) then
    raise exception 'Unit does not belong to this organization.';
  end if;
  if new.invoice_id is not null and not exists(select 1 from public.invoices i where i.id=new.invoice_id and i.organization_id=new.organization_id and i.customer_id=new.customer_id) then
    raise exception 'Invoice does not belong to this customer and organization.';
  end if;
  return new;
end;
$function$;

create or replace function private.prepare_field_ticket_item()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not exists(select 1 from public.field_tickets t where t.id=new.ticket_id and t.organization_id=new.organization_id) then
    raise exception 'Ticket does not belong to this organization.';
  end if;
  if new.price_item_id is not null and not exists(select 1 from public.price_sheet_items p where p.id=new.price_item_id and p.organization_id=new.organization_id) then
    raise exception 'Price item does not belong to this organization.';
  end if;
  return new;
end;
$function$;

create or replace function private.can_view_field_ticket(_organization_id uuid,_ticket_id uuid)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select private.has_org_permission(_organization_id,'tickets.view')
    or (
      private.has_org_permission(_organization_id,'tickets.assigned.view')
      and exists(
        select 1 from public.field_tickets t
        where t.id=_ticket_id and t.organization_id=_organization_id
          and (
            t.created_by=(select auth.uid())
            or (t.job_id is not null and private.is_user_assigned_to_job(t.job_id,_organization_id))
            or exists(select 1 from public.employees e where e.id=t.primary_employee_id and e.organization_id=_organization_id and e.user_id=(select auth.uid()))
          )
      )
    );
$function$;

create or replace function private.can_edit_field_ticket(_organization_id uuid,_ticket_id uuid)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select private.has_org_permission(_organization_id,'tickets.manage')
    or (
      private.has_org_permission(_organization_id,'tickets.submit')
      and exists(
        select 1 from public.field_tickets t
        where t.id=_ticket_id and t.organization_id=_organization_id
          and t.status in ('draft','rejected')
          and (
            t.created_by=(select auth.uid())
            or (t.job_id is not null and private.is_user_assigned_to_job(t.job_id,_organization_id))
            or exists(select 1 from public.employees e where e.id=t.primary_employee_id and e.organization_id=_organization_id and e.user_id=(select auth.uid()))
          )
      )
    );
$function$;

create trigger field_tickets_prepare before insert or update of organization_id,job_id,customer_id,primary_employee_id,vehicle_id,invoice_id,ticket_number,work_date on public.field_tickets for each row execute function private.prepare_field_ticket();
create trigger field_tickets_updated before update on public.field_tickets for each row execute function private.set_updated_at();
create trigger field_ticket_items_prepare before insert or update of organization_id,ticket_id,price_item_id on public.field_ticket_items for each row execute function private.prepare_field_ticket_item();
create trigger field_ticket_items_updated before update on public.field_ticket_items for each row execute function private.set_updated_at();

alter table public.field_tickets enable row level security;
alter table public.field_ticket_items enable row level security;

create policy field_tickets_select on public.field_tickets for select to authenticated using (private.can_view_field_ticket(organization_id,id));
create policy field_tickets_insert on public.field_tickets for insert to authenticated with check (
  created_by=(select auth.uid()) and (
    private.has_org_permission(organization_id,'tickets.manage')
    or (
      private.has_org_permission(organization_id,'tickets.submit')
      and (
        (job_id is not null and private.is_user_assigned_to_job(job_id,organization_id))
        or exists(select 1 from public.employees e where e.id=primary_employee_id and e.organization_id=field_tickets.organization_id and e.user_id=(select auth.uid()))
      )
      and status in ('draft','submitted')
    )
  )
);
create policy field_tickets_update on public.field_tickets for update to authenticated using (private.can_edit_field_ticket(organization_id,id)) with check (
  private.has_org_permission(organization_id,'tickets.manage')
  or (private.has_org_permission(organization_id,'tickets.submit') and status in ('draft','submitted'))
);
create policy field_tickets_delete on public.field_tickets for delete to authenticated using (private.can_edit_field_ticket(organization_id,id));

create policy field_ticket_items_select on public.field_ticket_items for select to authenticated using (private.can_view_field_ticket(organization_id,ticket_id));
create policy field_ticket_items_insert on public.field_ticket_items for insert to authenticated with check (created_by=(select auth.uid()) and private.can_edit_field_ticket(organization_id,ticket_id));
create policy field_ticket_items_update on public.field_ticket_items for update to authenticated using (private.can_edit_field_ticket(organization_id,ticket_id)) with check (private.can_edit_field_ticket(organization_id,ticket_id));
create policy field_ticket_items_delete on public.field_ticket_items for delete to authenticated using (private.can_edit_field_ticket(organization_id,ticket_id));
