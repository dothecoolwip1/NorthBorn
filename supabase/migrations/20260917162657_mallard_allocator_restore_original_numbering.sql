create or replace function public.mallard_assign_sample_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated integer;
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

  if new.sample_number is not null then
    if new.sample_number < minimum_number or new.sample_number > maximum_number then
      raise exception 'Sample number % does not belong to category %', new.sample_number, new.category;
    end if;

    update public.mallard_sample_counters
    set next_number = greatest(next_number, new.sample_number + 1),
        updated_at = now()
    where category = new.category;

    return new;
  end if;

  update public.mallard_sample_counters
  set next_number = next_number + 1,
      updated_at = now()
  where category = new.category
    and next_number between minimum_number and maximum_number
  returning next_number - 1 into allocated;

  if allocated is null then
    raise exception 'No available Mallard sample numbers remain for category %', new.category;
  end if;

  new.sample_number := allocated;
  return new;
end;
$$;

revoke all on function public.mallard_assign_sample_number() from public, anon, authenticated;

update public.mallard_sample_counters c
set next_number = case c.category
  when 'non_oilfield' then greatest(1001, coalesce((select max(s.sample_number) + 1 from public.mallard_samples s where s.category = 'non_oilfield' and s.sample_number between 1001 and 1999), 1001))
  when 'oilfield' then greatest(2001, coalesce((select max(s.sample_number) + 1 from public.mallard_samples s where s.category = 'oilfield' and s.sample_number between 2001 and 2999), 2001))
  when 'odd_weird' then greatest(3001, coalesce((select max(s.sample_number) + 1 from public.mallard_samples s where s.category = 'odd_weird' and s.sample_number between 3001 and 3999), 3001))
  else c.next_number
end,
updated_at = now();

comment on function public.mallard_assign_sample_number() is 'Concurrency safe Mallard sample allocator. 1000 series is Non Oilfield, 2000 series is Oilfield, 3000 series is Odd / Weird.';
