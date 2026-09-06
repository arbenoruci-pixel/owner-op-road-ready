# Logbook editor 110.2.0

Build identifier: `v110200-logbook-editor`.

## Authoritative source and materialization

Production still enters through `node scripts/build-v110.mjs`. The new finalizer runs AFTER the existing cloud, module-isolation, signature-persistence and signature-UI materializers, and BEFORE all isolation tests, lock verification and Next compilation. It fails if an expected legacy anchor changes. Running the finalizer twice is supported.

Review inputs:
- `source/src/shared/utils/logbookEditorTimeV1102.js`: pure raw-event presentation and exact editor command.
- `source/src/modules/graph/LogGraphV1102.jsx`: SVG renderer copied to `LogGraph.jsx` after legacy patches.
- `source/src/modules/editor/components/EditorTimeControlsV1102.jsx`: controls copied to `EditorTimeControls.jsx`.
- `source/src/modules/editor/logbook-v1102.css`: scoped contrast/layout, imported last.
- `scripts/apply-logbook-editor-v1102.mjs`: bounded integration into the final Edit/Insert/Day/EventList/App runtime.

The versioned legacy files are build inputs, not the last generated runtime. The CI artifact contains both the original source archive and the materialized runtime for comparison. Never patch only an output that the earlier build chain regenerates.

## Behavior

The graph uses exact recorded boundaries, consistent six-unit strokes and midpoint-split vertical connectors. A corner belongs to the same SVG path as its horizontal segment. Only unambiguous, exactly adjacent boundaries connect. Gaps, overlaps, nested overlaps, one-minute events and midnight boundaries remain visible at their actual times. Wider transparent touch targets do not widen the visible time segments. There is no white halo or shadow on duty strokes. Selection links the trace to an explicit Edit action; handles do not draw decorative connector lines.

Graph and event-list presentation use a read-only raw-event view. Existing HOS and compliance engines retain their original contracts and files. The editor owns a draft and an original raw-record identity. Its controls, duration and preview use the same minute-range function. Midnight End means 1440; midnight Start means 0. Invalid ranges are shown and cannot be saved.

An explicit active session/current-status record displays `Now` in the selected home-terminal timezone. Its stored placeholder end is not persisted as the displayed current time. Status/time controls are locked for the running event, and Change current status opens the established status workflow. A note/location-only save applies only changed fields to the selected raw row. It preserves IDs, neighbors, stored timestamps and the active session. Open/Cancel never invoke that command. A conflicting raw record fails closed and requires reopening. Closed-event time edits preserve neighbors and warn when the resulting exact range contains gaps or overlaps.

No timezone-setting edit, historical time conversion, DB restore, migration-complete write, account change, cache clearing or PWA removal is part of this release. Update metadata sets `force:false` and retains the existing origin, auth and offline stores.

## Boundaries and lock review

Only `source/src/modules/logbook/DayLogScreen.jsx` changes among the eleven locked files: read-only graph/list presentation, selection UI and scoped class. The HOS engine, timeline engine, raw compliance checks, certification/signature files, daily form, public API, day transfer and scanner contract hashes remain unchanged. The lock verifier and all previous tests remain enabled.

## Regressions

`node scripts/test-logbook-editor-v1102.mjs` checks geometry, exact time parsing, short and midnight events, nested overlaps, live identity, sparse saves, unauthorized fields, read-only rendering, device timezone differences, DST wall-clock behavior and the final generated source. The existing signature/day-form/architecture tests still run.

`node scripts/browser-logbook-editor-v1102.mjs` runs the compiled application in Chromium and WebKit, with phone viewport and two device timezones while the terminal stays in New York. Synthetic IndexedDB fixtures and intercepted external requests prevent real account writes. Scenarios include graph selection, closed/live editors, Cancel, note-only Save, reload, clock advancement, midnight insert controls, input/placeholder contrast and horizontal clipping. It produces screenshots and a JSON report. The separate existing browser-isolation test covers sign, reload, document/load changes and another reload.

Inspect CI results and screenshots before merge. Browser emulation does not replace verification on an already-installed physical iPhone.

## Release and rollback

Merge only after the exact production build, isolation checks and browser scenarios pass. Verify the production alias serves matching app-version and service-worker build identifiers. Keep the previous production deployment available; Vercel alias rollback restores its code without deleting user data. No migration repair or completion should be inferred from the UI deployment.
