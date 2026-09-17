update public.mallard_samples
set category = case
  when sample_number between 1001 and 1999 then 'oilfield'
  when sample_number between 2001 and 2999 then 'non_oilfield'
  when sample_number between 3001 and 3999 then 'odd_weird'
  else category
end
where sample_number between 1001 and 3999;

insert into public.mallard_sample_events (sample_id, event_type, actor_name, note)
select id, 'category_correction', 'System', 'Corrected numbering convention: 1000 series = Oilfield, 2000 series = Non Oilfield, 3000 series = Odd / Weird.'
from public.mallard_samples
where sample_number = 1001
  and not exists (
    select 1 from public.mallard_sample_events e
    where e.sample_id = mallard_samples.id
      and e.event_type = 'category_correction'
  );

update public.mallard_sample_counters
set next_number = case category
  when 'oilfield' then greatest(1002, coalesce((select max(sample_number) + 1 from public.mallard_samples where sample_number between 1001 and 1999), 1002))
  when 'non_oilfield' then greatest(2002, coalesce((select max(sample_number) + 1 from public.mallard_samples where sample_number between 2001 and 2999), 2002))
  when 'odd_weird' then greatest(3001, coalesce((select max(sample_number) + 1 from public.mallard_samples where sample_number between 3001 and 3999), 3001))
  else next_number
end,
updated_at = now();

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
    when 'oilfield' then 1001
    when 'non_oilfield' then 2001
    when 'odd_weird' then 3001
    else null
  end;

  maximum_number := case new.category
    when 'oilfield' then 1999
    when 'non_oilfield' then 2999
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
