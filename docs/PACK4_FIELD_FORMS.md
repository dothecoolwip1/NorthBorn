# Pack 4 — Field Forms

Northborn 0.21.0 turns operator paperwork into field-first workflows.

## Operator field forms

The operator Safety landing page now provides direct field workflows for:
- Pre-trip inspections
- Full FLHAs
- Incident reports
- Near miss reports
- Equipment inspections

Known context is reused instead of retyped. When an operator opens paperwork from Today, Northborn carries the assigned job into the form and uses the linked site, customer, operator and assigned unit where available.

## Inspection behavior

Pre-trip and equipment inspections use large Pass, Defect and N/A controls. Every checklist item must receive a response before submission.

Selecting Defect expands only that item's exception fields:
- defect description
- severity
- remove-from-service flag
- optional defect photo

The complete checklist and defect detail are stored in the existing safety submission record. Photos use the existing safety file and attachment system.

## Ticket and time handoff

The Today screen passes the active job into Field Ticket and Timesheet routes.

For operator field tickets:
- only assigned jobs may be selected
- customer and site are prefilled from the job
- assigned unit is selected when available

For timesheets:
- the assigned job is selected automatically when opened from Today
- unassigned jobs remain blocked by the existing assignment validation

## Navigation

The old operator-only Safety mobile navigation was removed. Pack 2's global role-aware mobile tabs remain the single phone navigation system.

## Follow-up

Pack 5 adds offline and autosave resilience around these field workflows.
