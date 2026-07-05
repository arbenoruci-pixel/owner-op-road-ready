# Owner-Op Road Ready v95.51 — Roadside 8-Day List Fix

## Issue
The Home logs list was showing the latest saved log records across older dates. That made the list look like random old days instead of the roadside package.

## Fix
- Home now always shows the active log day plus the previous 7 calendar days.
- Missing previous days stay visible as `Missing log` so the driver can open/create them.
- Older saved logs are preserved and accessible under a collapsed `Older saved logs` section.
- DOT Mode still says `Today + previous 7 days`.

## Files changed
- `source/src/modules/home/HomeScreen.jsx`
- `source/src/styles.css`
- `package.json`
