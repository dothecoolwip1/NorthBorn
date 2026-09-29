# Pack 6 Safety Management rollout

Pack 6 is committed as Northborn v0.13.0.

## GitHub-only status

This pack was intentionally completed as a repository update only.

The migration below is committed but has **not** been applied to the live Supabase project:

- `supabase/migrations/20260929053000_pack6_safety_management_completion.sql`

Do not deploy Pack 6 UI to production until that migration has been applied and verified.

## Pack 6 scope

- Employee-uploaded safety tickets, training and orientations
- Safety-managed employee credential review and expiry visibility
- Searchable SDS, SOP, safe work practice, policy, ERP, JSA/JHA, orientation and reference library
- Document version, effective date, review date, expiry date and revision notes
- Required employee document acknowledgements
- FLHA, incident, near miss, hazard observation and toolbox talk forms
- Vehicle and equipment inspection safety form
- Up to eight safety-form photo/PDF attachments
- Printable safety submission view for browser PDF output
- Safety submission escalation notifications for incidents, near misses, immediate/high hazards and failed inspections
- Multi-role-aware Safety routing and Safety-role management access
- Tenant-scoped RLS design for acknowledgements and form attachments

## Live rollout gate

Before production deployment:

1. Apply the Pack 6 migration.
2. Verify RLS for unrelated organizations and ordinary workers.
3. Verify safety attachment storage access.
4. Verify required document acknowledgements.
5. Verify urgent safety submission notifications.
6. Run the Safety route and mobile browser QA.
7. Deploy v0.13.0 after those checks pass.
