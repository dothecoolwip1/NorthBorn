insert into public.user_notifications (
  organization_id,
  recipient_user_id,
  notification_type,
  title,
  message,
  entity_type,
  entity_id,
  payload,
  created_at
)
select distinct
  j.organization_id,
  om.user_id,
  'job_completed',
  'Job completed',
  concat(j.job_number, ' · ', j.title, case when c.name is not null then concat(' for ', c.name) else '' end),
  'job',
  j.id,
  jsonb_build_object(
    'job_id', j.id,
    'job_number', j.job_number,
    'job_title', j.title,
    'customer_name', c.name,
    'site_name', j.site_name,
    'site_address', j.site_address,
    'completed_at', j.completed_at,
    'completed_by', j.completed_by
  ),
  coalesce(j.completed_at, j.updated_at, now())
from public.jobs j
join public.organization_members om on om.organization_id = j.organization_id and om.status = 'active'
join public.membership_roles mr on mr.membership_id = om.id
join public.roles r on r.id = mr.role_id and r.key in ('owner','admin')
left join public.customers c on c.id = j.customer_id and c.organization_id = j.organization_id
where j.status = 'completed'
  and not exists (
    select 1
    from public.user_notifications n
    where n.organization_id = j.organization_id
      and n.recipient_user_id = om.user_id
      and n.notification_type = 'job_completed'
      and n.entity_type = 'job'
      and n.entity_id = j.id
  );
