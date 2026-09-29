-- Northborn platform super admin foundation.
-- Keeps tenant RLS unchanged. Platform-wide mutations are performed by the
-- authenticated super-admin Edge Function using a server-side service role.

create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  email text not null,
  display_name text,
  status text not null default 'active' check (status in ('active','disabled')),
  permissions jsonb not null default '{"all":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_admins_email_key
  on public.platform_admins (lower(email));

create table if not exists public.platform_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  annual_price_cents integer not null default 0 check (annual_price_cents >= 0),
  currency text not null default 'CAD',
  active boolean not null default true,
  sort_order integer not null default 100,
  features jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  provider_monthly_price_id text,
  provider_annual_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_id uuid references public.platform_plans(id) on delete set null,
  status text not null default 'active'
    check (status in ('trialing','active','past_due','paused','cancelled')),
  billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly','annual','custom')),
  seats integer not null default 1 check (seats > 0),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  notes text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  key text primary key,
  label text not null,
  description text,
  category text not null default 'general',
  value jsonb not null default 'null'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.platform_plans enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.platform_settings enable row level security;

revoke all on public.platform_admins from anon, authenticated;
revoke all on public.platform_plans from anon, authenticated;
revoke all on public.organization_subscriptions from anon, authenticated;
revoke all on public.platform_settings from anon, authenticated;

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.platform_admins pa
      where pa.status = 'active'
        and (
          pa.user_id = (select auth.uid())
          or exists (
            select 1
            from auth.users au
            where au.id = (select auth.uid())
              and au.email_confirmed_at is not null
              and lower(coalesce(au.email, '')) = lower(pa.email)
          )
        )
    );
$$;

revoke all on function public.is_platform_super_admin() from public, anon;
grant execute on function public.is_platform_super_admin() to authenticated;

create or replace function public.link_platform_admin_identity()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  _uid uuid := (select auth.uid());
  _email text;
begin
  if _uid is null then
    return false;
  end if;

  select lower(coalesce(email, ''))
    into _email
  from auth.users
  where id = _uid
    and email_confirmed_at is not null;

  if coalesce(_email, '') = '' then
    return false;
  end if;

  update public.platform_admins
     set user_id = coalesce(user_id, _uid),
         updated_at = now()
   where status = 'active'
     and lower(email) = _email
     and (user_id is null or user_id = _uid);

  return public.is_platform_super_admin();
end;
$$;

revoke all on function public.link_platform_admin_identity() from public, anon;
grant execute on function public.link_platform_admin_identity() to authenticated;

insert into public.platform_admins (email, display_name, status, permissions)
select 'admin@northborn.link', 'Northborn Super Admin', 'active', '{"all":true}'::jsonb
where not exists (
  select 1 from public.platform_admins where lower(email) = 'admin@northborn.link'
);

insert into public.platform_plans
  (code, name, description, monthly_price_cents, annual_price_cents, currency, active, sort_order, features, limits)
values
  ('free', 'Free', 'Base Northborn access. Configure limits before public launch.', 0, 0, 'CAD', true, 10,
    '["Core workspace"]'::jsonb, '{"users":3}'::jsonb),
  ('starter', 'Starter', 'Configurable starter plan. Pricing is intentionally unset.', 0, 0, 'CAD', false, 20,
    '["Core operations","Dispatch","Fleet"]'::jsonb, '{}'::jsonb),
  ('professional', 'Professional', 'Configurable professional plan. Pricing is intentionally unset.', 0, 0, 'CAD', false, 30,
    '["Core operations","Advanced reporting","Safety","Billing"]'::jsonb, '{}'::jsonb),
  ('enterprise', 'Enterprise', 'Custom commercial terms for larger organizations.', 0, 0, 'CAD', false, 40,
    '["All modules","Custom support"]'::jsonb, '{}'::jsonb)
on conflict (code) do nothing;

insert into public.organization_subscriptions (organization_id, plan_id, status, billing_interval)
select o.id, p.id, 'active', 'monthly'
from public.organizations o
cross join public.platform_plans p
where p.code = 'free'
  and not exists (
    select 1
    from public.organization_subscriptions s
    where s.organization_id = o.id
  );

insert into public.platform_settings (key, label, description, category, value)
values
  ('product_name', 'Product name', 'Display name used by Northborn platform services.', 'general', '"Northborn"'::jsonb),
  ('support_email', 'Support email', 'Platform support contact.', 'general', '"admin@northborn.link"'::jsonb),
  ('default_currency', 'Default currency', 'Default billing currency.', 'billing', '"CAD"'::jsonb),
  ('allow_self_signup', 'Allow self signup', 'Whether public self registration should be offered.', 'auth', 'true'::jsonb),
  ('maintenance_mode', 'Maintenance mode', 'Platform-wide maintenance flag for future enforcement.', 'operations', 'false'::jsonb)
on conflict (key) do nothing;

comment on table public.platform_admins is
  'Northborn platform administrators. No direct browser access; checked by server-side authorization.';
comment on table public.platform_plans is
  'Northborn subscription plan definitions managed by platform super admins.';
comment on table public.organization_subscriptions is
  'Current Northborn plan assignment and billing state for each tenant.';
comment on table public.platform_settings is
  'Platform-wide configurable settings managed by Northborn super admins.';
