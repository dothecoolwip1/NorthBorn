create or replace function public.mallard_next_classification_code(p_group_name text)
returns smallint
language plpgsql
security invoker
set search_path = public
stable
as $$
declare
  range_start integer;
  range_end integer;
  allocated_code smallint;
begin
  case btrim(p_group_name)
    when 'Non Oilfield' then
      range_start := 101;
      range_end := 198;
    when 'Oilfield' then
      range_start := 201;
      range_end := 298;
    when 'Other / Specialty' then
      range_start := 301;
      range_end := 398;
    when 'Future / Custom' then
      range_start := 400;
      range_end := 899;
    when 'System / Legacy' then
      range_start := 900;
      range_end := 999;
    else
      raise exception 'Unknown Mallard classification group: %', p_group_name;
  end case;

  select gs.candidate::smallint
  into allocated_code
  from generate_series(range_start, range_end) as gs(candidate)
  where not exists (
    select 1
    from public.mallard_classifications c
    where c.code = gs.candidate
  )
  order by gs.candidate
  limit 1;

  if allocated_code is null then
    raise exception 'No available Mallard classification codes remain in %', p_group_name;
  end if;

  return allocated_code;
end;
$$;

revoke all on function public.mallard_next_classification_code(text) from public;
grant execute on function public.mallard_next_classification_code(text) to anon, authenticated;

create or replace function public.mallard_create_classification_auto(
  p_name text,
  p_group_name text,
  p_section_name text,
  p_description text default null
)
returns public.mallard_classifications
language plpgsql
security invoker
set search_path = public
as $$
declare
  allocated_code smallint;
  created_row public.mallard_classifications%rowtype;
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'Classification name is required';
  end if;

  if nullif(btrim(p_group_name), '') is null then
    raise exception 'Classification group is required';
  end if;

  if nullif(btrim(p_section_name), '') is null then
    raise exception 'Classification section is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('mallard_classification_code_allocator'));

  allocated_code := public.mallard_next_classification_code(p_group_name);

  insert into public.mallard_classifications (
    code,
    name,
    group_name,
    section_name,
    description,
    active,
    sort_order
  )
  values (
    allocated_code,
    btrim(p_name),
    btrim(p_group_name),
    btrim(p_section_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    true,
    allocated_code
  )
  returning * into created_row;

  return created_row;
end;
$$;

revoke all on function public.mallard_create_classification_auto(text, text, text, text) from public;
grant execute on function public.mallard_create_classification_auto(text, text, text, text) to anon, authenticated;

comment on function public.mallard_next_classification_code(text) is
  'Returns the next permanently unused three digit Mallard classification code for the selected group.';

comment on function public.mallard_create_classification_auto(text, text, text, text) is
  'Creates a Mallard classification with an automatically allocated permanent three digit code.';
