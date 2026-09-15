create table public.safety_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  credential_type text not null check (credential_type in ('ticket','orientation','training','certification','fit_test','medical','other')),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  issuer text,
  credential_number text,
  issued_on date,
  expires_on date,
  status text not null default 'pending' check (status in ('pending','verified','expired','rejected')),
  file_path text not null,
  notes text,
  uploaded_by uuid not null references auth.users(id),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint safety_credentials_employee_org_fkey
    foreign key (organization_id, employee_id)
    references public.employees(organization_id, id)
    on delete cascade,
  constraint safety_credentials_date_order_check
    check (expires_on is null or issued_on is null or expires_on >= issued_on)
);

create table public.safety_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null check (category in ('sds','sop','safe_work_practice','policy','erp','jsa_jha','orientation','reference','other')),
  title text not null check (char_length(btrim(title)) between 2 and 180),
  description text,
  tags text[] not null default '{}',
  version text,
  effective_date date,
  review_date date,
  status text not null default 'active' check (status in ('active','archived')),
  file_path text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint safety_documents_review_date_check
    check (review_date is null or effective_date is null or review_date >= effective_date)
);

create table public.safety_form_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid,
  job_id uuid references public.jobs(id) on delete set null,
  form_type text not null check (form_type in ('flha','incident_report','near_miss','hazard_observation','toolbox_talk')),
  title text not null,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (status in ('draft','submitted','reviewed','closed')),
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint safety_form_submissions_employee_org_fkey
    foreign key (organization_id, employee_id)
    references public.employees(organization_id, id)
    on delete set null
);

create index safety_credentials_org_employee_idx on public.safety_credentials(organization_id, employee_id, expires_on);
create index safety_credentials_org_status_idx on public.safety_credentials(organization_id, status, expires_on);
create index safety_documents_org_category_idx on public.safety_documents(organization_id, category, status);
create index safety_documents_tags_gin_idx on public.safety_documents using gin(tags);
create index safety_form_submissions_org_time_idx on public.safety_form_submissions(organization_id, created_at desc);
create index safety_form_submissions_submitter_idx on public.safety_form_submissions(submitted_by, organization_id, created_at desc);
create index safety_form_submissions_job_idx on public.safety_form_submissions(job_id) where job_id is not null;
create index safety_form_submissions_employee_idx on public.safety_form_submissions(employee_id) where employee_id is not null;

create or replace function private.validate_safety_form_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.job_id is not null and not exists (
    select 1 from public.jobs j
    where j.id = new.job_id and j.organization_id = new.organization_id
  ) then
    raise exception 'Safety form job must belong to the same organization';
  end if;
  return new;
end;
$$;

create or replace function private.safety_storage_org_id(_name text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  segment text;
begin
  segment := split_part(coalesce(_name,''), '/', 1);
  if segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return segment::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create or replace function private.safety_storage_employee_id(_name text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  segment text;
begin
  segment := split_part(coalesce(_name,''), '/', 3);
  if segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return segment::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

revoke all on function private.safety_storage_org_id(text) from public;
revoke all on function private.safety_storage_employee_id(text) from public;
grant execute on function private.safety_storage_org_id(text) to authenticated;
grant execute on function private.safety_storage_employee_id(text) to authenticated;

create trigger safety_credentials_updated_at
before update on public.safety_credentials
for each row execute function private.set_updated_at();
create trigger safety_documents_updated_at
before update on public.safety_documents
for each row execute function private.set_updated_at();
create trigger safety_form_submissions_updated_at
before update on public.safety_form_submissions
for each row execute function private.set_updated_at();
create trigger safety_form_submissions_scope
before insert or update on public.safety_form_submissions
for each row execute function private.validate_safety_form_scope();

create trigger safety_credentials_audit
after insert or update or delete on public.safety_credentials
for each row execute function private.write_audit_log();
create trigger safety_documents_audit
after insert or update or delete on public.safety_documents
for each row execute function private.write_audit_log();
create trigger safety_form_submissions_audit
after insert or update or delete on public.safety_form_submissions
for each row execute function private.write_audit_log();

alter table public.safety_credentials enable row level security;
alter table public.safety_documents enable row level security;
alter table public.safety_form_submissions enable row level security;

grant select, insert, update, delete on public.safety_credentials to authenticated;
grant select, insert, update, delete on public.safety_documents to authenticated;
grant select, insert, update, delete on public.safety_form_submissions to authenticated;
grant all on public.safety_credentials to service_role;
grant all on public.safety_documents to service_role;
grant all on public.safety_form_submissions to service_role;

create policy safety_credentials_select on public.safety_credentials
for select to authenticated
using (
  private.has_org_permission(organization_id, 'safety.manage')
  or private.is_current_user_employee(employee_id, organization_id)
);

create policy safety_credentials_insert on public.safety_credentials
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (
    private.has_org_permission(organization_id, 'safety.manage')
    or (
      private.has_org_permission(organization_id, 'safety.submit')
      and private.is_current_user_employee(employee_id, organization_id)
      and status = 'pending'
      and verified_by is null
      and verified_at is null
    )
  )
);

create policy safety_credentials_update on public.safety_credentials
for update to authenticated
using (
  private.has_org_permission(organization_id, 'safety.manage')
  or (
    uploaded_by = (select auth.uid())
    and private.is_current_user_employee(employee_id, organization_id)
    and status = 'pending'
  )
)
with check (
  private.has_org_permission(organization_id, 'safety.manage')
  or (
    uploaded_by = (select auth.uid())
    and private.is_current_user_employee(employee_id, organization_id)
    and status = 'pending'
    and verified_by is null
    and verified_at is null
  )
);

create policy safety_credentials_delete on public.safety_credentials
for delete to authenticated
using (
  private.has_org_permission(organization_id, 'safety.manage')
  or (
    uploaded_by = (select auth.uid())
    and private.is_current_user_employee(employee_id, organization_id)
    and status = 'pending'
  )
);

create policy safety_documents_select on public.safety_documents
for select to authenticated
using (private.is_org_member(organization_id));
create policy safety_documents_insert on public.safety_documents
for insert to authenticated
with check (
  private.has_org_permission(organization_id, 'safety.manage')
  and created_by = (select auth.uid())
);
create policy safety_documents_update on public.safety_documents
for update to authenticated
using (private.has_org_permission(organization_id, 'safety.manage'))
with check (private.has_org_permission(organization_id, 'safety.manage'));
create policy safety_documents_delete on public.safety_documents
for delete to authenticated
using (private.has_org_permission(organization_id, 'safety.manage'));

create policy safety_form_submissions_select on public.safety_form_submissions
for select to authenticated
using (
  private.has_org_permission(organization_id, 'safety.manage')
  or submitted_by = (select auth.uid())
);
create policy safety_form_submissions_insert on public.safety_form_submissions
for insert to authenticated
with check (
  private.has_org_permission(organization_id, 'safety.submit')
  and submitted_by = (select auth.uid())
  and (
    employee_id is null
    or private.has_org_permission(organization_id, 'safety.manage')
    or private.is_current_user_employee(employee_id, organization_id)
  )
);
create policy safety_form_submissions_update on public.safety_form_submissions
for update to authenticated
using (private.has_org_permission(organization_id, 'safety.manage'))
with check (private.has_org_permission(organization_id, 'safety.manage'));
create policy safety_form_submissions_delete on public.safety_form_submissions
for delete to authenticated
using (private.has_org_permission(organization_id, 'safety.manage'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'safety-files',
  'safety-files',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy safety_files_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'safety-files'
  and private.safety_storage_org_id(name) is not null
  and (
    private.has_org_permission(private.safety_storage_org_id(name), 'safety.manage')
    or (
      split_part(name, '/', 2) = 'library'
      and private.is_org_member(private.safety_storage_org_id(name))
    )
    or (
      split_part(name, '/', 2) = 'credentials'
      and private.is_current_user_employee(private.safety_storage_employee_id(name), private.safety_storage_org_id(name))
    )
  )
);

create policy safety_files_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'safety-files'
  and private.safety_storage_org_id(name) is not null
  and (
    (
      split_part(name, '/', 2) = 'library'
      and private.has_org_permission(private.safety_storage_org_id(name), 'safety.manage')
    )
    or (
      split_part(name, '/', 2) = 'credentials'
      and (
        private.has_org_permission(private.safety_storage_org_id(name), 'safety.manage')
        or (
          private.has_org_permission(private.safety_storage_org_id(name), 'safety.submit')
          and private.is_current_user_employee(private.safety_storage_employee_id(name), private.safety_storage_org_id(name))
        )
      )
    )
  )
);

create policy safety_files_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'safety-files'
  and private.safety_storage_org_id(name) is not null
  and (
    private.has_org_permission(private.safety_storage_org_id(name), 'safety.manage')
    or (
      split_part(name, '/', 2) = 'credentials'
      and private.has_org_permission(private.safety_storage_org_id(name), 'safety.submit')
      and private.is_current_user_employee(private.safety_storage_employee_id(name), private.safety_storage_org_id(name))
    )
  )
)
with check (
  bucket_id = 'safety-files'
  and private.safety_storage_org_id(name) is not null
  and (
    private.has_org_permission(private.safety_storage_org_id(name), 'safety.manage')
    or (
      split_part(name, '/', 2) = 'credentials'
      and private.has_org_permission(private.safety_storage_org_id(name), 'safety.submit')
      and private.is_current_user_employee(private.safety_storage_employee_id(name), private.safety_storage_org_id(name))
    )
  )
);

create policy safety_files_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'safety-files'
  and private.safety_storage_org_id(name) is not null
  and (
    private.has_org_permission(private.safety_storage_org_id(name), 'safety.manage')
    or (
      split_part(name, '/', 2) = 'credentials'
      and private.has_org_permission(private.safety_storage_org_id(name), 'safety.submit')
      and private.is_current_user_employee(private.safety_storage_employee_id(name), private.safety_storage_org_id(name))
    )
  )
);