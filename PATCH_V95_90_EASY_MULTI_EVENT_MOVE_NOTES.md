# PATCH v95.90 — Easy Multi-Event Move

## Scope
The Log Day selection toolbar was simplified for precise multi-event movement.

## New workflow
1. Tap Select.
2. Choose one or more events, or tap All day.
3. Choose a step: 1m, 5m, 15m, or 30m.
4. Tap minus to move earlier or plus to move later as many times as needed.
5. Review the live graph and event-card preview.
6. Tap Apply move to save, or Cancel move to restore the original positions.

## Safety
The existing timeline engine remains responsible for coverage preservation, selected-event shifting, driving-event protection, neighbor adjustment, and signed-day recertification.

## Validation
- Production build passed.
- Selected block later verifier passed.
- Selected block earlier verifier passed.
- 24-hour coverage verifier passed.
- Driving-event selection protection verifier passed.
