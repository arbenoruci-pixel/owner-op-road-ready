# Patch v95.87 — DOT Package Shared Document Open Fix

## Scope
Fixes the exported DOT HTML package document viewer so saved roadside documents open correctly when the generated HTML is shared and opened by another person in a normal browser.

## Root cause
The v95.85/v95.86 exported HTML contained a generated JavaScript syntax error in the document viewer script. The source template used regex literals containing `/` inside a JavaScript template string. When exported into the final HTML, the escape was lost and the script became invalid:

- `^data:image//i`
- `^data:application/pdf/i`

That syntax error stops the entire document viewer click handler from registering. Some local/in-app paths could still preview the document, but the shared HTML package could not reliably open embedded documents for another person.

## Fix
- Replaced the fragile regex literals in the exported DOT package viewer script with `new RegExp(...)` checks.
- This prevents template-string escaping from breaking the exported HTML script.
- Existing embedded `data:` document links remain available.
- No log data or document data is changed.

## Not changed
- Duty events
- Driving events
- HOS logic
- Timezone logic
- Route/load metadata
- Miles
- Signing logic
- Backup/import
- GPS behavior
