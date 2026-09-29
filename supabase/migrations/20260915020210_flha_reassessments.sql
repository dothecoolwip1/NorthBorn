create table if not exists public.safety_form_reassessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_id uuid not null references public.safety_form_submissions(id) on delete cascade,
  reason text not null,
  changes text not null,
  new_hazards text,
  added_controls text not null,
  safe_to_continue boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists safety_form_reassessments_submission_idx on public.safety_form_reassessments(submission_id, created_at);
create index if not exists safety_form_reassessments_org_idx on public.safety_form_reassessments(organization_id, created_at desc);
create index if not exists safety_form_reassessments_created_by_idx on public.safety_form_reassessments(created_by);

alter table public.safety_form_reassessments enable row level security;
grant select, insert on public.safety_form_reassessments to authenticated;
grant all on public.safety_form_reassessments to service_role;

create policy safety_form_reassessments_select on public.safety_form_reassessments
for select to authenticated
using (
  private.has_org_permission(organization_id,'safety.manage')
  or exists (
    select 1 from public.safety_form_submissions s
    where s.id = submission_id
      and s.organization_id = organization_id
      and s.submitted_by = (select auth.uid())
  )
);

create policy safety_form_reassessments_insert on public.safety_form_reassessments
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    private.has_org_permission(organization_id,'safety.manage')
    or exists (
      select 1 from public.safety_form_submissions s
      where s.id = submission_id
        and s.organization_id = organization_id
        and s.submitted_by = (select auth.uid())
        and s.form_type = 'flha'
        and s.status in ('submitted','reviewed')
    )
  )
);

create trigger safety_form_reassessments_audit
after insert on public.safety_form_reassessments
for each row execute function private.write_audit_log();