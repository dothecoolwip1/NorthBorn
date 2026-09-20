-- Production security hardening for Northborn.
-- Disable predictable seeded functional test access.
update public.organization_members om
set status = 'suspended',
    updated_at = now()
from auth.users u
where om.user_id = u.id
  and om.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  and lower(coalesce(u.email,'')) in ('manager@test.com','operator@test.com')
  and om.status = 'active';

update public.customer_portal_users cpu
set status = 'inactive',
    updated_at = now()
from auth.users u
where cpu.user_id = u.id
  and lower(coalesce(u.email,'')) = 'client@test.com'
  and cpu.status = 'active';

-- Keep the test workspace provisioning RPC server-only.
revoke execute on function public.ensure_northborn_test_workspace(uuid, uuid, uuid)
  from public, anon, authenticated;

-- Trigger helper functions must never be callable directly over the Data API.
revoke execute on function public.mallard_assign_sample_number()
  from public, anon, authenticated;
revoke execute on function public.mallard_bump_sample_revision()
  from public, anon, authenticated;
revoke execute on function public.mallard_log_attachment_event()
  from public, anon, authenticated;
revoke execute on function public.mallard_log_sample_event()
  from public, anon, authenticated;
revoke execute on function public.mallard_log_test_result_event()
  from public, anon, authenticated;
revoke execute on function public.mallard_protect_sample_identity()
  from public, anon, authenticated;
revoke execute on function public.mallard_touch_attachment_updated_at()
  from public, anon, authenticated;
revoke execute on function public.mallard_touch_updated_at()
  from public, anon, authenticated;

-- This read-only helper does not require elevated privileges because the
-- Mallard no-login tracker already has SELECT access to mallard_samples.
alter function public.mallard_get_next_numbers() security invoker;
alter function public.mallard_get_next_numbers() set search_path = '';
revoke execute on function public.mallard_get_next_numbers() from public;
grant execute on function public.mallard_get_next_numbers() to anon, authenticated;

comment on function public.mallard_get_next_numbers() is
  'Read-only next-number helper. SECURITY INVOKER by design; callers are limited by mallard_samples grants and RLS.';

-- These anonymous invite lookup functions intentionally remain SECURITY DEFINER
-- because they must work before authentication and expose only minimal invite
-- metadata selected by a high-entropy token or code.
revoke execute on function public.get_customer_portal_invite_by_code(text) from public;
revoke execute on function public.get_customer_portal_invite_details(uuid) from public;
revoke execute on function public.get_organization_invite_details(uuid) from public;

grant execute on function public.get_customer_portal_invite_by_code(text) to anon, authenticated;
grant execute on function public.get_customer_portal_invite_details(uuid) to anon, authenticated;
grant execute on function public.get_organization_invite_details(uuid) to anon, authenticated;
