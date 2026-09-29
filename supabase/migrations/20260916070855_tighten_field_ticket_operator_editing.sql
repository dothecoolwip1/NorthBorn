create or replace function private.can_submit_field_ticket_row(_organization_id uuid,_job_id uuid,_employee_id uuid)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select private.has_org_permission(_organization_id,'tickets.submit')
    and _job_id is not null
    and private.is_user_assigned_to_job(_job_id,_organization_id)
    and _employee_id is not null
    and exists(
      select 1 from public.employees e
      where e.id=_employee_id and e.organization_id=_organization_id
        and e.user_id=(select auth.uid()) and e.status='active'
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
            or exists(
              select 1 from public.employees e
              where e.id=t.primary_employee_id and e.organization_id=_organization_id
                and e.user_id=(select auth.uid()) and e.status='active'
            )
          )
      )
    );
$function$;

drop policy if exists field_tickets_insert on public.field_tickets;
create policy field_tickets_insert on public.field_tickets for insert to authenticated with check (
  created_by=(select auth.uid()) and (
    private.has_org_permission(organization_id,'tickets.manage')
    or (private.can_submit_field_ticket_row(organization_id,job_id,primary_employee_id) and status in ('draft','submitted'))
  )
);

drop policy if exists field_tickets_update on public.field_tickets;
create policy field_tickets_update on public.field_tickets for update to authenticated
using (private.can_edit_field_ticket(organization_id,id))
with check (
  private.has_org_permission(organization_id,'tickets.manage')
  or (private.can_submit_field_ticket_row(organization_id,job_id,primary_employee_id) and status in ('draft','submitted'))
);
