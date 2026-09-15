create or replace function private.ensure_northborn_test_workspace()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _manager uuid;
  _operator uuid;
  _client uuid;
  _creator uuid;
  _org uuid;
  _customer uuid;
  _operator_employee uuid;
  _vehicle uuid;
  _job uuid;
  _membership uuid;
  _role uuid;
begin
  select id into _manager from auth.users where lower(email) = 'manager@test.com' limit 1;
  select id into _operator from auth.users where lower(email) = 'operator@test.com' limit 1;
  select id into _client from auth.users where lower(email) = 'client@test.com' limit 1;
  _creator := coalesce(_manager, _operator, _client);
  if _creator is null then return; end if;

  select id into _org from public.organizations where slug = 'northborn-test-company' limit 1;
  if _org is null then
    insert into public.organizations(name,slug,status,country_code,timezone,settings,created_by)
    values ('Northborn Test Company','northborn-test-company','active','CA','America/Edmonton',jsonb_build_object('test_workspace',true,'invoice_company_name','Northborn Test Company','invoice_tax_rate',5),_creator)
    returning id into _org;
  end if;

  if _manager is not null then
    select id into _membership from public.organization_members where organization_id=_org and user_id=_manager limit 1;
    if _membership is null then
      insert into public.organization_members(organization_id,user_id,status,created_by) values(_org,_manager,'active',_manager) returning id into _membership;
    else
      update public.organization_members set status='active' where id=_membership;
    end if;
    select id into _role from public.roles where key='owner' limit 1;
    if _role is not null then
      insert into public.membership_roles(membership_id,role_id) values(_membership,_role) on conflict (membership_id,role_id) do nothing;
    end if;
  end if;

  if _operator is not null then
    select id into _membership from public.organization_members where organization_id=_org and user_id=_operator limit 1;
    if _membership is null then
      insert into public.organization_members(organization_id,user_id,status,created_by) values(_org,_operator,'active',_creator) returning id into _membership;
    else
      update public.organization_members set status='active' where id=_membership;
    end if;
    select id into _role from public.roles where key='operator' limit 1;
    if _role is not null then
      insert into public.membership_roles(membership_id,role_id) values(_membership,_role) on conflict (membership_id,role_id) do nothing;
    end if;

    select id into _operator_employee from public.employees where organization_id=_org and user_id=_operator limit 1;
    if _operator_employee is null then
      insert into public.employees(organization_id,user_id,first_name,last_name,email,phone,position,status,created_by)
      values(_org,_operator,'Operator','Test','operator@test.com','403-555-0111','Operator','active',_creator)
      returning id into _operator_employee;
    else
      update public.employees set status='active',email=coalesce(email,'operator@test.com') where id=_operator_employee;
    end if;
  end if;

  select id into _customer from public.customers where organization_id=_org and name='Northborn Test Client Company' limit 1;
  if _customer is null then
    insert into public.customers(organization_id,name,billing_email,phone,address,notes,status,created_by)
    values(_org,'Northborn Test Client Company','client@test.com','403-555-0100','Red Deer, AB','Functional test customer. Change the billing email to a real address when testing invoice delivery.','active',_creator)
    returning id into _customer;
  end if;

  if _client is not null then
    insert into public.customer_portal_users(organization_id,customer_id,user_id,portal_role,status,created_by)
    values(_org,_customer,_client,'admin','active',_creator)
    on conflict (organization_id,customer_id,user_id) do update set status='active',portal_role='admin';
  end if;

  select id into _vehicle from public.fleet_vehicles where organization_id=_org and unit_number='TEST-101' limit 1;
  if _vehicle is null then
    insert into public.fleet_vehicles(organization_id,unit_number,name,vehicle_type,plate,status,odometer_km,engine_hours,primary_operator_id,created_by)
    values(_org,'TEST-101','Test Hydrovac','Hydrovac','TEST101','assigned',125000,4200,_operator_employee,_creator)
    returning id into _vehicle;
  elsif _operator_employee is not null then
    update public.fleet_vehicles set primary_operator_id=_operator_employee where id=_vehicle;
  end if;

  select id into _job from public.jobs where organization_id=_org and job_number='TEST-0001' limit 1;
  if _job is null then
    insert into public.jobs(organization_id,customer_id,job_number,title,site_name,site_address,scheduled_start,scheduled_end,onsite_time,status,notes,created_by)
    values(_org,_customer,'TEST-0001','Northborn live feature test job','Test Site','Red Deer County, AB',now()+interval '2 hours',now()+interval '10 hours',now()+interval '2 hours','dispatched','Real database test job shared by the Manager, Operator and Client test personas.',_creator)
    returning id into _job;
  end if;

  if _operator_employee is not null and not exists(select 1 from public.dispatch_assignments where job_id=_job and employee_id=_operator_employee) then
    insert into public.dispatch_assignments(organization_id,job_id,employee_id,vehicle_id,role,created_by)
    values(_org,_job,_operator_employee,null,'operator',_creator);
  end if;
  if _vehicle is not null and not exists(select 1 from public.dispatch_assignments where job_id=_job and vehicle_id=_vehicle) then
    insert into public.dispatch_assignments(organization_id,job_id,employee_id,vehicle_id,role,created_by)
    values(_org,_job,null,_vehicle,'unit',_creator);
  end if;
end;
$function$;

create or replace function private.provision_northborn_test_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if lower(coalesce(new.email,'')) in ('manager@test.com','operator@test.com','client@test.com') then
    perform private.ensure_northborn_test_workspace();
  end if;
  return new;
end;
$function$;

drop trigger if exists provision_northborn_test_user_after_auth on auth.users;
create trigger provision_northborn_test_user_after_auth
after insert or update of email on auth.users
for each row execute function private.provision_northborn_test_user();

select private.ensure_northborn_test_workspace();
