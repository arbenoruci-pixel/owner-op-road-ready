# v110.4.9 review and device verification

The v110.4.8 materialized runtime had three concrete editing/GPS problems:

- Every selection nudge wrote immediately; its counter accumulated the requested amount even when the timeline clamped it.
- Insert used a separate, potentially cached one-shot GPS lookup with no accuracy guard or late-response protection for manually entered text.
- The reverse-lookup client stopped after five seconds while its server could take six. GPS error text did not distinguish permission, timeout and weak accuracy, and an unresolved city could replace useful location text.

The finalizer adds one shared selection workflow with a read-only preview, actual hours/minutes, all affected neighbor boundaries, Apply, Cancel and Reset. Apply checks the original rows, day and driver, records before/after evidence, updates only linked route times, and requests recertification. Ongoing events remain editable through the existing Start editor. All-day gaps/overlaps must be reviewed rather than silently reconstructed. Other days, original signatures and inactive drivers remain intact.

Status, Edit and Insert share cancellable fresh GPS acquisition, the existing 250 m accuracy guard, an eight-second reverse lookup budget and actionable error text. Typing, clearing, changing events, closing the form or cancelling stops outstanding work. Nearby fallback cities are labeled approximate; an unresolved city leaves the existing text intact. Recorded-day GPS use requires confirmation.

The DayLogScreen lock revision is intentional: its immediate-write controls are replaced with preview/apply. All other stable module hashes remain unchanged. The final build runs 18 focused regression groups plus existing GPS, midnight and continuity contracts. The browser workflow exercises synthetic records in Chromium and WebKit, including preview/cancel, clamping, one commit, Undo, reload, phone/tablet widths, permission failures, retry, cancellation and late manual-input races. Browser tests intercept account/cloud writes.

## Smallest physical-device check (not performed by automation)

Use disposable driver records on a real phone and iPad, in the browser/PWA actually used while working. Save a backup before any import or edits.

1. Run the current-device safety scan. Confirm it describes this device's stored drivers/days and requires a completed protective backup before import. Cancel import once; records must remain unchanged. Verify the exported file exists in Files/Downloads.
2. Use the native file picker to select that backup. Review the preview and import only the disposable records. Confirm an inactive driver, both profile names and their respective days survive switching A → B → A and a full app close/reopen.
3. Select two completed events. Request 1h 30m earlier/later, inspect every before/after row and any actual limit, then Cancel. Repeat and Apply once; verify graph/list times, Undo, and reload. On a historical log containing an open Sleeper tail, verify the previous day still reaches midnight.
4. At a known place, allow precise location and use GPS in Status, Insert and Edit. Check the place against reality. Retry once after denied permission and once with a weak/offline signal. Start GPS, type a location immediately, and confirm it survives the late fix. Cancel GPS and close the form; no location should save by itself. Confirm historical Edit/Insert explains that GPS is the position now.
5. With the PWA already open on the old version, use Tools → Check app update → Reload latest. Verify v110.4.9, the selected driver, names, edited rows and backup records. Close/reopen and check offline once, then reconnect. Confirm service-worker reload does not lose or duplicate records.

Synthetic browser permission responses, responsive viewports and WebKit do not prove physical radio accuracy, native file saving/picking, iOS permission settings, background suspension, installed-PWA updates or real customer-account behavior. No physical-device or customer-account writes were performed for this release.
