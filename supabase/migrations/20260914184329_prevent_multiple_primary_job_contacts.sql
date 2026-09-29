create unique index if not exists job_contacts_one_primary_per_job_idx
on public.job_contacts(job_id)
where is_primary=true;