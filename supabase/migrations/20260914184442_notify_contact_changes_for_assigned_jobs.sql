do $$ begin
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='job_contacts'
  ) then alter publication supabase_realtime add table public.job_contacts; end if;
  if not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='customer_contacts'
  ) then alter publication supabase_realtime add table public.customer_contacts; end if;
end $$;