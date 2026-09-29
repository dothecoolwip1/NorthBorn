# Recovered migration provenance

The 23 historical SQL files added with the billing/reporting work were recovered
read-only from `supabase_migrations.schema_migrations` in Northborn's configured
project on September 29, 2026. No customer rows or secrets were exported.
Original migration versions, names, and statement contents were retained.

They cover invitation delivery metadata, customer/job contacts, assignment
notifications, portal access codes and roles, safety source metadata/reassessments,
RPC grants, timesheets, field tickets, ticket review notifications and invoicing.

These are historical source recovery, not new migrations to apply to production.
The live database already records them. Do not reapply them or mark existing
versions as newly executed. Other existing repository migrations use timestamps
that differ from live history; full baseline reconciliation and a fresh Supabase
replay are still required. This recovery alone does not certify reproducibility.
