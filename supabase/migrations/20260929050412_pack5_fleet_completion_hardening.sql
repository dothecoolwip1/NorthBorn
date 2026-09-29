alter table public.fleet_vehicles
  add column if not exists defect_hold boolean not null default false,
  add column if not exists primary_photo_path text;

create table if not exists public.fleet_work_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.fleet_work_orders(id) on delete cascade,
  item_type text not null check (item_type in ('labour','part','external')),
  description text not null check (char_length(btrim(description)) between 1 and 240),
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_cost_cents bigint not null default 0 check (unit_cost_cents >= 0),
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fleet_work_order_items_order_idx
  on public.fleet_work_order_items(organization_id,work_order_id,created_at);

create or replace function private.validate_fleet_work_order_item_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.fleet_work_orders w
    where w.id=new.work_order_id
      and w.organization_id=new.organization_id
  ) then
    raise exception 'Work order item must belong to the same organization';
  end if;
  new.amount_cents := round(new.quantity * new.unit_cost_cents)::bigint;
  return new;
end;
$$;

revoke all on function private.validate_fleet_work_order_item_scope() from public,anon,authenticated,service_role;

drop trigger if exists validate_fleet_work_order_item_scope on public.fleet_work_order_items;
create trigger validate_fleet_work_order_item_scope
before insert or update on public.fleet_work_order_items
for each row execute function private.validate_fleet_work_order_item_scope();

create or replace function private.sync_fleet_work_order_item_totals()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  _work_order_id uuid;
  _organization_id uuid;
  _labour bigint;
  _parts bigint;
  _external bigint;
begin
  _work_order_id := coalesce(new.work_order_id,old.work_order_id);
  _organization_id := coalesce(new.organization_id,old.organization_id);

  select
    coalesce(sum(amount_cents) filter(where item_type='labour'),0),
    coalesce(sum(amount_cents) filter(where item_type='part'),0),
    coalesce(sum(amount_cents) filter(where item_type='external'),0)
  into _labour,_parts,_external
  from public.fleet_work_order_items
  where organization_id=_organization_id and work_order_id=_work_order_id;

  update public.fleet_work_orders
     set labour_cost_cents=_labour,
         parts_cost_cents=_parts,
         external_cost_cents=_external
   where organization_id=_organization_id and id=_work_order_id;

  update public.fleet_service_records
     set labour_cost_cents=_labour,
         parts_cost_cents=_parts,
         external_cost_cents=_external,
         cost_cents=_labour+_parts+_external
   where organization_id=_organization_id and work_order_id=_work_order_id;

  return coalesce(new,old);
end;
$$;

revoke all on function private.sync_fleet_work_order_item_totals() from public,anon,authenticated,service_role;

drop trigger if exists sync_fleet_work_order_item_totals on public.fleet_work_order_items;
create trigger sync_fleet_work_order_item_totals
after insert or update or delete on public.fleet_work_order_items
for each row execute function private.sync_fleet_work_order_item_totals();

alter table public.fleet_work_order_items enable row level security;

drop policy if exists "fleet_work_order_items_select" on public.fleet_work_order_items;
create policy "fleet_work_order_items_select"
on public.fleet_work_order_items for select to authenticated
using (private.has_org_permission(organization_id,'fleet.view'));

drop policy if exists "fleet_work_order_items_insert" on public.fleet_work_order_items;
create policy "fleet_work_order_items_insert"
on public.fleet_work_order_items for insert to authenticated
with check (
  private.has_org_permission(organization_id,'fleet.edit')
  and created_by=(select auth.uid())
);

drop policy if exists "fleet_work_order_items_update" on public.fleet_work_order_items;
create policy "fleet_work_order_items_update"
on public.fleet_work_order_items for update to authenticated
using (private.has_org_permission(organization_id,'fleet.edit'))
with check (private.has_org_permission(organization_id,'fleet.edit'));

drop policy if exists "fleet_work_order_items_delete" on public.fleet_work_order_items;
create policy "fleet_work_order_items_delete"
on public.fleet_work_order_items for delete to authenticated
using (private.has_org_permission(organization_id,'fleet.edit'));

grant select,insert,update,delete on public.fleet_work_order_items to authenticated;

insert into public.fleet_work_order_items(
  organization_id,work_order_id,item_type,description,quantity,unit_cost_cents,amount_cents,created_by
)
select organization_id,id,'labour','Legacy labour total',1,labour_cost_cents,labour_cost_cents,created_by
from public.fleet_work_orders
where labour_cost_cents>0
and not exists(select 1 from public.fleet_work_order_items i where i.work_order_id=fleet_work_orders.id and i.item_type='labour');

insert into public.fleet_work_order_items(
  organization_id,work_order_id,item_type,description,quantity,unit_cost_cents,amount_cents,created_by
)
select organization_id,id,'part','Legacy parts total',1,parts_cost_cents,parts_cost_cents,created_by
from public.fleet_work_orders
where parts_cost_cents>0
and not exists(select 1 from public.fleet_work_order_items i where i.work_order_id=fleet_work_orders.id and i.item_type='part');

insert into public.fleet_work_order_items(
  organization_id,work_order_id,item_type,description,quantity,unit_cost_cents,amount_cents,created_by
)
select organization_id,id,'external','Legacy external total',1,external_cost_cents,external_cost_cents,created_by
from public.fleet_work_orders
where external_cost_cents>0
and not exists(select 1 from public.fleet_work_order_items i where i.work_order_id=fleet_work_orders.id and i.item_type='external');

create or replace function private.sync_vehicle_defect_hold()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  _vehicle_id uuid;
  _organization_id uuid;
  _blocked boolean;
  _active_job boolean;
begin
  _vehicle_id := coalesce(new.vehicle_id,old.vehicle_id);
  _organization_id := coalesce(new.organization_id,old.organization_id);

  select exists(
    select 1 from public.fleet_defects d
    where d.organization_id=_organization_id
      and d.vehicle_id=_vehicle_id
      and d.out_of_service=true
      and d.status not in ('resolved','dismissed')
  ) into _blocked;

  if _blocked then
    update public.fleet_vehicles
       set defect_hold=true,
           status=case when status='archived' then status else 'out_of_service' end
     where id=_vehicle_id and organization_id=_organization_id;
  else
    select exists(
      select 1
      from public.dispatch_assignments a
      join public.jobs j on j.id=a.job_id and j.organization_id=a.organization_id
      where a.organization_id=_organization_id
        and a.vehicle_id=_vehicle_id
        and j.status not in ('completed','cancelled')
    ) into _active_job;

    update public.fleet_vehicles
       set defect_hold=false,
           status=case
             when status='archived' then status
             when defect_hold=true and status='out_of_service' then case when _active_job then 'assigned' else 'available' end
             else status
           end
     where id=_vehicle_id and organization_id=_organization_id;
  end if;

  return coalesce(new,old);
end;
$$;

revoke all on function private.sync_vehicle_defect_hold() from public,anon,authenticated,service_role;

drop trigger if exists sync_vehicle_defect_hold on public.fleet_defects;
create trigger sync_vehicle_defect_hold
after insert or update or delete on public.fleet_defects
for each row execute function private.sync_vehicle_defect_hold();

update public.fleet_vehicles v
set defect_hold=exists(
  select 1 from public.fleet_defects d
  where d.organization_id=v.organization_id
    and d.vehicle_id=v.id
    and d.out_of_service=true
    and d.status not in ('resolved','dismissed')
);

update public.fleet_vehicles v
set status='out_of_service'
where v.status<>'archived' and v.defect_hold=true;

create or replace function private.fleet_storage_vehicle_id(_name text)
returns uuid
language plpgsql
immutable
set search_path=''
as $$
begin
  return nullif(split_part(_name,'/',2),'')::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function private.fleet_storage_vehicle_id(text) from public,anon,authenticated,service_role;

drop policy if exists "fleet_documents_select" on public.fleet_documents;
create policy "fleet_documents_select"
on public.fleet_documents for select to authenticated
using (
  private.has_org_permission(organization_id,'fleet.view')
  or (
    document_type='photo'
    and private.has_org_permission(organization_id,'fleet.assigned.view')
    and private.employee_can_access_vehicle(vehicle_id,organization_id)
  )
);

drop policy if exists "fleet_documents_storage_select" on storage.objects;
create policy "fleet_documents_storage_select"
on storage.objects for select to authenticated
using (
  bucket_id='fleet-documents'
  and (
    private.has_org_permission(private.fleet_storage_org_id(name),'fleet.view')
    or (
      private.has_org_permission(private.fleet_storage_org_id(name),'fleet.assigned.view')
      and private.employee_can_access_vehicle(
        private.fleet_storage_vehicle_id(name),
        private.fleet_storage_org_id(name)
      )
    )
  )
);

create or replace function private.validate_fleet_primary_photo()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.primary_photo_path is not null and not exists(
    select 1 from public.fleet_documents d
    where d.organization_id=new.organization_id
      and d.vehicle_id=new.id
      and d.document_type='photo'
      and d.storage_path=new.primary_photo_path
  ) then
    raise exception 'Primary photo must be a photo document for the same unit';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_fleet_primary_photo() from public,anon,authenticated,service_role;

drop trigger if exists validate_fleet_primary_photo on public.fleet_vehicles;
create trigger validate_fleet_primary_photo
before update of primary_photo_path on public.fleet_vehicles
for each row execute function private.validate_fleet_primary_photo();
