# Logbook follow-up 110.2.1

Base: `7911df632750cb49767332df41277cd43843f3d7`, the 110.2.0 release that reached main while the separate editor branch was under test. Preserve that published implementation, its public API, module locks, inspected-day signatures, daily forms, HOS engine and existing tests. The earlier PR #38 remains available as a reviewed alternative implementation; it must not overwrite this newer main.

## Narrow follow-up

- Location focus/blur with unchanged text is read-only. The legacy callback marked the location manual and erased latitude/longitude/accuracy before a note-only Save. The final materializer now calls it only for an actual parsed location change. Explicit typing/clearing retains its existing behavior.
- A graph boundary covered by a third overlapping event is rendered as separate traces. Normal exact adjacency still connects, and the overlap warning and stored minute values are unchanged.
- Release metadata identifies 110.2.1 / v110201-logbook-followup and its deployment commit. `force:false`; worker behavior and the PWA origin/offline stores remain unchanged.

## Verification

The production build remains `node scripts/build-v110.mjs`. All existing 110.2.0 architecture, signature, form, editor and migration checks remain enabled. Five additional checks cover overlap ambiguity, unchanged raw minutes/IDs, normal joins, final location guard and release identity. New Chromium/WebKit phone tests exercise focus/blur → note-only Save → reload with actual GPS fields in a synthetic live Driving record, Cancel, and intentional manual location changes. They also run against the production origin after merge, with all account APIs intercepted and no production account writes.

The worker test verifies upgrades from both 110.1.0 and 110.2.0 to 110.2.1 while a synthetic Driving page and its IndexedDB/localStorage remain unchanged. Screenshots, browser reports, exact source/runtime archives and post-deploy metadata are uploaded by CI. Physical installed-iPhone confirmation remains separate.

No restore, migration-complete write, real log update, account change, or Tepiha resource change is included. Keep the preceding 110.2.0 and 110.1.0 production deployments for alias rollback; no data rollback/deletion is required for this code-only follow-up.
