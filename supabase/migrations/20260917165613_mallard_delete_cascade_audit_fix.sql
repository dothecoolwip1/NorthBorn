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

  -- When a sample is permanently deleted, ON DELETE CASCADE removes its test
  -- rows after the parent row is gone. Skip the child audit insert because the
  -- sample history is being deleted in the same operation.
  if not exists (select 1 from public.mallard_samples where id = sid) then
    return coalesce(new, old);
  end if;

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
