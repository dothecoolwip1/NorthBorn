create or replace function private.validate_customer_site_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.customers c
    where c.id=new.customer_id and c.organization_id=new.organization_id
  ) then
    raise exception 'Customer site must belong to the same organization as the customer';
  end if;

  if new.contact_id is not null and not exists(
    select 1 from public.customer_contacts cc
    where cc.id=new.contact_id
      and cc.customer_id=new.customer_id
      and cc.organization_id=new.organization_id
      and cc.status<>'archived'
  ) then
    raise exception 'Site contact must belong to the same customer';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_customer_site_scope() from public,anon,authenticated,service_role;

drop trigger if exists validate_customer_site_scope on public.customer_sites;
create trigger validate_customer_site_scope
before insert or update on public.customer_sites
for each row execute function private.validate_customer_site_scope();

create or replace function private.validate_customer_document_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.customers c
    where c.id=new.customer_id and c.organization_id=new.organization_id
  ) then
    raise exception 'Customer document must belong to the same organization as the customer';
  end if;

  if new.site_id is not null and not exists(
    select 1 from public.customer_sites s
    where s.id=new.site_id
      and s.customer_id=new.customer_id
      and s.organization_id=new.organization_id
  ) then
    raise exception 'Document site must belong to the same customer';
  end if;

  if split_part(new.storage_path,'/',1)<>new.organization_id::text
     or split_part(new.storage_path,'/',2)<>new.customer_id::text then
    raise exception 'Document storage path must be scoped to organization and customer';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_customer_document_scope() from public,anon,authenticated,service_role;

drop trigger if exists validate_customer_document_scope on public.customer_documents;
create trigger validate_customer_document_scope
before insert or update on public.customer_documents
for each row execute function private.validate_customer_document_scope();
