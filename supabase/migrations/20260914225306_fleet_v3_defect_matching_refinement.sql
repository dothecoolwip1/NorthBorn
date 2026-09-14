create or replace function private.normalize_defect_text(_text text)
returns text
language sql
immutable
set search_path=''
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(lower(coalesce(_text,'')), '\m(lf|driver front|drivers front)\M', ' left front ', 'g'),
                    '\m(rf|passenger front|passengers front)\M', ' right front ', 'g'),
                  '\m(lr|driver rear|drivers rear)\M', ' left rear ', 'g'),
                '\m(rr|passenger rear|passengers rear)\M', ' right rear ', 'g'),
              '\m(driver|drivers|driver''s)\M', ' left ', 'g'),
            '\m(passenger|passengers|passenger''s)\M', ' right ', 'g'),
          '\m(cracked|cracking)\M', ' crack ', 'g'),
        '\m(leaking|leaked)\M', ' leak ', 'g'),
      '[^a-z0-9]+',' ','g'),
    '\s+',' ','g'));
$$;

create or replace function public.find_similar_fleet_defect(_organization_id uuid,_vehicle_id uuid,_title text,_description text default null)
returns table(defect_id uuid,title text,description text,severity text,out_of_service boolean,report_count integer,similarity_score real)
language sql
stable
security definer
set search_path=''
as $$
  with input as (
    select private.normalize_defect_text(coalesce(_title,'')||' '||coalesce(_description,'')) as txt
  ), candidate as (
    select d.*,
      private.normalize_defect_text(coalesce(d.title,'')||' '||coalesce(d.description,'')) as normalized,
      greatest(
        extensions.similarity(private.normalize_defect_text(d.title), private.normalize_defect_text(_title)),
        extensions.similarity(private.normalize_defect_text(coalesce(d.description,'')), private.normalize_defect_text(coalesce(_description,_title))),
        extensions.similarity(private.normalize_defect_text(coalesce(d.title,'')||' '||coalesce(d.description,'')), (select txt from input))
      )::real as score
    from public.fleet_defects d
    where d.organization_id=_organization_id
      and d.vehicle_id=_vehicle_id
      and d.status not in ('resolved','dismissed')
  )
  select c.id,c.title,c.description,c.severity,c.out_of_service,c.report_count,c.score
  from candidate c,input i
  where c.score >= .32
    and not ((c.normalized ~ '\mleft\M' and i.txt ~ '\mright\M') or (c.normalized ~ '\mright\M' and i.txt ~ '\mleft\M'))
    and not ((c.normalized ~ '\mfront\M' and i.txt ~ '\mrear\M') or (c.normalized ~ '\mrear\M' and i.txt ~ '\mfront\M'))
    and (private.has_org_permission(_organization_id,'fleet.edit') or (private.has_org_permission(_organization_id,'fleet.assigned.view') and private.employee_can_access_vehicle(_vehicle_id,_organization_id)))
  order by c.score desc,c.last_reported_at desc nulls last
  limit 1;
$$;

revoke all on function public.find_similar_fleet_defect(uuid,uuid,text,text) from public,anon;
grant execute on function public.find_similar_fleet_defect(uuid,uuid,text,text) to authenticated,service_role;