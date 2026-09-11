# Northborn Technical Foundation

## Status

The core application foundation is established and reproducible from source control.

## Application stack

- React 19 with TypeScript
- Vite build tooling
- Supabase for PostgreSQL, authentication, storage and backend services
- React Router for application navigation
- Capacitor configuration for Android and iOS packaging
- Vercel compatible SPA routing
- GitHub Actions build verification on every push and pull request to `main`

## Architecture rules

Northborn is multi tenant from the database layer upward. Operational records belong to an organization through `organization_id`. Access is enforced in PostgreSQL with row level security instead of relying only on interface controls.

Authorization uses organization memberships, roles and permissions. System roles provide the baseline, while the model allows organization scoped roles later. Ownership protection prevents an organization from accidentally losing its last active owner.

Auditable business records use database triggers to capture changes in `audit_logs`. New operational modules should follow the same pattern instead of adding ad hoc logging in the user interface.

## Database migrations

The live Supabase project and GitHub repository currently share these migrations:

1. `20260911184615_northborn_core_foundation.sql`
2. `20260911204448_northborn_operations_vertical_slice.sql`
3. `20260911224341_foundation_foreign_key_indexes.sql`

Every future schema change must be added as a migration and committed to GitHub. Avoid making permanent schema changes only through the dashboard.

## Current core tables

- profiles
- organizations
- organization_members
- roles
- permissions
- role_permissions
- membership_roles
- organization_modules
- audit_logs
- customers
- employees
- fleet_vehicles
- jobs
- dispatch_assignments

All current public tables have row level security enabled.

## Current operational slice

The first working slice supports customers, employees, fleet units, jobs and dispatch assignments. This is intentionally the first vertical path through the system before adding the larger Safety, Tickets, Timesheets, Maintenance, Invoices and Reports modules.

## Environment configuration

The frontend expects:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Only publishable client credentials belong in the frontend. Service role keys and database passwords must never be committed to the repository or exposed through Vite environment variables.

## Testing mode

The application currently includes an isolated browser test mode for interface development. Its data is stored locally and is not a real Supabase account. It must be removed before real customer or operational data is used.

## Offline architecture

Northborn is intended to use PowerSync for selective offline first data. The application should continue sharing the same React and TypeScript business logic across browser, PWA and Capacitor builds.

PowerSync is not connected yet because the external PowerSync instance, database replication credentials and sync streams still need to be provisioned. Do not build a competing custom synchronization engine in the meantime.

The planned sync boundary should prioritize field data that genuinely needs offline access, such as assigned jobs, dispatch details, field tickets, safety forms and required reference data. Large historical datasets should remain online first unless there is a clear field requirement.

## Deployment

The GitHub repository is the source of truth. A production deployment should be generated from the same commit that passes GitHub Actions.

The current Vercel project exists, but its production domain is still pointing at an early deployment test rather than the current Northborn application. The Vercel project should be connected to `dothecoolwip1/NorthBorn`, or a verified current preview should be promoted to production. Once Git integration is established, pushes to `main` should be the normal production deployment path.

## Foundation completion checklist

Completed:

- React, TypeScript and Vite application
- Supabase project connection
- Multi tenant organization model
- Roles and permissions model
- Row level security on all current public tables
- Audit logging foundation
- First operational tables and RLS policies
- Database migrations tracked in GitHub
- Database TypeScript definitions synchronized to the live schema
- Typed Supabase client
- Foreign key performance indexes
- GitHub Actions build verification
- Capacitor configuration
- Vercel SPA routing

External setup still required:

- Connect the Vercel project to the GitHub repository or promote the verified current application deployment
- Provision the PowerSync service and sync streams before offline data synchronization is enabled
- Replace temporary interface test mode with real Supabase users before real operational data is entered
