create or replace function public.mallard_protect_sample_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.sample_number is distinct from old.sample_number then
    raise exception 'Mallard sample number is permanent once assigned';
  end if;
  if new.category is distinct from old.category then
    raise exception 'Mallard sample category is permanent once its number is assigned';
  end if;
  return new;
end;
$$;

drop trigger if exists mallard_samples_protect_identity on public.mallard_samples;
create trigger mallard_samples_protect_identity
before update on public.mallard_samples
for each row execute function public.mallard_protect_sample_identity();

create or replace function public.mallard_log_sample_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.mallard_sample_events (sample_id, event_type, to_status, actor_name, note)
    values (new.id, 'created', new.status, new.collector_name, 'Sample record created');
  elsif old.status is distinct from new.status then
    insert into public.mallard_sample_events (sample_id, event_type, from_status, to_status, actor_name, note)
    values (new.id, 'status_change', old.status, new.status, new.last_updated_by, 'Sample status updated');
  elsif old.archived is distinct from new.archived then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, case when new.archived then 'archived' else 'restored' end, new.last_updated_by, case when new.archived then 'Sample archived' else 'Sample restored' end);
  elsif row(old.lab_name, old.lab_submission_number, old.submitted_at, old.results_received_at, old.final_determination, old.lab_notes, old.received_at, old.received_by)
        is distinct from
        row(new.lab_name, new.lab_submission_number, new.submitted_at, new.results_received_at, new.final_determination, new.lab_notes, new.received_at, new.received_by) then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, 'lab_update', new.last_updated_by, 'Mallard or lab information updated');
  elsif row(old.disposal_destination, old.disposed_at, old.disposal_reference, old.disposal_notes)
        is distinct from
        row(new.disposal_destination, new.disposed_at, new.disposal_reference, new.disposal_notes) then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, 'disposal_update', new.last_updated_by, 'Disposal information updated');
  elsif row(old.collected_at, old.location, old.latitude, old.longitude, old.customer_site, old.job_reference, old.description_of_work, old.suspected_contents, old.sample_reason, old.collector_name, old.field_notes, old.sample_matrix, old.priority, old.container_notes)
        is distinct from
        row(new.collected_at, new.location, new.latitude, new.longitude, new.customer_site, new.job_reference, new.description_of_work, new.suspected_contents, new.sample_reason, new.collector_name, new.field_notes, new.sample_matrix, new.priority, new.container_notes) then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, 'field_update', new.last_updated_by, 'Field information updated');
  end if;
  return new;
end;
$$;

revoke all on function public.mallard_log_sample_event() from public, anon, authenticated;
revoke insert on table public.mallard_sample_events from anon, authenticated;

create or replace function public.mallard_log_test_result_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
  label text;
begin
  sid := coalesce(new.sample_id, old.sample_id);
  label := coalesce(new.test_name, old.test_name, 'Lab test');
  insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
  values (
    sid,
    case tg_op when 'INSERT' then 'test_added' when 'UPDATE' then 'test_updated' else 'test_removed' end,
    null,
    label || case tg_op when 'INSERT' then ' added' when 'UPDATE' then ' updated' else ' removed' end
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.mallard_log_test_result_event() from public, anon, authenticated;

drop trigger if exists mallard_test_results_log_event on public.mallard_test_results;
create trigger mallard_test_results_log_event
after insert or update or delete on public.mallard_test_results
for each row execute function public.mallard_log_test_result_event();

comment on function public.mallard_protect_sample_identity() is 'Prevents browser clients from changing permanent Mallard sample numbers or their numbering category after creation.';
