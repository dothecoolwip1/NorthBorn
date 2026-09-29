# Mobile app shell and Operator Today — Packs 2 and 3

Pack 2 changes Northborn phone navigation from a desktop-style hamburger into persistent, role-specific primary navigation.

## Phone navigation

### Manager / office roles
Northborn chooses up to four permitted high-frequency destinations from:
1. Home
2. Schedule
3. Dispatch
4. Jobs
5. Customers
6. Time
7. Invoices
8. Fleet
9. Safety

The fifth position is always **More**. Because the list is permission-aware, accounting, mechanic, dispatcher and safety roles receive useful tabs instead of links they cannot access.

### Operator
- Today
- Jobs
- Time
- Safety
- More

### Client
- Home
- Jobs
- Invoices
- More

## More sheet

More replaces the phone hamburger. It opens above the bottom navigation and contains lower-frequency destinations, account/settings, notifications, demo-role switching and sign out.

Primary tabs are intentionally removed from the Navigation section inside More on phones to avoid duplicate choices. Desktop continues to use the complete navigation list.

## Behavior standards

- Bottom navigation respects iOS/Android safe-area insets.
- Page content reserves space so the final content is not hidden under the bar.
- Notification count appears on More.
- Full-screen editors and modal workflows hide the bottom navigation to reduce accidental navigation while entering data.
- Printable ticket/timesheet views do not render Northborn navigation chrome.
- Demo controls move above the phone navigation instead of overlapping it.
- Desktop navigation is unchanged. Tablet-specific two-pane/rail work remains Pack 10.

## Operator Today — Pack 3

Pack 3 replaces the operator dashboard-style home with a task-first **Today** screen built around the active or next assigned job.

### Today screen
- Shows job number, job title, shop time, on-site time, site, client, assigned unit and privacy-safe crew information.
- Prioritizes an active job first, then today's next job, then the next scheduled assignment.
- Surfaces the next secured workflow action directly on Today: acknowledge dispatch, start driving, mark on site, start work or complete the job.
- Reuses the existing dispatch and completion workflow rather than introducing a second status system.
- Provides one-tap field actions for Directions, Dispatch, Safety, Ticket and Time.
- Shows later-today or next-scheduled work as simple rows instead of dashboard KPI cards.
- Keeps coworker profile information private while still showing useful crew count and role context.
- Removes the legacy operator-only mobile navigation so Pack 2's role-aware bottom navigation is the single phone navigation system.

### Pack 3 verification
- Northborn version: **0.20.0**
- Pull request: **#65**
- Northborn CI: passed
- Pull Request QA: passed
- Pack 3 is merged to `main`.

## Future packs

Pack 7 will add universal search and can promote Search into the manager primary navigation.
