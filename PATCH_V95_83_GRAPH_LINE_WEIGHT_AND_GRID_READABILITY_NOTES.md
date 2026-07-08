# PATCH v95.83 — Graph Line Weight and Grid Readability

Scope: Log Day graph/grid visual rendering only.

## Changed
- Increased the main blue duty-status trace from 5.25px to 5.8px, about a 10% visual increase.
- Kept the duty line as one clean blue paper-log trace with the same horizontal and vertical stroke width.
- Reduced vertical grid line stroke widths by about 40%:
  - hour lines: 0.72px -> 0.43px
  - quarter-hour lines: 0.34px -> 0.20px
- Kept hour grid lines slightly stronger than 15-minute lines, while making both lighter and less visually dominant.
- Kept OFF / SB / D / ON row separators readable with lighter row-line styling.
- Removed read-only warning/exclamation circle badges from the graph.
- Removed always-visible short-event dot markers from the read-only graph.
- Very short events now render as a minimum-length segment of the same blue duty trace.
- Reduced visual size of edit handles while keeping large transparent touch targets for editing.
- Trimmed graph panel/event-list spacing and widened the usable graph body slightly.

## Explicitly unchanged
- No duty event start/end times were changed.
- No driving event start/end times were changed.
- No statuses were changed.
- No HOS calculation logic was changed.
- No Drive Mode logic was changed.
- No route/load metadata logic was changed.
- No signing logic was changed.
- No miles logic was changed.
- No backup/import structure or behavior was changed.
- No GPS behavior was changed.
- Service worker behavior was not changed; only the version constant was bumped.

## Verifiers added
- verify-graph-main-duty-line-thicker-v9583
- verify-graph-vertical-grid-lighter-v9583
- verify-graph-readonly-no-dot-markers-v9583
- verify-graph-edit-handles-only-when-selected-v9583
- verify-event-data-unchanged-v9583
