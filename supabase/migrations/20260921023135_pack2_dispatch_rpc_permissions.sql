revoke all on function public.set_internal_job_dispatch_stage(uuid,uuid,text) from anon;
revoke all on function public.set_my_assigned_job_dispatch_stage(uuid,uuid,text) from anon;
revoke all on function public.set_internal_job_dispatch_stage(uuid,uuid,text) from public;
revoke all on function public.set_my_assigned_job_dispatch_stage(uuid,uuid,text) from public;

grant execute on function public.set_internal_job_dispatch_stage(uuid,uuid,text) to authenticated;
grant execute on function public.set_my_assigned_job_dispatch_stage(uuid,uuid,text) to authenticated;
grant execute on function public.set_internal_job_dispatch_stage(uuid,uuid,text) to service_role;
grant execute on function public.set_my_assigned_job_dispatch_stage(uuid,uuid,text) to service_role;
