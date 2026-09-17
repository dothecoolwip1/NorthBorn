# Northborn Development Rules

## Mandatory version bump

Every change to Northborn must change the application version number. No update is complete until the version has been bumped.

This applies to every production-facing change, bug fix, UI change, feature, configuration change, database change, workflow change, document/template change, and maintenance update.

When updating Northborn:

1. Bump the version in `package.json`.
2. Update `public/release.json` to the same version and describe what changed.
3. Do not report the update as finished until both version values match the deployed change.
4. Use semantic versioning unless Garrett explicitly requests another scheme:
   - patch: fixes, polish, small changes
   - minor: new features or meaningful capability additions
   - major: breaking or major product releases

This rule is permanent for the Northborn project and should be treated as a release requirement, not an optional convention.
