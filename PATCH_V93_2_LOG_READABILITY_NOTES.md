# Patch v93.2 — Pro Log Readability

Focus: make the Log tab easier to read and closer to a flat, professional logbook view without copying Motive styling.

Changes:
- Reworked the Log graph display into a flatter full-width panel with less decoration and less wasted space.
- Increased internal graph label margins so OFF/SB/D/ON labels and right-side totals are not clipped.
- Removed the underlying continuous dark path that could make OFF DUTY look like it continued through a short ON DUTY event.
- Kept exact event boundaries: each event line ends at the next event start.
- Made transition joints thinner and cleaner for 1-minute status changes.
- Tightened the action row and made it flat instead of a floating card.
- Changed event rows from large cards to compact list rows with thin separators.
- Kept Log Check collapsed and compact by default.
- Removed the large CERTIFY button from the Log tab; certification remains handled on the Sign tab.

Validation:
- npm run build passed.
- npm run test:offline passed.
- No route changes.
- No timeline logic changes beyond graph presentation/clarity.
