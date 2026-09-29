create table if not exists public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  work_date date not null default current_date,
  start_time time,
  end_time time,
  break_minutes integer not null default 0 check (break_minutes between 0 and 1440),
  regular_hours numeric(5,2) not null default 0 check (regular_hours between 0 and 24),
  overtime_hours numeric(5,2) not null default 0 check (overtime_hours between 0 and 24),
  notes text,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timesheet_hours_reasonable check ((regular_hours + overtime_hours) <= 24)
);

create index if not exists timesheet_entries_org_date_idx on public.timesheet_entries(organization_id, work_date desc);
create index if not exists timesheet_entries_employee_date_idx on public.timesheet_entries(employee_id, work_date desc);
create index if not exists timesheet_entries_org_status_idx on public.timesheet_entries(organization_id, status, work_date desc);
create index if not exists timesheet_entries_job_idx on public.timesheet_entries(job_id) where job_id is not null;

create or replace function private.validate_timesheet_entry_links()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not exists (
    select 1 from public.employees e
    where e.id=new.employee_id and e.organization_id=new.organization_id
  ) then
    raise exception 'Employee does not belong to this organization.';
  end if;
  if new.job_id is not null and not exists (
    select 1 from public.jobs j
    where j.id=new.job_id and j.organization_id=new.organization_id
  ) then
    raise exception 'Job does not belong to this organization.';
  end if;
  return new;
end;
$function$;

create trigger timesheet_entries_validate_links
before insert or update of organization_id,employee_id,job_id on public.timesheet_entries
for each row execute function private.validate_timesheet_entry_links();

create trigger timesheet_entries_set_updated_at
before update on public.timesheet_entries
for each row execute function private.set_updated_at();

alter table public.timesheet_entries enable row level security;

create policy timesheet_entries_select on public.timesheet_entries
for select to authenticated
using (
  private.has_org_permission(organization_id,'timesheets.view')
  or (
    private.has_org_permission(organization_id,'timesheets.self.view')
    and exists (
      select 1 from public.employees e
      where e.id=timesheet_entries.employee_id
        and e.organization_id=timesheet_entries.organization_id
        and e.user_id=(select auth.uid())
        and e.status='active'
    )
  )
);

create policy timesheet_entries_insert on public.timesheet_entries
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and (
    private.has_org_permission(organization_id,'timesheets.manage')
    or (
      private.has_org_permission(organization_id,'timesheets.submit')
      and exists (
        select 1 from public.employees e
        where e.id=timesheet_entries.employee_id
          and e.organization_id=timesheet_entries.organization_id
          and e.user_id=(select auth.uid())
          and e.status='active'
      )
      and status in ('draft','submitted')
    )
  )
);

create policy timesheet_entries_update on public.timesheet_entries
for update to authenticated
using (
  private.has_org_permission(organization_id,'timesheets.manage')
  or (
    private.has_org_permission(organization_id,'timesheets.submit')
    and status in ('draft','rejected')
    and exists (
      select 1 from public.employees e
      where e.id=timesheet_entries.employee_id
        and e.organization_id=timesheet_entries.organization_id
        and e.user_id=(select auth.uid())
        and e.status='active'
    )
  )
)
with check (
  private.has_org_permission(organization_id,'timesheets.manage')
  or (
    private.has_org_permission(organization_id,'timesheets.submit')
    and status in ('draft','submitted')
    and exists (
      select 1 from public.employees e
      where e.id=timesheet_entries.employee_id
        and e.organization_id=timesheet_entries.organization_id
        and e.user_id=(select auth.uid())
        and e.status='active'
    )
  )
);

create policy timesheet_entries_delete on public.timesheet_entries
for delete to authenticated
using (
  private.has_org_permission(organization_id,'timesheets.manage')
  or (
    private.has_org_permission(organization_id,'timesheets.submit')
    and status in ('draft','rejected')
    and exists (
      select 1 from public.employees e
      where e.id=timesheet_entries.employee_id
        and e.organization_id=timesheet_entries.organization_id
        and e.user_id=(select auth.uid())
        and e.status='active'
    )
  )
);
