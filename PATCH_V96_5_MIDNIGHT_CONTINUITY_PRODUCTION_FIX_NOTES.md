# Owner-Op Road Ready v96.5.0

## Production issue fixed
The v96.4 checker accepted only the ideal raw boundary `D 24:00 -> D 00:00`. Real device/restored records can persist the same accurate duty tour as `23:59 -> 00:00`, with explicit rollover metadata, or with a display-only placeholder. That caused the false **Pre-trip ON DUTY event is missing** card to remain visible.

## v96.5 behavior
- Accepts an evidence-backed whole-minute midnight boundary within two minutes.
- Accepts explicit manual/GPS rollover metadata within a small guarded tolerance.
- Ignores synthetic/display-only carryover rows when identifying the first real event.
- Accepts legacy `DRIVING` status text.
- Treats an immediate ON DUTY Fuel/Pickup/inspection boundary at midnight as the same duty tour.
- Continues to show the pre-trip review after OFF/SB rest or a real untagged gap.
- Changes no event times, statuses, locations, HOS totals, or signatures.

## Route / BOL regression coverage
The v96.4 exact-event BOL and Going to link remains unchanged and is rerun in the release verification.
