create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_recipient_created_idx on public.user_notifications(recipient_user_id, created_at desc);
create index if not exists user_notifications_org_recipient_idx on public.user_notifications(organization_id, recipient_user_id);

alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from anon;
grant select, update on public.user_notifications to authenticated;
grant all on public.user_notifications to service_role;

create policy user_notifications_select on public.user_notifications for select to authenticated
using (recipient_user_id=(select auth.uid()));
create policy user_notifications_update on public.user_notifications for update to authenticated
using (recipient_user_id=(select auth.uid()))
with check (recipient_user_id=(select auth.uid()));

create or replace function private.notify_dispatch_assignment_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  target_employee_id uuid;
  target_user_id uuid;
  target_org_id uuid;
  target_job_id uuid;
  job_row public.jobs%rowtype;
  event_kind text;
begin
  if tg_op='INSERT' then
    target_employee_id := new.employee_id;
    target_org_id := new.organization_id;
    target_job_id := new.job_id;
    event_kind := 'job_assigned';
  elsif tg_op='DELETE' then
    target_employee_id := old.employee_id;
    target_org_id := old.organization_id;
    target_job_id := old.job_id;
    event_kind := 'job_unassigned';
  else
    return coalesce(new,old);
  end if;

  if target_employee_id is null then
    return coalesce(new,old);
  end if;

  select e.user_id into target_user_id
  from public.employees e
  where e.id=target_employee_id and e.organization_id=target_org_id;

  if target_user_id is null then
    return coalesce(new,old);
  end if;

  select j.* into job_row from public.jobs j where j.id=target_job_id and j.organization_id=target_org_id;

  insert into public.user_notifications(
    organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload
  ) values (
    target_org_id,
    target_user_id,
    event_kind,
    case when event_kind='job_assigned' then 'New job assigned' else 'Removed from job' end,
    case when job_row.id is null then null else job_row.title end,
    'job',
    target_job_id,
    jsonb_build_object(
      'job_number',job_row.job_number,
      'job_title',job_row.title,
      'site_name',job_row.site_name,
      'site_address',job_row.site_address,
      'scheduled_start',job_row.scheduled_start
    )
  );

  return coalesce(new,old);
end;
$$;

revoke all on function private.notify_dispatch_assignment_change() from public, anon, authenticated;

drop trigger if exists dispatch_assignment_notify_insert on public.dispatch_assignments;
create trigger dispatch_assignment_notify_insert
after insert on public.dispatch_assignments
for each row execute function private.notify_dispatch_assignment_change();

drop trigger if exists dispatch_assignment_notify_delete on public.dispatch_assignments;
create trigger dispatch_assignment_notify_delete
after delete on public.dispatch_assignments
for each row execute function private.notify_dispatch_assignment_change();

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='user_notifications'
  ) then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end $$;

create or replace function public.get_my_assigned_job_contacts(_organization_id uuid)
returns table (
  job_id uuid,
  customer_id uuid,
  customer_name text,
  contact_id uuid,
  contact_name text,
  contact_title text,
  contact_phone text,
  contact_email text,
  contact_type text,
  is_primary boolean
)
language sql
stable
security definer
set search_path=''
as $$
  select
    j.id,
    c.id,
    c.name,
    cc.id,
    cc.name,
    cc.title,
    cc.phone,
    cc.email,
    cc.contact_type,
    coalesce(jc.is_primary,false)
  from public.jobs j
  join public.customers c on c.id=j.customer_id and c.organization_id=j.organization_id
  left join public.job_contacts jc on jc.job_id=j.id and jc.organization_id=j.organization_id
  left join public.customer_contacts cc on cc.id=jc.contact_id and cc.organization_id=j.organization_id and cc.customer_id=j.customer_id and cc.status='active'
  where j.organization_id=_organization_id
    and private.has_org_permission(j.organization_id,'jobs.assigned.view')
    and private.is_user_assigned_to_job(j.id,j.organization_id)
  order by j.id, coalesce(jc.is_primary,false) desc, cc.name nulls last;
$$;

revoke all on function public.get_my_assigned_job_contacts(uuid) from public, anon;
grant execute on function public.get_my_assigned_job_contacts(uuid) to authenticated, service_role;