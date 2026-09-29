alter table public.safety_documents
  add column if not exists expires_on date,
  add column if not exists requires_acknowledgement boolean not null default false,
  add column if not exists supersedes_document_id uuid references public.safety_documents(id) on delete set null,
  add column if not exists revision_notes text;

alter table public.safety_form_submissions
  drop constraint if exists safety_form_submissions_form_type_check;

alter table public.safety_form_submissions
  add constraint safety_form_submissions_form_type_check
  check (form_type in ('flha','incident_report','near_miss','hazard_observation','toolbox_talk','vehicle_equipment_inspection'));

create table if not exists public.safety_document_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.safety_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(document_id,user_id)
);

create table if not exists public.safety_form_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_id uuid not null references public.safety_form_submissions(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  caption text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists safety_ack_org_document_idx
  on public.safety_document_acknowledgements(organization_id,document_id,acknowledged_at desc);
create index if not exists safety_ack_user_idx
  on public.safety_document_acknowledgements(user_id,organization_id);
create index if not exists safety_form_attachments_submission_idx
  on public.safety_form_attachments(organization_id,submission_id,created_at);
create index if not exists safety_documents_expiry_idx
  on public.safety_documents(organization_id,expires_on)
  where status='active' and expires_on is not null;

create or replace function private.validate_safety_ack_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.safety_documents d
    where d.id=new.document_id and d.organization_id=new.organization_id
  ) then
    raise exception 'Safety acknowledgement document must belong to the same organization';
  end if;
  return new;
end;
$$;

create or replace function private.validate_safety_attachment_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.safety_form_submissions s
    where s.id=new.submission_id and s.organization_id=new.organization_id
  ) then
    raise exception 'Safety attachment must belong to the same organization as its submission';
  end if;
  if split_part(new.storage_path,'/',1)<>new.organization_id::text
     or split_part(new.storage_path,'/',2)<>'forms'
     or split_part(new.storage_path,'/',3)<>new.submission_id::text then
    raise exception 'Safety attachment storage path does not match its submission';
  end if;
  return new;
end;
$$;

create or replace function private.safety_storage_submission_id(_name text)
returns uuid
language plpgsql
stable
set search_path=''
as $$
declare segment text;
begin
  segment:=split_part(coalesce(_name,''),'/',3);
  if segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return segment::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

revoke all on function private.validate_safety_ack_scope() from public,anon,authenticated,service_role;
revoke all on function private.validate_safety_attachment_scope() from public,anon,authenticated,service_role;
revoke all on function private.safety_storage_submission_id(text) from public,anon,authenticated,service_role;

drop trigger if exists validate_safety_ack_scope on public.safety_document_acknowledgements;
create trigger validate_safety_ack_scope
before insert or update on public.safety_document_acknowledgements
for each row execute function private.validate_safety_ack_scope();

drop trigger if exists validate_safety_attachment_scope on public.safety_form_attachments;
create trigger validate_safety_attachment_scope
before insert or update on public.safety_form_attachments
for each row execute function private.validate_safety_attachment_scope();

alter table public.safety_document_acknowledgements enable row level security;
alter table public.safety_form_attachments enable row level security;

grant select,insert,delete on public.safety_document_acknowledgements to authenticated;
grant select,insert,delete on public.safety_form_attachments to authenticated;

create policy safety_ack_select on public.safety_document_acknowledgements
for select to authenticated
using (
  user_id=(select auth.uid())
  or private.has_org_permission(organization_id,'safety.manage')
);

create policy safety_ack_insert on public.safety_document_acknowledgements
for insert to authenticated
with check (
  user_id=(select auth.uid())
  and private.is_org_member(organization_id)
);

create policy safety_ack_delete on public.safety_document_acknowledgements
for delete to authenticated
using (
  user_id=(select auth.uid())
  or private.has_org_permission(organization_id,'safety.manage')
);

create policy safety_form_attachments_select on public.safety_form_attachments
for select to authenticated
using (
  private.has_org_permission(organization_id,'safety.manage')
  or exists(
    select 1 from public.safety_form_submissions s
    where s.id=submission_id
      and s.organization_id=organization_id
      and s.submitted_by=(select auth.uid())
  )
);

create policy safety_form_attachments_insert on public.safety_form_attachments
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and exists(
    select 1 from public.safety_form_submissions s
    where s.id=submission_id
      and s.organization_id=organization_id
      and (
        s.submitted_by=(select auth.uid())
        or private.has_org_permission(organization_id,'safety.manage')
      )
  )
);

create policy safety_form_attachments_delete on public.safety_form_attachments
for delete to authenticated
using (
  created_by=(select auth.uid())
  or private.has_org_permission(organization_id,'safety.manage')
);

drop policy if exists safety_files_storage_select on storage.objects;
create policy safety_files_storage_select on storage.objects
for select to authenticated
using (
  bucket_id='safety-files'
  and private.safety_storage_org_id(name) is not null
  and (
    private.has_org_permission(private.safety_storage_org_id(name),'safety.manage')
    or (
      split_part(name,'/',2)='library'
      and private.is_org_member(private.safety_storage_org_id(name))
    )
    or (
      split_part(name,'/',2)='credentials'
      and private.is_current_user_employee(
        private.safety_storage_employee_id(name),
        private.safety_storage_org_id(name)
      )
    )
    or (
      split_part(name,'/',2)='forms'
      and exists(
        select 1 from public.safety_form_submissions s
        where s.id=private.safety_storage_submission_id(name)
          and s.organization_id=private.safety_storage_org_id(name)
          and s.submitted_by=(select auth.uid())
      )
    )
  )
);

drop policy if exists safety_files_storage_insert on storage.objects;
create policy safety_files_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='safety-files'
  and private.safety_storage_org_id(name) is not null
  and (
    (
      split_part(name,'/',2)='library'
      and private.has_org_permission(private.safety_storage_org_id(name),'safety.manage')
    )
    or (
      split_part(name,'/',2)='credentials'
      and (
        private.has_org_permission(private.safety_storage_org_id(name),'safety.manage')
        or (
          private.has_org_permission(private.safety_storage_org_id(name),'safety.submit')
          and private.is_current_user_employee(
            private.safety_storage_employee_id(name),
            private.safety_storage_org_id(name)
          )
        )
      )
    )
    or (
      split_part(name,'/',2)='forms'
      and exists(
        select 1 from public.safety_form_submissions s
        where s.id=private.safety_storage_submission_id(name)
          and s.organization_id=private.safety_storage_org_id(name)
          and (
            s.submitted_by=(select auth.uid())
            or private.has_org_permission(s.organization_id,'safety.manage')
          )
      )
    )
  )
);

create or replace function private.notify_safety_submission()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  _urgent boolean;
begin
  _urgent :=
    new.form_type in ('incident_report','near_miss')
    or lower(coalesce(new.answers->>'risk_level','')) in ('high','immediate danger')
    or lower(coalesce(new.answers->>'result',''))='fail';

  insert into public.user_notifications(
    organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload
  )
  select distinct new.organization_id,om.user_id,
    case when _urgent then 'safety_escalation' else 'safety_submission' end,
    case when _urgent then 'Safety submission needs attention' else 'New safety submission' end,
    new.title,
    'safety_form_submission',
    new.id,
    jsonb_build_object('form_type',new.form_type,'job_id',new.job_id,'urgent',_urgent)
  from public.organization_members om
  join public.membership_roles mr on mr.membership_id=om.id
  join public.roles r on r.id=mr.role_id
  where om.organization_id=new.organization_id
    and om.status='active'
    and r.key in ('owner','admin','safety','supervisor')
    and om.user_id<>new.submitted_by;

  return new;
end;
$$;

revoke all on function private.notify_safety_submission() from public,anon,authenticated,service_role;

drop trigger if exists notify_safety_submission on public.safety_form_submissions;
create trigger notify_safety_submission
after insert on public.safety_form_submissions
for each row execute function private.notify_safety_submission();
