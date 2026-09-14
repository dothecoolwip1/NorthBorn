revoke execute on function public.create_organization_invite(uuid,text,text) from anon;
revoke execute on function public.revoke_organization_invite(uuid) from anon;
revoke execute on function public.accept_organization_invite(uuid) from anon;

grant execute on function public.create_organization_invite(uuid,text,text) to authenticated;
grant execute on function public.revoke_organization_invite(uuid) to authenticated;
grant execute on function public.accept_organization_invite(uuid) to authenticated;

grant execute on function public.get_organization_invite_details(uuid) to anon, authenticated;
