# Patch v91.3 — SignGuard + Copy for ChatGPT Review

## Scope
No route changes. Patch builds on v91.2 DOT Inspection.

## Added
- Sign tab now includes a professional Pre-Sign DOT Check / SignGuard panel.
- SignGuard groups findings into:
  - Fix required
  - HOS review / possible violation
  - DOT package review
- Adds “Copy Full Review” for ChatGPT self-review.
- Adds “Copy for ChatGPT” on each issue card.
- Adds a paste area where driver can paste the ChatGPT fix/review plan while correcting the log.
- Adds “Copy Pasted Fix Plan” for easy reuse.
- The ChatGPT prompt explicitly says not to falsify or change accurate records.

## Validation logic added/improved
- 24-hour coverage and daily total must equal 24h for completed days.
- Detects start/end gaps and in-day gaps.
- Checks required header fields: driver, carrier, main office, vehicle.
- Checks shipping docs/load reference or accurate empty/bobtail note.
- Keeps location, overlap, invalid duration, inspection linkage, and HOS checks.
- Adds previous 7-day DOT package readiness review.

## Safety notes
- The helper copies structured compliance/log data only.
- It does not auto-edit records from ChatGPT output.
- Driver remains responsible to certify only true and correct records.

## Build
- `npm ci --no-audit --no-fund`
- `npm run build` passed.
