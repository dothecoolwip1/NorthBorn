create or replace function private.organization_has_any_members(_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = _organization_id
  );
$$;

revoke all on function private.organization_has_any_members(uuid) from public;
grant execute on function private.organization_has_any_members(uuid) to authenticated;

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
on public.organizations for select to authenticated
using (
  private.is_org_member(id)
  or (
    created_by = (select auth.uid())
    and not private.organization_has_any_members(id)
  )
);
