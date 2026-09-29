# Northborn v0.15.3 rollout

The user authorized production deployment on September 29, 2026, superseding the
previous GitHub-only restriction for this release. This does not mark every pack complete.

The rollout applies exactly these pending source migrations, in this order, as one
transaction named `northborn_v0153_rollout`:

1. 20260929053000_pack6_safety_management_completion.sql
2. 20260929060000_pack7_templates_forms_tickets_timesheets.sql
3. 20260929060749_billing_atomic_save.sql
4. 20260929114442_invoice_payment_credit_ledger.sql
5. 20260929115101_invoice_approval_workflow.sql
6. 20260929115333_price_minimum_quantities.sql
7. 20260929124054_attachment_policy_helper_permissions.sql

The hosted migration tool assigns the rollout its own timestamp. Its single history
entry represents all seven files; do not reapply them individually. No historical
migration files recovered from the database should be replayed in production.

Preflight: PostgreSQL 17.6, four existing invoices, no negative/overpaid or paid
draft/void balances. Existing invoice payments are retained as opening ledger entries.
The previous production deployment is dpl_EAnqXg9vu1UmtMEWq9H4iQUf6T3X (v0.11.0).
Because the new billing rules change invoice writes, restoring an old frontend is not
a complete database rollback; prefer a forward fix preserving ledger history.

Release validation: twelve Node regression tests (including actual migration SQL in
PGlite), twelve isolated browser tests, TypeScript/build/version guard, followed by
post-migration permission/integrity checks and a live production smoke check. Fixture
checks do not establish complete end-to-end or real-device acceptance.
