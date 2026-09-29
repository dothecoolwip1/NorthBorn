# Northborn design system

Pack 1 establishes the shared visual foundation used by every Northborn role and module.

## Product principles

- Field work is the visual priority. Decorative UI stays quieter than operational information.
- Controls may float; operational content stays solid, readable and stable.
- Phone interfaces use a 48 px minimum touch target. Primary actions use 52 px.
- Normal field text is 16 px. Secondary text is 14 px. Compact metadata is never intentionally smaller than 12 px.
- Orange is an interaction/accent colour, not decoration on every surface.
- Success, warning, danger and information colours have semantic meaning and should not be repurposed for decoration.
- Prefer flat lists and dividers for dense operational data. Use raised cards only for genuinely separate groups or actions.
- Prefer one of three radii: 8 px, 12 px, 16 px. Pills are reserved for statuses/tags.
- Respect reduced-motion preferences.

## Tokens

Use variables from `src/design-system.css` instead of adding one-off hardcoded values.

Core groups:
- typography: `--nb-font-*`
- spacing: `--nb-space-*`
- surfaces: `--nb-bg-*`, `--nb-surface-*`
- borders: `--nb-border-*`
- text: `--nb-text-*`
- status/accent: `--nb-accent`, `--nb-success`, `--nb-warning`, `--nb-danger`, `--nb-info`
- radii: `--nb-radius-*`
- touch targets: `--nb-touch`, `--nb-primary-touch`

## Shared primitives

`src/NorthbornUI.tsx` exposes reusable Button, Surface, Status, EmptyState, Skeleton and Sheet primitives. Existing legacy classes such as `.primary`, `.secondary`, `.status-pill`, `.panel`, `.record-card`, `.job-row`, `.empty-state` and `.modal-card` are mapped onto the same foundation so older screens inherit the system while they are migrated.

## New-screen checklist

1. Use the tokens rather than new hex values or spacing numbers where practical.
2. Do not add new text below 12 px.
3. Do not add a phone interaction below 48 px.
4. Use one of the standard radii.
5. Use semantic status colours.
6. Use a sheet for phone-focused editing or lookup flows rather than a narrow desktop modal.
7. Use skeletons for loading states that would otherwise cause layout jumps.
8. Use empty states to explain the next action, not merely say "No data."
9. Avoid new `!important` rules unless required to isolate third-party or legacy behavior.
