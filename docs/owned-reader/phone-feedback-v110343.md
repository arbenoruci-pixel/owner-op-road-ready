# Missing-reference follow-up: v110.3.43

The next installed-phone export uses core 0.3.4 and contains one shipping document. Its shipping-party proposals improved, but the BOL reference remained missing. The source-page observation retained the B/L number label without a readable value. The region planner required a numeric neighbor, so the missing value prevented the intended fourth read. A partial number in another observation lacked its B/L label and could not supply document identity.

Core 0.3.5 lets an explicit B/L or BOL label with a nearby number label propose a bounded header reread even when no digits survived. It includes space after a partial value and respects adjacent field labels and image bounds. Damaged bare labels still need numeric support. Existing limits, exact-image checks, source inspection, cancellation, four-pass budget and original-page accounting remain in effect. The planner never creates or joins digits.

Parenthetical contractual role fragments are excluded from inline party fields. A readable shipping company no longer conflicts with an unrelated parenthetical contract fragment. Actual identifier disagreements remain unresolved.

Validation covers empty and partial values, missing/invalid image dimensions, old-reference qualifiers, distant labels, neighboring fields, source evidence and legitimate parenthesized company names. The browser scenario now begins with an entirely missing B/L value and verifies the region reread, source image, review/export and retention of the full original page.

The JSON export contains no source-image pixels or raw TSV words. Its field extraction can be replayed exactly; the installed device's new pixel reread still requires phone acceptance. No claim of improved character recognition or model training is made from this export. Customer images and text remain excluded from the repository.
