# Logbook editor and graph — 110.2.0

Build: `v110200-logbook-editor`. Baseline: `c5bfcf48658987d31a5cc0fecb1223b7e2ea683b` (110.1.0).

## Scope and materialization

This release changes the Logbook/editor presentation and its explicit edit command. It does not change the HOS engine, certification fingerprint, signature record/history, scanner, cloud storage policy or database schema. No production records are fixtures.

The production entrypoint remains `node scripts/build-v110.mjs`. All legacy materializers run first. `apply-logbook-editor-v110.mjs` then selects the reviewed renderer and applies narrow, guarded wiring changes. `finalize-logbook-editor-v110.mjs` retains explicit inspection confirmation and completes minute-precision labels and scoped activity contrast. Both run before all final regression/lock checks and Next compilation. Anchor ambiguity fails the build. Editing a generated legacy entrypoint alone is insufficient.

Canonical additions are `eventEditingV110.js`, `useLogbookClockV110.js`, `graphGeometryV110.js`, `LogGraphV110.jsx`, `EditorTimeControlsV110.jsx`, the scoped stylesheet, and the two build finalizers.

## Exact visual timeline

SVG traces share a 5.5-unit width and exact coordinates. Each arriving vertical/horizontal turn shares a miter-joined path with a same-width chain underlay. There is no white halo or widened Driving overlay. OFF and SB are muted, Driving teal, and ON blue. Only exact temporal adjacency draws a connector. A coverage sweep exposes real gaps and nested overlaps; one-minute events keep their true width. Larger transparent hit areas improve selection without altering the trace. Start/end handles use relative one-minute movement and explicit keyboard controls.

## Editor contract

The stored row, read-only Now projection, and editor draft are distinct. A single editor clock supplies preview, range, duration and the Now label in the selected home-terminal timezone. Historical minute values are never converted. Closed events accept one-minute ranges and an explicit next-day midnight endpoint of 1440. Invalid/reversed ranges block Save instead of silently extending or rounding them.

Opening and canceling perform no event writes. A Save emits only changed fields with the target day, event ID and expected original row. Concurrent changes reject a stale edit. The App applies this explicit command to one raw row and marks actual certification changes without neighbor repair, synthetic OFF insertion, load updates or signature replacement. Linked inspection handling remains day-scoped and explicit.

A live event has disabled temporal/status controls, an End of Now, and a Save details action. Metadata-only edits preserve stored endpoints, current status and active session. Ending the live activity requires Change status, which opens the existing explicit duty-status workflow. Selecting Change status alone does not end Driving.

## Presentation

All overrides are scoped to `.logbook-ui-v110` or `.editor-ui-v110`. Inputs use explicit readable foreground/background, WebKit text fill, autofill colors, placeholders and 16px text. Start and End occupy separate groups, time zone is visible, and notes precede Save. The graph and selected event share an understated selection band. Unrelated module styling is unchanged.

## Reviewed locks

Only two existing file hashes change: `logbook/public-api.js` exposes the explicit editing contract, and `logbook/DayLogScreen.jsx` uses the read-only exact view. All 11 lock checks and the existing legacy import boundary remain enabled. The other nine locked files are byte-identical to the baseline after production materialization.

## Required release evidence

The workflow builds through the exact production entrypoint and retains pre/post-materialization archives, screenshots and test output. It runs the existing architecture, cloud, certification, day-form and legacy regression suites plus 32 editor/geometry/timezone/non-mutation checks. The additional coverage-sweep assertion verifies nested overlaps.

Real-browser fixtures run Chromium and WebKit with phone viewports, mismatched phone/home time zones, closed and live edits, Cancel, exact Save/reload, invalid ranges, 24:00, contrast and overflow checks. Existing real sign → reload → document/load update → reload checks remain mandatory. A separate loopback-origin test upgrades the emitted service worker from 110.1 constants to 110.2, checks its message handshake and preserves an open synthetic Driving page and IndexedDB record.

A passing CI artifact is the source of execution evidence; this document is not a claim that an unrun test passed. Physical iPhone, installed-PWA keyboard/autofill behavior and a user's already-running process require device confirmation.

## Release safety and rollback

The origin stays `owner-op-road-ready.vercel.app`, with the same manifest identity and IndexedDB namespace. Version metadata has `force:false`. The service-worker diff only changes version/build constants; no new reload or data-deletion behavior is introduced. Do not request a PWA reinstall, clear device data or force-refresh during Driving.

Keep the prior production deployment `dpl_8SVCLnUnAUcc9zcGsbLbCw8BWcUz` and baseline commit available for rollback. A rollback changes app code only; it must not restore an old snapshot over newer real logs.

## Migration boundary

Migration auditing is separate from this UI release. Successful log-day counts alone cannot prove full content coverage. Completion requires all original-file/reference checks and a verified structured app snapshot. This release does not mark migration complete, replace real logs, or publish private audit/export contents. Remaining discrepancies belong in the private migration report and must be reconciled against current cloud and device data before any restore.
