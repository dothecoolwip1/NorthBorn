# Northborn Super Admin

Northborn now includes a platform-level super admin console that sits above normal tenant workspaces.

## Security model

Normal organization users keep the existing organization-scoped RLS rules. The browser never receives the Supabase service role key.

Platform-wide actions are sent to the `super-admin` Edge Function. The function:

1. Requires an authenticated Supabase user session.
2. Calls `link_platform_admin_identity()` to verify the signed-in account against `platform_admins`.
3. Uses the service role only inside the server-side Edge Function after verification succeeds.
4. Writes sensitive administrative changes to the existing `audit_logs` table.

The seeded platform administrator identity is:

`admin@northborn.link`

The migration does not create or hard-code a password. Create the confirmed Supabase Auth account separately with a strong password. On first successful login, the database function links the confirmed Auth user ID to the seeded platform administrator record.

## Files

- `supabase/migrations/20260929145000_platform_super_admin_foundation.sql`
- `supabase/functions/super-admin/index.ts`
- `src/SuperAdminPage.tsx`
- `src/super-admin.css`
- `src/main.tsx`

## What the console manages

The console currently provides:

- Global organization counts and operational totals
- Organization creation and editing
- Organization status, timezone, country, JSON settings and module controls
- Supabase Auth user creation, invitation, email/password changes, enable/disable and deletion
- Organization membership and role assignment
- Granting or revoking platform super admin access
- Subscription plan creation and editing
- Organization plan assignment, billing state, interval and seat count
- Platform-wide settings
- Global audit activity

## Deployment

Repository upload alone does not change the live database or deploy the Edge Function.

For the live Northborn Supabase project:

1. Apply the new database migration using the project's normal migration workflow.
2. Deploy the `super-admin` Edge Function with JWT verification enabled.
3. Ensure the function environment has `SUPABASE_URL`, a publishable or anon key, and `SUPABASE_SERVICE_ROLE_KEY`.
4. Optionally set `NORTHBORN_APP_URL` to the production Northborn URL for invitation redirects.
5. Create and confirm the `admin@northborn.link` Supabase Auth account.
6. Sign in. Northborn will route the account directly to the super admin console.

## Billing note

The plan catalog and organization subscription state are administrative records. They do not charge cards or create external subscriptions by themselves. A payment provider such as Stripe can be connected later without changing the platform-admin permission model.
