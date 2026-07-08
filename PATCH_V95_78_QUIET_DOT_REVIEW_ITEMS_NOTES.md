# Patch v95.78 — Quiet DOT Review Items

Purpose: DOT Check was still too noisy on valid working days, showing review-only cards that did not require driver action.

Changes:
- Suppresses short OFF/SB rest progress cards such as `Current rest 31m / 10h` from the main DOT Check panel.
- Uses the relevant ON DUTY/start-work context before first driving instead of comparing a later pre-trip event to an earlier driving segment.
- Stops showing stale inspection source-event/link review cards when the inspection is already complete and the day has a valid ON DUTY/start-work context.
- Keeps delivery route-link metadata review out of the main DOT Check panel when route/shipping data is otherwise valid.
- Keeps missing miles, missing coverage, real location jumps, missing docs for driving/load days, and true signing blockers actionable.
- Does not modify DRIVING event startMin, endMin, or status.

Real backup expectation:
- Jul 05 no longer shows the five noisy review cards: two rest-watch cards, pre-trip timing review, inspection link review, and delivery route link review.
- Jul 06 still correctly asks for 206 mi until entered.
