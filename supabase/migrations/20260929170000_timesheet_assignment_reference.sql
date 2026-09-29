alter table public.timesheet_entries
  add column if not exists reference_number text;

create or replace function private.validate_timesheet_entry_links()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  _assignment_changed boolean := false;
begin
  if not exists (
    select 1
    from public.employees e
    where e.id=new.employee_id
      and e.organization_id=new.organization_id
  ) then
    raise exception 'Employee does not belong to this organization.';
  end if;

  if new.reference_number is not null then
    new.reference_number := nullif(trim(new.reference_number),'');
    if new.reference_number is not null and char_length(new.reference_number) > 120 then
      raise exception 'Timesheet reference cannot exceed 120 characters.';
    end if;
  end if;

  if new.job_id is not null then
    if not exists (
      select 1
      from public.jobs j
      where j.id=new.job_id
        and j.organization_id=new.organization_id
    ) then
      raise exception 'Job does not belong to this organization.';
    end if;

    if tg_op='INSERT' then
      _assignment_changed := true;
    else
      _assignment_changed := new.job_id is distinct from old.job_id
        or new.employee_id is distinct from old.employee_id;
    end if;

    if _assignment_changed and not exists (
      select 1
      from public.dispatch_assignments da
      where da.organization_id=new.organization_id
        and da.job_id=new.job_id
        and da.employee_id=new.employee_id
    ) then
      raise exception 'That job is not assigned to this employee. Use an assigned job or enter a manual job / invoice reference.';
    end if;
  end if;

  return new;
end;
$function$;
