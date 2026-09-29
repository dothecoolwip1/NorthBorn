# Pack 7 Templates, Forms, Field Tickets and Timesheets rollout

Pack 7 is committed as Northborn v0.14.0.

## GitHub-only status

This pack was intentionally completed as a repository update only.

The migration below is committed but has **not** been applied to the live Supabase project:

- `supabase/migrations/20260929060000_pack7_templates_forms_tickets_timesheets.sql`

Do not deploy Pack 7 UI to production until that migration has been applied and verified.

## Pack 7 scope

- No-code Template Manager with built forms and uploaded fillable PDFs
- Draft, publish, archive, duplicate and version history
- Required fields, sections and conditional custom fields
- Active field ticket template drives real operator data entry
- Active timesheet template drives real employee data entry
- Exact template ID and version retained on saved records
- Custom template answers retained with field tickets and timesheets
- Field/disposal ticket workflow linked to job, customer, operator and unit
- Customer sign-off and operator sign-off on field tickets
- Employee signature on timesheets
- Photo/PDF attachments for field tickets and timesheets
- Manager approval and returned/rejected editing flow
- Printable customer field ticket output
- Printable timesheet output
- Multi-role-aware Template Manager, tickets and timesheets
- Private attachment storage and tenant-scoped RLS design

## Live rollout gate

Before production deployment:

1. Apply the Pack 6 migration if it has not already been applied.
2. Apply `20260929060000_pack7_templates_forms_tickets_timesheets.sql`.
3. Verify field ticket and timesheet template foreign-key scope.
4. Verify operator/employee attachment RLS against an unrelated organization.
5. Verify required and conditional template fields on both workflows.
6. Verify signatures remain unchanged after approval.
7. Verify returned tickets and timesheets can be edited and resubmitted.
8. Verify printable ticket and timesheet output.
9. Run the Pack 7 browser QA group.
10. Deploy v0.14.0 only after those checks pass.
