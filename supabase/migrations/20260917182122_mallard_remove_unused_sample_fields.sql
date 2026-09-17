create or replace function public.mallard_log_sample_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.mallard_sample_events (sample_id, event_type, to_status, actor_name, note)
    values (new.id, 'created', new.status, new.collector_name, 'Sample record created');
  elsif old.status is distinct from new.status then
    insert into public.mallard_sample_events (sample_id, event_type, from_status, to_status, actor_name, note)
    values (new.id, 'status_change', old.status, new.status, new.last_updated_by, 'Sample status updated');
  elsif old.archived is distinct from new.archived then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (
      new.id,
      case when new.archived then 'archived' else 'restored' end,
      new.last_updated_by,
      case when new.archived then 'Sample archived' else 'Sample restored' end
    );
  elsif row(old.lab_name, old.lab_submission_number, old.submitted_at, old.results_received_at, old.final_determination, old.lab_notes, old.received_at, old.received_by)
        is distinct from
        row(new.lab_name, new.lab_submission_number, new.submitted_at, new.results_received_at, new.final_determination, new.lab_notes, new.received_at, new.received_by) then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, 'lab_update', new.last_updated_by, 'Mallard or lab information updated');
  elsif row(old.disposal_destination, old.disposed_at, old.disposal_notes)
        is distinct from
        row(new.disposal_destination, new.disposed_at, new.disposal_notes) then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, 'disposal_update', new.last_updated_by, 'Disposal information updated');
  elsif row(old.collected_at, old.location, old.customer_site, old.description_of_work, old.suspected_contents, old.sample_reason, old.collector_name, old.field_notes, old.sample_matrix, old.priority)
        is distinct from
        row(new.collected_at, new.location, new.customer_site, new.description_of_work, new.suspected_contents, new.sample_reason, new.collector_name, new.field_notes, new.sample_matrix, new.priority) then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, 'field_update', new.last_updated_by, 'Field information updated');
  end if;
  return new;
end;
$function$;

alter table public.mallard_samples
  drop column if exists latitude,
  drop column if exists longitude,
  drop column if exists job_reference,
  drop column if exists container_notes,
  drop column if exists disposal_reference;
