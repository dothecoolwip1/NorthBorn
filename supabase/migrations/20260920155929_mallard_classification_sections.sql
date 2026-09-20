alter table public.mallard_classifications
  add column if not exists section_name text;

update public.mallard_classifications
set section_name = case code
  when 101 then 'Sumps & Wastewater'
  when 102 then 'Wastewater & Septic'
  when 103 then 'Sumps & Wastewater'
  when 104 then 'Hydrovac & Excavation'
  when 199 then 'Unclassified'
  when 201 then 'Tanks & Vessels'
  when 202 then 'Cementing & Completions'
  when 203 then 'Production Fluids'
  when 204 then 'Cementing & Completions'
  when 299 then 'Unclassified'
  when 301 then 'Petroleum Products'
  when 302 then 'Petroleum Products'
  when 399 then 'Unclassified'
  else coalesce(nullif(btrim(section_name), ''), 'General')
end
where section_name is null or btrim(section_name) = '';

alter table public.mallard_classifications
  alter column section_name set default 'General',
  alter column section_name set not null;

alter table public.mallard_classifications
  drop constraint if exists mallard_classifications_section_name_check,
  add constraint mallard_classifications_section_name_check
    check (char_length(btrim(section_name)) between 2 and 100);

comment on column public.mallard_classifications.section_name is
  'UI grouping within the top-level classification group. Used by the Category > Section > Sample Type picker.';
