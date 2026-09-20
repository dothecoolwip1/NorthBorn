-- Mallard CCC-NNNN classification, reusable site, deletion audit, and QR identity foundation.

create table if not exists public.mallard_classifications (
  code smallint primary key check (code between 100 and 999),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  group_name text not null check (char_length(btrim(group_name)) between 2 and 80),
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.mallard_classifications (code, name, group_name, sort_order)
values
  (101, 'Car Wash Sump', 'Non Oilfield', 101),
  (102, 'Septic', 'Non Oilfield', 102),
  (103, 'Shop Sump', 'Non Oilfield', 103),
  (104, 'Hydrovac Mud', 'Non Oilfield', 104),
  (199, 'Legacy / Unclassified Non Oilfield', 'Non Oilfield', 199),
  (201, 'Tank Bottoms', 'Oilfield', 201),
  (202, 'Cement Squeeze', 'Oilfield', 202),
  (203, 'Produced Water', 'Oilfield', 203),
  (204, 'Frac Sand / Frac Waste', 'Oilfield', 204),
  (299, 'Legacy / Unclassified Oilfield', 'Oilfield', 299),
  (301, 'Refined Oils', 'Other / Specialty', 301),
  (302, 'Fuels', 'Other / Specialty', 302),
  (399, 'Legacy / Unclassified Other', 'Other / Specialty', 399)
on conflict (code) do nothing;

create or replace function public.mallard_protect_classification_code()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Mallard classification codes are permanent. Disable the classification instead of deleting it.';
  end if;
  if new.code is distinct from old.code then
    raise exception 'Mallard classification codes cannot be changed once created.';
  end if;
  return new;
end;
$$;

drop trigger if exists mallard_classifications_protect_code on public.mallard_classifications;
create trigger mallard_classifications_protect_code
before update or delete on public.mallard_classifications
for each row execute function public.mallard_protect_classification_code();

drop trigger if exists mallard_classifications_touch_updated_at on public.mallard_classifications;
create trigger mallard_classifications_touch_updated_at
before update on public.mallard_classifications
for each row execute function public.mallard_touch_updated_at();

alter table public.mallard_classifications enable row level security;
revoke all on table public.mallard_classifications from anon, authenticated;
grant select, insert, update on table public.mallard_classifications to anon, authenticated;

drop policy if exists mallard_classifications_public_select on public.mallard_classifications;
create policy mallard_classifications_public_select on public.mallard_classifications
for select to anon, authenticated using (true);

drop policy if exists mallard_classifications_public_insert on public.mallard_classifications;
create policy mallard_classifications_public_insert on public.mallard_classifications
for insert to anon, authenticated with check (true);

drop policy if exists mallard_classifications_public_update on public.mallard_classifications;
create policy mallard_classifications_public_update on public.mallard_classifications
for update to anon, authenticated using (true) with check (true);

create table if not exists public.mallard_sites (
  id uuid primary key default gen_random_uuid(),
  customer text,
  site_name text not null check (char_length(btrim(site_name)) between 1 and 180),
  lsd text,
  uwi text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  access_directions text,
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

drop trigger if exists mallard_sites_touch_updated_at on public.mallard_sites;
create trigger mallard_sites_touch_updated_at
before update on public.mallard_sites
for each row execute function public.mallard_touch_updated_at();

alter table public.mallard_sites enable row level security;
revoke all on table public.mallard_sites from anon, authenticated;
grant select, insert, update on table public.mallard_sites to anon, authenticated;

drop policy if exists mallard_sites_public_select on public.mallard_sites;
create policy mallard_sites_public_select on public.mallard_sites
for select to anon, authenticated using (true);

drop policy if exists mallard_sites_public_insert on public.mallard_sites;
create policy mallard_sites_public_insert on public.mallard_sites
for insert to anon, authenticated with check (true);

drop policy if exists mallard_sites_public_update on public.mallard_sites;
create policy mallard_sites_public_update on public.mallard_sites
for update to anon, authenticated using (true) with check (true);

alter table public.mallard_samples
  add column if not exists classification_code smallint,
  add column if not exists sequence_number integer,
  add column if not exists sample_code text,
  add column if not exists site_id uuid,
  add column if not exists confirmed_material text;

alter table public.mallard_samples
  drop constraint if exists mallard_samples_classification_code_fkey,
  add constraint mallard_samples_classification_code_fkey
    foreign key (classification_code) references public.mallard_classifications(code);

alter table public.mallard_samples
  drop constraint if exists mallard_samples_site_id_fkey,
  add constraint mallard_samples_site_id_fkey
    foreign key (site_id) references public.mallard_sites(id) on delete set null;

alter table public.mallard_samples
  drop constraint if exists mallard_samples_sequence_number_check,
  add constraint mallard_samples_sequence_number_check
    check (sequence_number is null or sequence_number between 1 and 9999);

insert into public.mallard_sites (customer, site_name, lsd)
select distinct
  nullif(btrim(s.customer_site), ''),
  btrim(s.location),
  case when btrim(s.location) ~* '^[0-9]{1,2}-[0-9]{1,2}-[0-9]{1,3}-[0-9]{1,2}W[1-6]$'
    then btrim(s.location) else null end
from public.mallard_samples s
where nullif(btrim(s.location), '') is not null
  and not exists (
    select 1 from public.mallard_sites ms
    where coalesce(ms.customer, '') = coalesce(nullif(btrim(s.customer_site), ''), '')
      and ms.site_name = btrim(s.location)
  );

update public.mallard_samples s
set site_id = ms.id
from public.mallard_sites ms
where s.site_id is null
  and coalesce(ms.customer, '') = coalesce(nullif(btrim(s.customer_site), ''), '')
  and ms.site_name = btrim(s.location);

with ranked as (
  select id,
    case
      when category = 'non_oilfield' then 199
      when category = 'oilfield' and lower(coalesce(suspected_contents, '')) like '%frac sand%' then 204
      when category = 'oilfield' then 299
      else 399
    end as new_code,
    row_number() over (
      partition by case
        when category = 'non_oilfield' then 199
        when category = 'oilfield' and lower(coalesce(suspected_contents, '')) like '%frac sand%' then 204
        when category = 'oilfield' then 299
        else 399
      end
      order by created_at, id
    ) as new_sequence
  from public.mallard_samples
  where classification_code is null
)
update public.mallard_samples s
set classification_code = r.new_code,
    sequence_number = r.new_sequence,
    sample_code = lpad(r.new_code::text, 3, '0') || '-' || lpad(r.new_sequence::text, 4, '0'),
    confirmed_material = coalesce(s.confirmed_material, s.final_determination)
from ranked r
where s.id = r.id;

alter table public.mallard_samples
  alter column classification_code set not null,
  alter column sequence_number set not null,
  alter column sample_code set not null;

create unique index if not exists mallard_samples_sample_code_uidx on public.mallard_samples(sample_code);
create unique index if not exists mallard_samples_classification_sequence_uidx on public.mallard_samples(classification_code, sequence_number);
create index if not exists mallard_samples_site_id_idx on public.mallard_samples(site_id);
create index if not exists mallard_samples_classification_code_idx on public.mallard_samples(classification_code, collected_at desc);

create table if not exists public.mallard_deleted_sample_history (
  id uuid primary key default gen_random_uuid(),
  original_sample_id uuid not null,
  sample_code text not null,
  classification_code smallint not null,
  sequence_number integer not null,
  legacy_sample_number integer,
  category text,
  deleted_by text,
  deleted_at timestamptz not null default now(),
  snapshot jsonb not null
);

create index if not exists mallard_deleted_history_sample_code_idx
  on public.mallard_deleted_sample_history(sample_code, deleted_at desc);

alter table public.mallard_deleted_sample_history enable row level security;
revoke all on table public.mallard_deleted_sample_history from anon, authenticated;
grant select on table public.mallard_deleted_sample_history to anon, authenticated;

drop policy if exists mallard_deleted_history_public_select on public.mallard_deleted_sample_history;
create policy mallard_deleted_history_public_select on public.mallard_deleted_sample_history
for select to anon, authenticated using (true);

create or replace function public.mallard_log_deleted_sample()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mallard_deleted_sample_history (
    original_sample_id, sample_code, classification_code, sequence_number,
    legacy_sample_number, category, deleted_by, snapshot
  )
  values (
    old.id, old.sample_code, old.classification_code, old.sequence_number,
    old.sample_number, old.category, old.last_updated_by, to_jsonb(old)
  );
  return old;
end;
$$;

revoke all on function public.mallard_log_deleted_sample() from public, anon, authenticated;

drop trigger if exists mallard_samples_log_delete_history on public.mallard_samples;
create trigger mallard_samples_log_delete_history
before delete on public.mallard_samples
for each row execute function public.mallard_log_deleted_sample();

create or replace function public.mallard_assign_sample_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated_sequence integer;
  legacy_allocated integer;
  legacy_minimum integer;
  legacy_maximum integer;
  resolved_category text;
begin
  if new.classification_code is null then
    new.classification_code := case new.category
      when 'non_oilfield' then 199
      when 'oilfield' then 299
      else 399
    end;
  end if;

  perform 1
  from public.mallard_classifications c
  where c.code = new.classification_code
    and c.active = true
  for update;

  if not found then
    raise exception 'Unknown or disabled Mallard classification code: %', new.classification_code;
  end if;

  resolved_category := case
    when new.classification_code between 100 and 199 then 'non_oilfield'
    when new.classification_code between 200 and 299 then 'oilfield'
    else 'odd_weird'
  end;
  new.category := resolved_category;

  if new.sequence_number is null then
    select gs.candidate into allocated_sequence
    from generate_series(1, 9999) as gs(candidate)
    where not exists (
      select 1 from public.mallard_samples s
      where s.classification_code = new.classification_code
        and s.sequence_number = gs.candidate
    )
    order by gs.candidate
    limit 1;

    if allocated_sequence is null then
      raise exception 'No available Mallard sample numbers remain for classification %', new.classification_code;
    end if;
    new.sequence_number := allocated_sequence;
  end if;

  new.sample_code := lpad(new.classification_code::text, 3, '0')
    || '-' || lpad(new.sequence_number::text, 4, '0');

  if new.sample_number is null then
    legacy_minimum := case resolved_category
      when 'non_oilfield' then 1001
      when 'oilfield' then 2001
      else 3001
    end;
    legacy_maximum := legacy_minimum + 998;

    select gs.candidate into legacy_allocated
    from generate_series(legacy_minimum, legacy_maximum) as gs(candidate)
    where not exists (
      select 1 from public.mallard_samples s where s.sample_number = gs.candidate
    )
    order by gs.candidate
    limit 1;

    new.sample_number := legacy_allocated;
  end if;

  return new;
end;
$$;

revoke all on function public.mallard_assign_sample_number() from public, anon, authenticated;

create or replace function public.mallard_protect_sample_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.sample_number is distinct from old.sample_number then
    raise exception 'Mallard legacy sample number is permanent once assigned';
  end if;
  if new.sample_code is distinct from old.sample_code then
    raise exception 'Mallard sample code is permanent once assigned';
  end if;
  if new.classification_code is distinct from old.classification_code then
    raise exception 'Mallard sample classification is permanent once assigned';
  end if;
  if new.sequence_number is distinct from old.sequence_number then
    raise exception 'Mallard sample sequence is permanent once assigned';
  end if;
  if new.category is distinct from old.category then
    raise exception 'Mallard sample category is permanent once assigned';
  end if;
  return new;
end;
$$;

create or replace function public.mallard_get_classification_numbers()
returns table(
  classification_code smallint,
  classification_name text,
  group_name text,
  next_sequence integer,
  next_sample_code text
)
language sql
security invoker
set search_path = public
stable
as $$
  select c.code, c.name, c.group_name,
    (
      select gs.candidate
      from generate_series(1, 9999) as gs(candidate)
      where not exists (
        select 1 from public.mallard_samples s
        where s.classification_code = c.code
          and s.sequence_number = gs.candidate
      )
      order by gs.candidate limit 1
    ) as next_sequence,
    lpad(c.code::text, 3, '0') || '-' || lpad((
      select gs.candidate
      from generate_series(1, 9999) as gs(candidate)
      where not exists (
        select 1 from public.mallard_samples s
        where s.classification_code = c.code
          and s.sequence_number = gs.candidate
      )
      order by gs.candidate limit 1
    )::text, 4, '0') as next_sample_code
  from public.mallard_classifications c
  where c.active = true
  order by c.sort_order, c.code;
$$;

revoke all on function public.mallard_get_classification_numbers() from public;
grant execute on function public.mallard_get_classification_numbers() to anon, authenticated;

create or replace function public.mallard_log_sample_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.mallard_sample_events (sample_id, event_type, to_status, actor_name, note)
    values (new.id, 'created', new.status, new.collector_name, 'Sample record created as ' || new.sample_code);
  elsif old.status is distinct from new.status then
    insert into public.mallard_sample_events (sample_id, event_type, from_status, to_status, actor_name, note)
    values (new.id, 'status_change', old.status, new.status, new.last_updated_by, 'Sample status updated');
  elsif old.archived is distinct from new.archived then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, case when new.archived then 'archived' else 'restored' end, new.last_updated_by,
      case when new.archived then 'Sample archived; number remains reserved' else 'Sample restored' end);
  elsif row(old.lab_name, old.lab_submission_number, old.submitted_at, old.results_received_at,
            old.confirmed_material, old.final_determination, old.lab_notes, old.received_at, old.received_by)
        is distinct from
        row(new.lab_name, new.lab_submission_number, new.submitted_at, new.results_received_at,
            new.confirmed_material, new.final_determination, new.lab_notes, new.received_at, new.received_by) then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, 'lab_update', new.last_updated_by, 'Mallard or lab information updated');
  elsif row(old.disposal_destination, old.disposed_at, old.disposal_notes)
        is distinct from row(new.disposal_destination, new.disposed_at, new.disposal_notes) then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, 'disposal_update', new.last_updated_by, 'Disposal information updated');
  elsif row(old.collected_at, old.location, old.customer_site, old.site_id, old.description_of_work,
            old.suspected_contents, old.sample_reason, old.collector_name, old.field_notes, old.sample_matrix, old.priority)
        is distinct from
        row(new.collected_at, new.location, new.customer_site, new.site_id, new.description_of_work,
            new.suspected_contents, new.sample_reason, new.collector_name, new.field_notes, new.sample_matrix, new.priority) then
    insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
    values (new.id, 'field_update', new.last_updated_by, 'Field information updated');
  end if;
  return new;
end;
$$;

comment on column public.mallard_samples.sample_number is
  'Legacy integer number retained for backwards compatibility. Official bottle ID is sample_code.';
comment on column public.mallard_samples.sample_code is
  'Official human-readable Mallard bottle ID in CCC-NNNN format.';
comment on column public.mallard_samples.classification_code is
  'Permanent three-digit material classification code.';
comment on column public.mallard_samples.sequence_number is
  'Four-digit sequence within the classification. Deleted rows release the sequence; archived rows remain reserved.';
comment on column public.mallard_samples.confirmed_material is
  'Material confirmed after lab review. Suspected material remains stored separately in suspected_contents.';
