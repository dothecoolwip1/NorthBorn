create or replace function private.touch_job_for_contact_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  target_job_id uuid;
begin
  target_job_id := coalesce(new.job_id, old.job_id);
  update public.jobs set updated_at=now() where id=target_job_id;
  return coalesce(new,old);
end;
$$;

revoke all on function private.touch_job_for_contact_change() from public,anon,authenticated;
drop trigger if exists job_contacts_touch_job on public.job_contacts;
create trigger job_contacts_touch_job
after insert or update or delete on public.job_contacts
for each row execute function private.touch_job_for_contact_change();

create or replace function private.touch_jobs_for_customer_contact_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  target_contact_id uuid;
begin
  target_contact_id := coalesce(new.id, old.id);
  update public.jobs j
  set updated_at=now()
  where exists (
    select 1 from public.job_contacts jc
    where jc.job_id=j.id and jc.contact_id=target_contact_id
  );
  return coalesce(new,old);
end;
$$;

revoke all on function private.touch_jobs_for_customer_contact_change() from public,anon,authenticated;
drop trigger if exists customer_contacts_touch_jobs on public.customer_contacts;
create trigger customer_contacts_touch_jobs
after update on public.customer_contacts
for each row execute function private.touch_jobs_for_customer_contact_change();