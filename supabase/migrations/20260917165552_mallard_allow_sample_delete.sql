grant delete on table public.mallard_samples to anon, authenticated;

drop policy if exists mallard_samples_public_delete on public.mallard_samples;
create policy mallard_samples_public_delete
on public.mallard_samples
for delete
to anon, authenticated
using (true);

comment on policy mallard_samples_public_delete on public.mallard_samples is 'Temporary no-login Mallard tracker: permits permanent deletion of a sample after client-side confirmation. Related test results and history rows cascade with the sample.';
