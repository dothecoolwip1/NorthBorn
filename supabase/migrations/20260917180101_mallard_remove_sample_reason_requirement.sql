alter table public.mallard_samples
  alter column sample_reason drop not null;

comment on column public.mallard_samples.sample_reason is 'Legacy field retained for existing records; no longer collected in the Mallard field workflow.';
