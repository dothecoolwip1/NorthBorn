revoke execute on function public.get_my_customer_jobs(uuid) from anon, public;
revoke execute on function public.save_my_customer_job_note(uuid,uuid,text) from anon, public;
revoke execute on function public.set_my_customer_job_contact(uuid,uuid,uuid) from anon, public;
revoke execute on function public.get_my_customer_job_requests(uuid) from anon, public;
revoke execute on function public.create_my_customer_job_request(uuid,text,timestamptz,text,text,uuid,text) from anon, public;

grant execute on function public.get_my_customer_jobs(uuid) to authenticated;
grant execute on function public.save_my_customer_job_note(uuid,uuid,text) to authenticated;
grant execute on function public.set_my_customer_job_contact(uuid,uuid,uuid) to authenticated;
grant execute on function public.get_my_customer_job_requests(uuid) to authenticated;
grant execute on function public.create_my_customer_job_request(uuid,text,timestamptz,text,text,uuid,text) to authenticated;
