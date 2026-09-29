drop trigger if exists jobs_notify_assigned_operators_update on public.jobs;
drop function if exists private.notify_assigned_operators_job_update();