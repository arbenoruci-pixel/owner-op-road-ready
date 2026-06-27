# Patch V91.1 — DOT Inspection / Sign Validation / Inspection Sheet UX

Source ZIP: `owner-op-road-ready-main 8.zip`

## Scope
No app routes were added or renamed. The patch updates existing UI/business logic only.

## Implemented
- Replaced Log Tools top card with a single `DOT Inspection` entry.
- Added DOT Inspection Mode with:
  - open inspection-safe view on current device,
  - officer email report via mailto,
  - copy inspection summary,
  - current 24-hour period + previous 7 consecutive days selector,
  - official/private-data-safe header and event list.
- Added stronger sign/certify validation:
  - blocks signing active day,
  - blocks no events, bad event duration, overlaps, missing event location, missing vehicle, missing inspection, inspection/pre-trip time mismatch, and high HOS issues,
  - shows exact where/what messages before signing.
- Changed inspection behavior:
  - one daily inspection sheet per day,
  - app prompts Yes/No when ON DUTY Pre-trip is created and no sheet exists,
  - Yes auto-fills the sheet and links it to the ON DUTY Pre-trip event,
  - linked sheet time stays synced when the event time is edited.
- Edit Duty Status screen now shows live selected-event duration.
- Day Log inline move button now says `Save Move`.
- Added iPhone/Safari bottom safe-area spacing to reduce hidden buttons.
- Added continuous graph body overlay with rounded joins for smoother line connections.

## Validation
- `npm ci` completed.
- `npm run build` completed successfully.

## Compliance note
This is an inspection-safe manual RODS / ELD-exempt workflow. It is not a certified ELD/eRODS electronic transfer file.
