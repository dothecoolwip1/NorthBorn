create or replace function private.validate_job_contact_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  job_row public.jobs%rowtype;
  contact_row public.customer_contacts%rowtype;
begin
  select * into job_row from public.jobs where id=new.job_id;
  select * into contact_row from public.customer_contacts where id=new.contact_id;
  if job_row.id is null or contact_row.id is null then
    raise exception 'Invalid job or contact';
  end if;
  if job_row.organization_id<>new.organization_id or contact_row.organization_id<>new.organization_id then
    raise exception 'Job contact organization mismatch';
  end if;
  if contact_row.customer_id<>job_row.customer_id then
    raise exception 'Contact must belong to the job customer';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_job_contact_scope() from public,anon,authenticated;
drop trigger if exists job_contacts_validate_scope on public.job_contacts;
create trigger job_contacts_validate_scope
before insert or update on public.job_contacts
for each row execute function private.validate_job_contact_scope();