# PATCH V94.5 — Insert Event Driver Flow

Base: v94.4 multi-stop route legs.

Changes:
- Insert Events screen now focuses on driver flow:
  - status
  - action/reason
  - time/duration
  - location
  - save
- Added status-based reason buttons for insert:
  - ON: Pre-trip, Pickup, Delivery, Fuel, Waiting, Drop Trailer, Drop & Hook
  - OFF: Off Duty, Break, Parking, Personal Conveyance
  - SB: Sleeper Berth, Rest
  - D: Driving, Yard Move
- Manual location input no longer parses every keystroke, so driver can type `Gary, IN` normally.
- Added city suggestions: Gary, Gurnee, Romeoville, Joliet, Bolingbrook, Chicago, Toledo.
- Shows warning when location is missing a state.
- Added duration quick buttons: 1m, 5m, 15m, 30m, Until now.
- Added split/override preview before saving.
- Pickup/Delivery insert events can carry BOL / Shipping # and destination.
- Inserted pickup/delivery events now update linked route legs.
- Editing pickup/delivery events re-syncs linked route leg timing/details.
- Notes are collapsed by default.
- Save button now shows status + duration.
- No route changes.

Validation:
- npm run build passed.
- npm run test:offline passed.
