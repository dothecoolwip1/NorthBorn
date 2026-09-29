create or replace function private.cleanup_job_contacts_on_customer_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.customer_id is distinct from new.customer_id then
    delete from public.job_contacts jc
    using public.customer_contacts cc
    where jc.job_id=new.id
      and jc.organization_id=new.organization_id
      and cc.id=jc.contact_id
      and cc.customer_id<>new.customer_id;
  end if;
  return new;
end;
$$;

revoke all on function private.cleanup_job_contacts_on_customer_change() from public,anon,authenticated;
drop trigger if exists jobs_cleanup_contacts_customer_change on public.jobs;
create trigger jobs_cleanup_contacts_customer_change
after update of customer_id on public.jobs
for each row execute function private.cleanup_job_contacts_on_customer_change();