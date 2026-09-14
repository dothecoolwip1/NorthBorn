create extension if not exists pg_trgm with schema extensions;

alter table public.fleet_defects
  add column if not exists report_count integer not null default 0,
  add column if not exists last_reported_at timestamptz;

create table if not exists public.employee_fleet_access_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  access_mode text not null check (access_mode in ('all','specific')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_id),
  constraint employee_fleet_access_profiles_employee_org_fkey foreign key (organization_id, employee_id) references public.employees(organization_id,id) on delete cascade
);

create table if not exists public.employee_vehicle_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  vehicle_id uuid not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, employee_id, vehicle_id),
  constraint employee_vehicle_access_employee_org_fkey foreign key (organization_id, employee_id) references public.employees(organization_id,id) on delete cascade,
  constraint employee_vehicle_access_vehicle_org_fkey foreign key (organization_id, vehicle_id) references public.fleet_vehicles(organization_id,id) on delete cascade
);

create table if not exists public.fleet_defect_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  defect_id uuid not null references public.fleet_defects(id) on delete cascade,
  vehicle_id uuid not null,
  reporter_user_id uuid not null references auth.users(id),
  source_inspection_id uuid references public.fleet_inspections(id) on delete set null,
  raw_title text,
  raw_description text,
  odometer_km bigint check (odometer_km is null or odometer_km >= 0),
  engine_hours numeric(10,1) check (engine_hours is null or engine_hours >= 0),
  reported_at timestamptz not null default now(),
  constraint fleet_defect_reports_vehicle_org_fkey foreign key (organization_id, vehicle_id) references public.fleet_vehicles(organization_id,id) on delete cascade
);

create index if not exists employee_fleet_access_profiles_employee_idx on public.employee_fleet_access_profiles(organization_id,employee_id);
create index if not exists employee_vehicle_access_employee_idx on public.employee_vehicle_access(organization_id,employee_id);
create index if not exists employee_vehicle_access_vehicle_idx on public.employee_vehicle_access(organization_id,vehicle_id);
create index if not exists fleet_defect_reports_defect_idx on public.fleet_defect_reports(defect_id,reported_at desc);
create index if not exists fleet_defect_reports_vehicle_idx on public.fleet_defect_reports(organization_id,vehicle_id,reported_at desc);

alter table public.employee_fleet_access_profiles enable row level security;
alter table public.employee_vehicle_access enable row level security;
alter table public.fleet_defect_reports enable row level security;

grant select,insert,update,delete on public.employee_fleet_access_profiles to authenticated;
grant select,insert,update,delete on public.employee_vehicle_access to authenticated;
grant select,insert on public.fleet_defect_reports to authenticated;
grant all on public.employee_fleet_access_profiles,public.employee_vehicle_access,public.fleet_defect_reports to service_role;

create or replace function private.employee_can_access_vehicle(_vehicle_id uuid,_organization_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  _employee_id uuid;
  _mode text;
begin
  select e.id into _employee_id
  from public.employees e
  where e.organization_id=_organization_id
    and e.user_id=(select auth.uid())
    and e.status<>'archived'
  limit 1;

  if _employee_id is null then return false; end if;

  select p.access_mode into _mode
  from public.employee_fleet_access_profiles p
  where p.organization_id=_organization_id and p.employee_id=_employee_id;

  if _mode is null then
    return private.is_vehicle_on_user_assigned_job(_vehicle_id,_organization_id);
  end if;
  if _mode='all' then return true; end if;

  return exists(
    select 1 from public.employee_vehicle_access a
    where a.organization_id=_organization_id
      and a.employee_id=_employee_id
      and a.vehicle_id=_vehicle_id
  );
end;
$$;

create or replace function private.can_operator_pretrip_vehicle(_vehicle_id uuid,_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.employees e
    join public.dispatch_assignments crew on crew.organization_id=e.organization_id and crew.employee_id=e.id
    join public.jobs j on j.id=crew.job_id and j.organization_id=crew.organization_id
    join public.dispatch_assignments va on va.organization_id=j.organization_id and va.job_id=j.id and va.vehicle_id=_vehicle_id
    where e.organization_id=_organization_id
      and e.user_id=(select auth.uid())
      and e.status<>'archived'
      and j.status not in ('completed','cancelled')
      and coalesce(j.shop_time,j.scheduled_start) is not null
      and coalesce(j.shop_time,j.scheduled_start) <= now()
  );
$$;

create or replace function private.normalize_defect_text(_text text)
returns text
language sql
immutable
set search_path=''
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(_text,'')), '\m(lf|driver front|drivers front)\M', ' left front ', 'g'),
            '\m(rf|passenger front|passengers front)\M', ' right front ', 'g'),
          '\m(lr|driver rear|drivers rear)\M', ' left rear ', 'g'),
        '\m(rr|passenger rear|passengers rear)\M', ' right rear ', 'g'),
      '[^a-z0-9]+',' ','g'),
    '\s+',' ','g'));
$$;

create policy employee_fleet_access_profiles_select on public.employee_fleet_access_profiles for select to authenticated using (
  private.has_org_permission(organization_id,'fleet.edit') or employee_id in (select e.id from public.employees e where e.user_id=(select auth.uid()) and e.organization_id=organization_id)
);
create policy employee_fleet_access_profiles_insert on public.employee_fleet_access_profiles for insert to authenticated with check (private.has_org_permission(organization_id,'fleet.edit') and created_by=(select auth.uid()));
create policy employee_fleet_access_profiles_update on public.employee_fleet_access_profiles for update to authenticated using (private.has_org_permission(organization_id,'fleet.edit')) with check (private.has_org_permission(organization_id,'fleet.edit'));
create policy employee_fleet_access_profiles_delete on public.employee_fleet_access_profiles for delete to authenticated using (private.has_org_permission(organization_id,'fleet.edit'));

create policy employee_vehicle_access_select on public.employee_vehicle_access for select to authenticated using (
  private.has_org_permission(organization_id,'fleet.edit') or employee_id in (select e.id from public.employees e where e.user_id=(select auth.uid()) and e.organization_id=organization_id)
);
create policy employee_vehicle_access_insert on public.employee_vehicle_access for insert to authenticated with check (private.has_org_permission(organization_id,'fleet.edit') and created_by=(select auth.uid()));
create policy employee_vehicle_access_delete on public.employee_vehicle_access for delete to authenticated using (private.has_org_permission(organization_id,'fleet.edit'));

create policy fleet_defect_reports_select on public.fleet_defect_reports for select to authenticated using (
  private.has_org_permission(organization_id,'fleet.view') or (private.has_org_permission(organization_id,'fleet.assigned.view') and private.employee_can_access_vehicle(vehicle_id,organization_id))
);
create policy fleet_defect_reports_insert on public.fleet_defect_reports for insert to authenticated with check (
  reporter_user_id=(select auth.uid()) and (private.has_org_permission(organization_id,'fleet.edit') or (private.has_org_permission(organization_id,'fleet.assigned.view') and private.employee_can_access_vehicle(vehicle_id,organization_id)))
);

drop policy if exists fleet_select on public.fleet_vehicles;
create policy fleet_select on public.fleet_vehicles for select to authenticated using (
  private.has_org_permission(organization_id,'fleet.view') or (private.has_org_permission(organization_id,'fleet.assigned.view') and private.employee_can_access_vehicle(id,organization_id))
);

drop policy if exists fleet_defects_select on public.fleet_defects;
create policy fleet_defects_select on public.fleet_defects for select to authenticated using (
  private.has_org_permission(organization_id,'fleet.view') or (private.has_org_permission(organization_id,'fleet.assigned.view') and private.employee_can_access_vehicle(vehicle_id,organization_id))
);

drop policy if exists fleet_defects_insert on public.fleet_defects;
create policy fleet_defects_insert on public.fleet_defects for insert to authenticated with check (
  (private.has_org_permission(organization_id,'fleet.edit') or (private.has_org_permission(organization_id,'fleet.assigned.view') and private.employee_can_access_vehicle(vehicle_id,organization_id)))
  and reported_by=(select auth.uid())
);

drop policy if exists fleet_inspections_select on public.fleet_inspections;
create policy fleet_inspections_select on public.fleet_inspections for select to authenticated using (
  private.has_org_permission(organization_id,'fleet.view') or (private.has_org_permission(organization_id,'fleet.assigned.view') and private.employee_can_access_vehicle(vehicle_id,organization_id))
);

drop policy if exists fleet_inspections_insert on public.fleet_inspections;
create policy fleet_inspections_insert on public.fleet_inspections for insert to authenticated with check (
  inspector_user_id=(select auth.uid()) and (
    private.has_org_permission(organization_id,'fleet.edit') or (
      private.has_org_permission(organization_id,'fleet.assigned.view') and
      private.employee_can_access_vehicle(vehicle_id,organization_id) and
      (inspection_type <> 'pre_trip' or private.can_operator_pretrip_vehicle(vehicle_id,organization_id))
    )
  )
);

create or replace function public.find_similar_fleet_defect(_organization_id uuid,_vehicle_id uuid,_title text,_description text default null)
returns table(defect_id uuid,title text,description text,severity text,out_of_service boolean,report_count integer,similarity_score real)
language sql
stable
security definer
set search_path=''
as $$
  with candidate as (
    select d.*,
      greatest(
        extensions.similarity(private.normalize_defect_text(d.title), private.normalize_defect_text(_title)),
        extensions.similarity(private.normalize_defect_text(coalesce(d.description,'')), private.normalize_defect_text(coalesce(_description,_title)))
      )::real as score
    from public.fleet_defects d
    where d.organization_id=_organization_id
      and d.vehicle_id=_vehicle_id
      and d.status not in ('resolved','dismissed')
  )
  select c.id,c.title,c.description,c.severity,c.out_of_service,c.report_count,c.score
  from candidate c
  where c.score >= .38
    and (private.has_org_permission(_organization_id,'fleet.edit') or (private.has_org_permission(_organization_id,'fleet.assigned.view') and private.employee_can_access_vehicle(_vehicle_id,_organization_id)))
  order by c.score desc,c.last_reported_at desc nulls last
  limit 1;
$$;

revoke all on function public.find_similar_fleet_defect(uuid,uuid,text,text) from public,anon;
grant execute on function public.find_similar_fleet_defect(uuid,uuid,text,text) to authenticated,service_role;

create or replace function public.report_fleet_defect(
  _organization_id uuid,_vehicle_id uuid,_title text,_description text,_severity text,_out_of_service boolean,
  _odometer_km bigint default null,_engine_hours numeric default null,_source_inspection_id uuid default null,_existing_defect_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare _id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
  if not (private.has_org_permission(_organization_id,'fleet.edit') or (private.has_org_permission(_organization_id,'fleet.assigned.view') and private.employee_can_access_vehicle(_vehicle_id,_organization_id))) then
    raise exception 'Not allowed to report defects for this vehicle';
  end if;
  if _existing_defect_id is not null then
    select d.id into _id from public.fleet_defects d where d.id=_existing_defect_id and d.organization_id=_organization_id and d.vehicle_id=_vehicle_id and d.status not in ('resolved','dismissed');
    if _id is null then raise exception 'Matching defect is no longer open'; end if;
    insert into public.fleet_defect_reports(organization_id,defect_id,vehicle_id,reporter_user_id,source_inspection_id,raw_title,raw_description,odometer_km,engine_hours)
    values(_organization_id,_id,_vehicle_id,(select auth.uid()),_source_inspection_id,_title,_description,_odometer_km,_engine_hours);
    update public.fleet_defects set severity=case when severity='critical' or _severity='critical' then 'critical' when severity='high' or _severity='high' then 'high' when severity='medium' or _severity='medium' then 'medium' else 'low' end,
      out_of_service=out_of_service or coalesce(_out_of_service,false)
    where id=_id;
    return _id;
  end if;

  insert into public.fleet_defects(organization_id,vehicle_id,title,description,severity,status,out_of_service,reported_by,reported_at,odometer_km,engine_hours)
  values(_organization_id,_vehicle_id,trim(_title),nullif(trim(coalesce(_description,'')),''),_severity,'open',coalesce(_out_of_service,false),(select auth.uid()),now(),_odometer_km,_engine_hours)
  returning id into _id;
  return _id;
end;
$$;
revoke all on function public.report_fleet_defect(uuid,uuid,text,text,text,boolean,bigint,numeric,uuid,uuid) from public,anon;
grant execute on function public.report_fleet_defect(uuid,uuid,text,text,text,boolean,bigint,numeric,uuid,uuid) to authenticated,service_role;

create or replace function private.ensure_initial_fleet_defect_report()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.reported_by is not null and not exists(select 1 from public.fleet_defect_reports r where r.defect_id=new.id) then
    insert into public.fleet_defect_reports(organization_id,defect_id,vehicle_id,reporter_user_id,raw_title,raw_description,odometer_km,engine_hours,reported_at)
    values(new.organization_id,new.id,new.vehicle_id,new.reported_by,new.title,new.description,new.odometer_km,new.engine_hours,new.reported_at);
  end if;
  return new;
end;
$$;

drop trigger if exists fleet_defect_initial_report on public.fleet_defects;
create trigger fleet_defect_initial_report after insert on public.fleet_defects for each row execute function private.ensure_initial_fleet_defect_report();

create or replace function private.after_fleet_defect_report()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare _unit text; _count integer;
begin
  update public.fleet_defects d
  set report_count=(select count(*) from public.fleet_defect_reports r where r.defect_id=new.defect_id),
      last_reported_at=new.reported_at
  where d.id=new.defect_id
  returning report_count into _count;

  select v.unit_number into _unit from public.fleet_vehicles v where v.id=new.vehicle_id;

  insert into public.user_notifications(organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload)
  select distinct om.organization_id,om.user_id,'fleet_defect_reported',
    'Fleet defect reported',
    'Unit '||coalesce(_unit,'?')||': '||coalesce(d.title,'Defect')||case when _count>1 then ' · reported by '||_count||' people' else '' end,
    'fleet_defect',d.id,
    jsonb_build_object('vehicle_id',d.vehicle_id,'unit_number',_unit,'defect_id',d.id,'report_count',_count,'severity',d.severity)
  from public.fleet_defects d
  join public.organization_members om on om.organization_id=d.organization_id and om.status='active'
  join public.membership_roles mr on mr.membership_id=om.id
  join public.roles ro on ro.id=mr.role_id
  where d.id=new.defect_id and ro.key in ('owner','admin','supervisor','mechanic','dispatcher') and om.user_id<>new.reporter_user_id;
  return new;
end;
$$;

drop trigger if exists fleet_defect_report_notify on public.fleet_defect_reports;
create trigger fleet_defect_report_notify after insert on public.fleet_defect_reports for each row execute function private.after_fleet_defect_report();

create or replace function private.notify_fleet_defect_repaired()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare _unit text;
begin
  if old.status is distinct from 'resolved' and new.status='resolved' then
    select v.unit_number into _unit from public.fleet_vehicles v where v.id=new.vehicle_id;
    insert into public.user_notifications(organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload)
    select distinct new.organization_id,u.user_id,'fleet_defect_repaired','Truck repair completed',
      'Unit '||coalesce(_unit,'?')||': '||new.title||' has been repaired.',
      'fleet_defect',new.id,
      jsonb_build_object('vehicle_id',new.vehicle_id,'unit_number',_unit,'defect_id',new.id,'title',new.title)
    from (
      select e.user_id from public.employee_vehicle_access a join public.employees e on e.id=a.employee_id and e.organization_id=a.organization_id where a.organization_id=new.organization_id and a.vehicle_id=new.vehicle_id and e.user_id is not null and e.status<>'archived'
      union
      select e.user_id from public.dispatch_assignments va join public.dispatch_assignments ca on ca.organization_id=va.organization_id and ca.job_id=va.job_id join public.employees e on e.id=ca.employee_id and e.organization_id=ca.organization_id join public.jobs j on j.id=va.job_id and j.organization_id=va.organization_id where va.organization_id=new.organization_id and va.vehicle_id=new.vehicle_id and j.status not in ('completed','cancelled') and e.user_id is not null and e.status<>'archived'
      union
      select e.user_id from public.fleet_vehicles v join public.employees e on e.id=v.primary_operator_id and e.organization_id=v.organization_id where v.id=new.vehicle_id and v.organization_id=new.organization_id and e.user_id is not null and e.status<>'archived'
    ) u;
  end if;
  return new;
end;
$$;

drop trigger if exists fleet_defect_repaired_notify on public.fleet_defects;
create trigger fleet_defect_repaired_notify after update of status on public.fleet_defects for each row execute function private.notify_fleet_defect_repaired();

create trigger employee_fleet_access_profiles_updated_at before update on public.employee_fleet_access_profiles for each row execute function private.set_updated_at();
create trigger employee_fleet_access_profiles_audit after insert or update or delete on public.employee_fleet_access_profiles for each row execute function private.write_audit_log();
create trigger employee_vehicle_access_audit after insert or update or delete on public.employee_vehicle_access for each row execute function private.write_audit_log();
create trigger fleet_defect_reports_audit after insert or update or delete on public.fleet_defect_reports for each row execute function private.write_audit_log();