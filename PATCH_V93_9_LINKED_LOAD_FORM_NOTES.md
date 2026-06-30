# PATCH V93.9 — Linked load form + pickup info

Base: v93.8 short-event boundary fix.

Changes:
- Form tab rows are editable by tapping them.
- Driver, carrier, main office, home terminal, truck, trailer, co-drivers, shipping docs, From, and To can be entered from the Form tab.
- Change Status now shows linked load fields when ON DUTY reason is Pickup / Loading or Delivery / Unloading.
- Pickup asks for BOL / shipping number and destination.
- The created pickup/delivery event stores the BOL/destination on the event itself.
- Form uses the linked load info for shipping docs and From/To.
- Moving a linked pickup event keeps BOL/destination with that event.
- Deleting the linked pickup event clears the linked load info when it was sourced from that event.
- No timeline, graph, DOT, inspection, RoadGuard, or route changes were made beyond the linked metadata.

Validation:
- npm run build passed.
- npm run test:offline passed.
