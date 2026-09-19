create or replace function public.mallard_assign_sample_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated integer;
  next_available integer;
  minimum_number integer;
  maximum_number integer;
begin
  minimum_number := case new.category
    when 'non_oilfield' then 1001
    when 'oilfield' then 2001
    when 'odd_weird' then 3001
    else null
  end;

  maximum_number := case new.category
    when 'non_oilfield' then 1999
    when 'oilfield' then 2999
    when 'odd_weird' then 3999
    else null
  end;

  if minimum_number is null then
    raise exception 'Unknown Mallard sample category: %', new.category;
  end if;

  perform 1
  from public.mallard_sample_counters
  where category = new.category
  for update;

  if not found then
    raise exception 'Missing Mallard sample counter for category %', new.category;
  end if;

  if new.sample_number is not null then
    if new.sample_number < minimum_number or new.sample_number > maximum_number then
      raise exception 'Sample number % does not belong to category %', new.sample_number, new.category;
    end if;

    select gs.candidate
      into next_available
    from generate_series(minimum_number, maximum_number) as gs(candidate)
    where gs.candidate <> new.sample_number
      and not exists (
        select 1
        from public.mallard_samples s
        where s.sample_number = gs.candidate
      )
    order by gs.candidate
    limit 1;

    update public.mallard_sample_counters
    set next_number = coalesce(next_available, maximum_number + 1),
        updated_at = now()
    where category = new.category;

    return new;
  end if;

  select gs.candidate
    into allocated
  from generate_series(minimum_number, maximum_number) as gs(candidate)
  where not exists (
    select 1
    from public.mallard_samples s
    where s.sample_number = gs.candidate
  )
  order by gs.candidate
  limit 1;

  if allocated is null then
    raise exception 'No available Mallard sample numbers remain for category %', new.category;
  end if;

  new.sample_number := allocated;

  select gs.candidate
    into next_available
  from generate_series(minimum_number, maximum_number) as gs(candidate)
  where gs.candidate <> allocated
    and not exists (
      select 1
      from public.mallard_samples s
      where s.sample_number = gs.candidate
    )
  order by gs.candidate
  limit 1;

  update public.mallard_sample_counters
  set next_number = coalesce(next_available, maximum_number + 1),
      updated_at = now()
  where category = new.category;

  return new;
end;
$$;

revoke all on function public.mallard_assign_sample_number() from public, anon, authenticated;

create or replace function public.mallard_get_next_numbers()
returns table(category text, next_number integer)
language sql
security definer
set search_path = public
stable
as $$
  with ranges(category, minimum_number, maximum_number, sort_order) as (
    values
      ('non_oilfield'::text, 1001, 1999, 1),
      ('oilfield'::text, 2001, 2999, 2),
      ('odd_weird'::text, 3001, 3999, 3)
  )
  select
    r.category,
    (
      select gs.candidate
      from generate_series(r.minimum_number, r.maximum_number) as gs(candidate)
      where not exists (
        select 1
        from public.mallard_samples s
        where s.sample_number = gs.candidate
      )
      order by gs.candidate
      limit 1
    ) as next_number
  from ranges r
  order by r.sort_order;
$$;

revoke all on function public.mallard_get_next_numbers() from public;
grant execute on function public.mallard_get_next_numbers() to anon, authenticated;

comment on function public.mallard_assign_sample_number() is
  'Concurrency-safe Mallard allocator. Deleted sample numbers become reusable; archived sample numbers remain reserved because archived records remain in mallard_samples.';

comment on function public.mallard_get_next_numbers() is
  'Returns the lowest currently unused number in each Mallard sample series. Deleted numbers are reusable; archived numbers remain reserved.';
