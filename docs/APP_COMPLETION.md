# Northborn completion ledger

Scope: GitHub source and isolated verification only. Do not apply live migrations,
deploy, run tests against live company data, send customer messages, provision paid
services or publish to app stores. Confirmed by the user on September 29, 2026.

Historical Pack 1–7 merge labels do not establish that the entire app is ready.
Every remaining pack needs its acceptance flow and permission boundaries verified.

| Pack | Implemented and verified in this branch | Remaining |
| --- | --- | --- |
| 8 Billing | Atomic invoice saves; decimal rounding; minimum quantities; payment/credit ledger and reversals; approval before issue; stale-edit protection; print balances | Real delivery and portal acceptance; broader tenant/RLS integration; customer-specific minimums and remaining pricing rules |
| 9 Reports | Date/customer/unit filters; pagination; separate currency and credit totals; approved employee hours; maintenance/downtime; customer activity; CSV/print; mobile and role checks | Full utilization and profitability require reliable hours/cost allocation; broader report acceptance |
| 10 Offline | No competing custom sync engine added | PowerSync provisioning, datasets, attachments, conflict/retry and airplane/reconnect tests |
| 11 Devices | PWA base paths, cache ownership and update notification defaults corrected | Native projects, camera/files/share/back flows and real-device checks |
| 12 Hardening | Transaction/ledger invariants tested; test-login paths disabled by default; combined membership roles respected in routing/billing; CI no longer mutates live QA by default | Full policy audit, remaining permissions and custom-role mapping, backup recovery and production configuration |
| 13 UI | 15 internal screens checked at 390/768/1440 pixels; invoice/ticket dialog keyboard focus and named controls; calendar heading; lazy routes | All screens at phone/tablet/desktop sizes, remaining keyboard and accessibility review |
| 14 End to end | 10 regression tests plus 6 browser checks with intercepted API fixtures | Complete isolated Supabase backend; fresh-tenant dispatch → field work → billing → portal flow for every role |
| 15 Commercial | No provider assumptions or fabricated integrations | Subscription/payment/accounting/payroll providers and accounts; implementation and store releases |

## Verified findings

- Baseline version 0.14.0 / Pack 7 / PR 51. This branch prepares 0.15.1.
- Packs 6 and 7 are committed but not authorized for live rollout.
- Invoice saves previously used separate header, line-delete and line-insert calls.
  The new RPC rolls back the entire save if any step fails.
- Payments and credits use append-only settlement entries. Reversals preserve history.
  A request ID prevents duplicate payment submissions; outstanding balance is checked under an invoice lock.
- Existing paid amounts become explicitly marked opening entries; historical receipt dates are unknown.
- Drafts must be submitted and approved before issue. Edits invalidate approval;
  issued lines cannot be edited. Reviewer metadata is stamped by the database.
- Reporting distinguishes invoiced amounts, payments applied, credits and outstanding
  balances. These are invoice-date totals, not cash receipts during the selected period.
- Twenty-three missing Northborn migration files were recovered read-only from the
  project's migration history. See MIGRATION_RECOVERY.md. Full clean replay remains unverified.
- Default builds reject special functional-test login/restore/switch paths. Existing
  backend QA accounts and RPCs have not been altered in the live project.
- PR CI runs isolated tests. Live QA requires explicit workflow dispatch.
- Initial JavaScript fell from approximately 1,091 KB to 564 KB before compression;
  the build still reports its 500 KB chunk warning.

## Rollout gate

Do not deploy 0.15.1 until a complete isolated backend has validated the migration
chain, including Packs 6/7 and all four new migrations through
`20260929115333_price_minimum_quantities.sql`. The frontend requires the new RPC,
ledger, approval fields and minimum quantities. Verify migration history aliases
before applying anything; recovered historical files must not be reapplied blindly.

The app-completion branch disables Vercel Git deployment for this branch. Keep the
PR unmerged while live migration/deployment authorization is withheld. No complete-app
or production-ready claim is justified.

## Validation and limits

- Eleven Node regression tests cover financial input/rounding, multi-role access, CSV,
  currencies and PWA behavior. One uses PGlite with the actual new migrations to
  check rollback, permissions, tenant relationships, stale edits, payments, credits,
  reversals, approval invalidation and ticket conversion with minimum quantities.
- PGlite has a deliberately minimal schema and permission fixture. This is not a
  substitute for full-schema Supabase RLS/integration or concurrent-client testing.
- Twelve isolated Playwright checks cover report filters/mobile, nonbilling access,
  errors, secondary accounting membership, settlement submission and approval actions.
  Includes dashboard/ticket/timesheet combined-role checks, invoice/ticket keyboard dialogs,
  and 15 internal screens at phone/tablet/desktop widths. All external requests are
  intercepted; no live customer records are touched.
- TypeScript and Vite production build pass. Windows sandbox builds use
  `--configLoader native` to avoid esbuild scanning restricted parent folders.
- No migrations applied, emails sent, deployments made, or store submissions performed.
