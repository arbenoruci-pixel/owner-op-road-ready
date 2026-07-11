# PATCH V96.2 — Deep Scan: Historical Location, Pickup Details, BOL Signing, and GPS

## Deep-scan findings

The review found four connected data-flow defects rather than a single screen-only issue:

1. **Historical location overwrite**
   - Same-status timeline normalization selected the later row's city/state when adjacent rows were merged.
   - Legacy route normalization could replace a valid event location with a route destination found only by a broad ±45-minute time match.
   - That allowed a later Cheshire, CT stop/load destination to appear on an older Toledo, OH OFF DUTY event.

2. **Pickup details were split across records**
   - New Pickup / Loading could collect load fields, while the existing event editor did not expose the same BOL and Going to values.
   - Global `loadInfo`, the exact duty event, and the linked route leg could disagree.
   - A new pickup could retain the preceding load's destination after the visible field was cleared.

3. **BOL sign loop**
   - The Add BOL quick fix updated the global load record while Sign/DOT checks could validate the exact Pickup event or route leg.
   - Structured BOL fields were run through a note-token parser that rejected valid short or alphabetic references, so a saved value such as `123` could still be reported missing.
   - Equipment container/chassis numbers could be mistaken for shipping documents in older checks.
   - Free-form OFF/SLEEPER notes containing words such as “loading” or “no trailer” could incorrectly affect the BOL requirement.

4. **GPS stop-location quality**
   - A single iPhone geolocation response can be cached or cell-tower based.
   - A slow automatic GPS response could overwrite a city/state typed manually while waiting.
   - Offline city fallback coverage was too small for the driver's Midwest and Northeast lanes.

## Fixes

### Event location isolation

- A merged continuous duty block keeps the location saved at the start of that block.
- Distinct ON DUTY activities such as Pre-trip, Pickup, Fuel, and Delivery remain separate exact events.
- A valid stored event city/state is authoritative.
- Route data may fill a location only when the event is blank/placeholder and the route leg is directly linked by event ID.
- The old ±45-minute route-destination rewrite was removed.
- Records carrying the old `staleLocationLabel` / `route_leg_destination` repair metadata are reverted to their saved historical location once, without touching later days.

### Smart Pickup / Loading event

- Existing ON DUTY → Pickup / Loading events now show **Pickup details** directly in Edit Duty Status.
- Added editable fields:
  - BOL / Shipping document #
  - Going to (City, ST)
- Values reopen from the exact event or its directly linked route leg.
- Saving synchronizes the exact event, linked route leg, and day-scoped active-load cache.
- Clearing BOL or Going to clears the corresponding exact route/load value instead of restoring a stale previous-load value.
- A new pickup starts with blank BOL and destination; it does not inherit another event/day's load.

### Sign and DOT BOL consistency

- Add BOL / mark empty now targets the exact Pickup/Delivery event identified by the issue.
- The same operation updates:
  - exact duty event;
  - linked canonical route leg;
  - day-scoped loadInfo cache.
- Clearing a BOL clears all three copies, preventing a stale hidden value.
- Direct structured BOL values are accepted as entered, including short numeric and alphabetic references.
- Legacy `event.bol` and `event.po` values are recognized.
- Container and chassis IDs no longer count as BOL/shipping documents.
- Driving by itself does not create a BOL requirement.
- Load words in unrelated OFF/SLEEPER notes do not create or clear a BOL requirement.
- Missing-BOL issues carry the exact day and event ID so the Fix action opens the correct record.

### Stronger GPS location

- GPS collects several high-accuracy samples for up to 12–15 seconds and keeps the most accurate sample.
- Very precise satellite fixes can complete immediately.
- Fixes worse than 250 meters are rejected with a clear retry/manual-entry message.
- City/state resolution uses a same-origin server endpoint backed by the U.S. Census reverse geocoder.
- Expanded deterministic offline nearest-city fallback for Ohio, Connecticut, Pennsylvania, New York, New Jersey, Illinois, Indiana, Wisconsin, and common freight lanes.
- A late automatic GPS response cannot overwrite a location typed manually.
- Leaving Driving clears the old driving-start location and requests a fresh stop position before saving OFF, SB, or ON.

## Validation

Added dedicated v96.2 regression checks for:

- historical location isolation and legacy location recovery;
- exact-event Pickup details and destination clearing;
- exact-event BOL/sign/DOT synchronization;
- short and legacy BOL acceptance;
- unrelated OFF notes not affecting shipping requirements;
- multi-sample GPS best-fix selection;
- coarse GPS rejection;
- Northeast city/state fallback.

The existing offline sync, midnight Driving, event-history guard, selected-event movement, PWA update, DOT HTML package, day export/import, route normalization, coverage, signing, and drop-off regression suites remain enabled.

## Release

- Version: `96.2.0`
- Package format: ZIP **NO ROOT**
