# PATCH V95.44 — Merge Passive Same-Status Rows

Base: v95.43 manual driving mode + graph polish.

Problem:
- After changing or deleting events, adjacent OFF DUTY rows could remain as multiple separate event rows because their notes/locations differed.
- Example: four OFF DUTY rows touching each other appeared in the event list even though the graph was one continuous OFF line.

Fix:
- normalizeLogEvents now auto-merges adjacent/touching OFF DUTY rows regardless of note/location differences.
- SLEEPER rows also merge the same way.
- DRIVING still merges as before.
- ON DUTY activity rows remain separate unless their text is compatible, so Pre-trip, Pickup, Fuel, Delivery, etc. are not accidentally glued together.

Result:
- If a day becomes all OFF DUTY after edits, it displays/stores as one clean OFF DUTY row.
- Deleted/changed events no longer leave a stack of leftover OFF rows.

Validation:
- npm ci
- npm run build
- npm run test:offline
- verify-deep-scan-v952
