update public.mallard_samples
set category = 'non_oilfield',
    last_updated_by = coalesce(last_updated_by, 'System correction')
where sample_number = 1001;

alter table public.mallard_samples drop constraint if exists mallard_sample_number_category_check;
alter table public.mallard_samples drop constraint if exists mallard_samples_number_category_check;

alter table public.mallard_samples
  add constraint mallard_samples_number_category_check
  check (
    (category = 'non_oilfield' and sample_number between 1001 and 1999)
    or (category = 'oilfield' and sample_number between 2001 and 2999)
    or (category = 'odd_weird' and sample_number between 3001 and 3999)
  );

update public.mallard_sample_counters c
set next_number = case c.category
  when 'non_oilfield' then greatest(1001, coalesce((select max(s.sample_number) + 1 from public.mallard_samples s where s.category = 'non_oilfield' and s.sample_number between 1001 and 1999), 1001))
  when 'oilfield' then greatest(2001, coalesce((select max(s.sample_number) + 1 from public.mallard_samples s where s.category = 'oilfield' and s.sample_number between 2001 and 2999), 2001))
  when 'odd_weird' then greatest(3001, coalesce((select max(s.sample_number) + 1 from public.mallard_samples s where s.category = 'odd_weird' and s.sample_number between 3001 and 3999), 3001))
  else c.next_number
end,
updated_at = now();

alter table public.mallard_samples add column if not exists revision integer not null default 1;
alter table public.mallard_samples add column if not exists sample_matrix text;
alter table public.mallard_samples add column if not exists priority boolean not null default false;
alter table public.mallard_samples add column if not exists container_notes text;
alter table public.mallard_samples add column if not exists disposal_destination text;
alter table public.mallard_samples add column if not exists disposed_at timestamptz;
alter table public.mallard_samples add column if not exists disposal_reference text;
alter table public.mallard_samples add column if not exists disposal_notes text;

create index if not exists mallard_samples_active_status_idx on public.mallard_samples (archived, status, collected_at desc);
create index if not exists mallard_samples_category_number_idx on public.mallard_samples (category, sample_number);
create index if not exists mallard_samples_disposal_destination_idx on public.mallard_samples (disposal_destination) where disposal_destination is not null;

create or replace function public.mallard_bump_sample_revision()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

drop trigger if exists mallard_samples_bump_revision on public.mallard_samples;
create trigger mallard_samples_bump_revision
before update on public.mallard_samples
for each row execute function public.mallard_bump_sample_revision();

create or replace function public.mallard_get_next_numbers()
returns table(category text, next_number integer)
language sql
security definer
set search_path = public
stable
as $$
  select c.category, c.next_number
  from public.mallard_sample_counters c
  order by case c.category
    when 'non_oilfield' then 1
    when 'oilfield' then 2
    when 'odd_weird' then 3
    else 4
  end;
$$;

revoke all on function public.mallard_get_next_numbers() from public;
grant execute on function public.mallard_get_next_numbers() to anon, authenticated;

create or replace function public.mallard_log_sample_event()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.mallard_sample_events (sample_id, event_type, to_status, actor_name, note)
    values (new.id, 'created', new.status, new.collector_name, 'Sample record created');
  elsif old.status is distinct from new.status then
    insert into public.mallard_sample_events (sample_id, event_type, from_status, to_status, actor_name, note)
    values (new.id, 'status_change', old.status, new.status, new.last_updated_by, 'Sample status updated');
  elsif old.category is distinct from new.category then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, 'category_change', new.last_updated_by, 'Sample category changed from ' || old.category || ' to ' || new.category);
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

comment on function public.mallard_get_next_numbers() is 'Read-only public helper for the temporary no-login Mallard tracker. Returns only the three next sample counters.';
comment on column public.mallard_samples.revision is 'Monotonic record revision for conflict awareness and auditability.';
comment on column public.mallard_samples.sample_matrix is 'Optional sample material classification such as water, soil, sludge, product or unknown.';
comment on column public.mallard_samples.disposal_destination is 'Where the sampled material was ultimately dumped or disposed, for example MROR, Secure or One Environmental.';
