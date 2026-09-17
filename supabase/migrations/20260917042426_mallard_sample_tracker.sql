create table if not exists public.mallard_sample_counters (
  category text primary key check (category in ('non_oilfield','oilfield','odd_weird')),
  next_number integer not null check (next_number > 0),
  updated_at timestamptz not null default now()
);

insert into public.mallard_sample_counters (category, next_number)
values
  ('non_oilfield', 1001),
  ('oilfield', 2001),
  ('odd_weird', 3001)
on conflict (category) do nothing;

create table if not exists public.mallard_samples (
  id uuid primary key default gen_random_uuid(),
  sample_number integer unique,
  category text not null check (category in ('non_oilfield','oilfield','odd_weird')),
  status text not null default 'collected' check (status in ('collected','with_driver','received','submitted','testing','results_received','complete')),
  collected_at timestamptz not null default now(),
  location text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  customer_site text,
  job_reference text,
  description_of_work text not null,
  suspected_contents text not null,
  sample_reason text not null,
  collector_name text,
  field_notes text,
  received_at timestamptz,
  received_by text,
  lab_name text,
  lab_submission_number text,
  submitted_at timestamptz,
  results_received_at timestamptz,
  final_determination text,
  lab_notes text,
  last_updated_by text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mallard_test_results (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.mallard_samples(id) on delete cascade,
  test_name text not null,
  result_value text,
  unit text,
  qualifier text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mallard_sample_events (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.mallard_samples(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_name text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists mallard_samples_number_idx on public.mallard_samples(sample_number);
create index if not exists mallard_samples_category_idx on public.mallard_samples(category);
create index if not exists mallard_samples_status_idx on public.mallard_samples(status);
create index if not exists mallard_samples_collected_at_idx on public.mallard_samples(collected_at desc);
create index if not exists mallard_samples_search_idx on public.mallard_samples using gin (to_tsvector('english', coalesce(location,'') || ' ' || coalesce(customer_site,'') || ' ' || coalesce(description_of_work,'') || ' ' || coalesce(suspected_contents,'') || ' ' || coalesce(sample_reason,'') || ' ' || coalesce(final_determination,'')));
create index if not exists mallard_test_results_sample_idx on public.mallard_test_results(sample_id, sort_order);
create index if not exists mallard_sample_events_sample_idx on public.mallard_sample_events(sample_id, created_at desc);

create or replace function public.mallard_assign_sample_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated integer;
begin
  if new.sample_number is not null then
    return new;
  end if;

  update public.mallard_sample_counters
  set next_number = next_number + 1,
      updated_at = now()
  where category = new.category
  returning next_number - 1 into allocated;

  if allocated is null then
    raise exception 'Unknown Mallard sample category: %', new.category;
  end if;

  new.sample_number := allocated;
  return new;
end;
$$;

revoke all on function public.mallard_assign_sample_number() from public, anon, authenticated;

drop trigger if exists mallard_samples_assign_number on public.mallard_samples;
create trigger mallard_samples_assign_number
before insert on public.mallard_samples
for each row execute function public.mallard_assign_sample_number();

create or replace function public.mallard_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mallard_samples_touch_updated_at on public.mallard_samples;
create trigger mallard_samples_touch_updated_at
before update on public.mallard_samples
for each row execute function public.mallard_touch_updated_at();

drop trigger if exists mallard_test_results_touch_updated_at on public.mallard_test_results;
create trigger mallard_test_results_touch_updated_at
before update on public.mallard_test_results
for each row execute function public.mallard_touch_updated_at();

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
  end if;
  return new;
end;
$$;

drop trigger if exists mallard_samples_log_event on public.mallard_samples;
create trigger mallard_samples_log_event
after insert or update on public.mallard_samples
for each row execute function public.mallard_log_sample_event();

alter table public.mallard_sample_counters enable row level security;
alter table public.mallard_samples enable row level security;
alter table public.mallard_test_results enable row level security;
alter table public.mallard_sample_events enable row level security;

revoke all on table public.mallard_sample_counters from anon, authenticated;
revoke all on table public.mallard_samples from anon, authenticated;
revoke all on table public.mallard_test_results from anon, authenticated;
revoke all on table public.mallard_sample_events from anon, authenticated;

grant select, insert, update on table public.mallard_samples to anon, authenticated;
grant select, insert, update, delete on table public.mallard_test_results to anon, authenticated;
grant select, insert on table public.mallard_sample_events to anon, authenticated;

create policy mallard_samples_public_select on public.mallard_samples for select to anon, authenticated using (true);
create policy mallard_samples_public_insert on public.mallard_samples for insert to anon, authenticated with check (true);
create policy mallard_samples_public_update on public.mallard_samples for update to anon, authenticated using (true) with check (true);
create policy mallard_test_results_public_select on public.mallard_test_results for select to anon, authenticated using (true);
create policy mallard_test_results_public_insert on public.mallard_test_results for insert to anon, authenticated with check (true);
create policy mallard_test_results_public_update on public.mallard_test_results for update to anon, authenticated using (true) with check (true);
create policy mallard_test_results_public_delete on public.mallard_test_results for delete to anon, authenticated using (true);
create policy mallard_sample_events_public_select on public.mallard_sample_events for select to anon, authenticated using (true);
create policy mallard_sample_events_public_insert on public.mallard_sample_events for insert to anon, authenticated with check (true);
