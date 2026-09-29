alter table public.organization_invites
  add column if not exists delivery_status text not null default 'not_attempted' check (delivery_status in ('not_attempted','sent','failed')),
  add column if not exists delivery_error text,
  add column if not exists delivery_attempted_at timestamptz;

create index if not exists organization_invites_delivery_status_idx
  on public.organization_invites(organization_id, delivery_status, created_at desc);