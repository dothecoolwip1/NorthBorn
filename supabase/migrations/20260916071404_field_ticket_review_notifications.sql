create or replace function private.notify_field_ticket_status()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  _customer_name text;
  _job_number text;
  _title text;
  _message text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select c.name into _customer_name from public.customers c where c.id=new.customer_id;
  select j.job_number into _job_number from public.jobs j where j.id=new.job_id;

  if new.status='submitted' then
    _title := 'Field ticket ready for review';
    _message := new.ticket_number || ' for ' || coalesce(_customer_name,'a customer') || coalesce(' · '||_job_number,'') || ' was submitted.';
    insert into public.user_notifications(organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload)
    select distinct new.organization_id,m.user_id,'ticket_submitted',_title,_message,'field_ticket',new.id,
      jsonb_build_object('ticket_number',new.ticket_number,'job_id',new.job_id,'customer_id',new.customer_id,'status',new.status)
    from public.organization_members m
    join public.membership_roles mr on mr.membership_id=m.id
    join public.role_permissions rp on rp.role_id=mr.role_id and rp.permission_key='tickets.manage'
    where m.organization_id=new.organization_id and m.status='active' and m.user_id<>new.created_by;
  elsif new.status in ('approved','rejected') then
    _title := case when new.status='approved' then 'Field ticket approved' else 'Field ticket returned' end;
    _message := case when new.status='approved'
      then new.ticket_number || ' was approved.'
      else new.ticket_number || ' was returned for changes.' || case when nullif(trim(coalesce(new.review_note,'')),'') is not null then ' '||trim(new.review_note) else '' end
    end;
    if new.created_by is not null and new.created_by<>coalesce(new.reviewed_by,'00000000-0000-0000-0000-000000000000'::uuid) then
      insert into public.user_notifications(organization_id,recipient_user_id,notification_type,title,message,entity_type,entity_id,payload)
      values(new.organization_id,new.created_by,'ticket_'||new.status,_title,_message,'field_ticket',new.id,
        jsonb_build_object('ticket_number',new.ticket_number,'job_id',new.job_id,'customer_id',new.customer_id,'status',new.status,'review_note',new.review_note));
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists field_ticket_status_notifications on public.field_tickets;
create trigger field_ticket_status_notifications
after update of status on public.field_tickets
for each row execute function private.notify_field_ticket_status();
