## v95.97.0 - Driving Event History Guard + Recovery

- Fixed stale legacy GPS rollover state that could replace today's OFF/SB/D/ON events with DRIVING from midnight.
- Live manual status changes now preserve every historical event before the change time.
- GPS rollover can only fill an empty start-of-day gap and can never overwrite existing duty events.
- Live status time now always uses the configured home-terminal day and minute.
- Added guarded recovery from pre-update data, per-day safety copies, and local duty-event revision history for the exact midnight-driving corruption pattern.
- Preserved v95.96 compact DOT HTML, event movement, HOS clocks, signing, route/load, miles, and backup/import behavior.

## v95.95.0 - DOT HTML Primary Officer Package

- Made self-contained HTML the primary DOT officer sharing format.
- Added professional 8-day RODS navigation and mobile/desktop log layouts.
- Added reliable document open controls with full-screen viewer and inline fallback.
- Removed PDF-first buttons from DOT Mode.

## v95.94.0 - PWA Update Reliability

- Fixed the installed-PWA update loop caused by v95.93 release metadata while the client bundle and service worker still identified as v95.91.
- Synchronized package, client, remote manifest, and service-worker versions at build time.
- Added a versioned, network-only service-worker activation handshake before the update reload.
- Forced the root PWA document, update manifest, web manifest, and worker script to revalidate from the network.
- Preserved IndexedDB/localStorage logs, pre-update backups, DOT Mode repairs, and instant multi-event movement.


## v95.90.0 - Easy Multi-Event Move

- Replaced the crowded shift preset strip with a compact +/- movement control.
- Added selectable 1, 5, 15, and 30 minute movement steps.
- Added live graph and event-card preview before applying the move.
- Added Apply move, Cancel move, Clear, All day, and Done controls.
- Preserved selected-block shift validation, 24-hour coverage, driving protections, and recertification behavior.


## v95.89.0 - Event Shift + HOS Violation Graph
- Added easier Select mode for event shifting on Log Day.
- Added safe raw-event shift helper that adjusts edge neighbors without insert/override deletion.
- Added 1 hr / 15 min earlier/later quick shift actions and preview sheet.
- Signed shifted days now mark Needs Recertification.
- HOS violation graph now turns red from the exact violation minute.
- Added small 11h / 14h / Break / 70h violation labels on the graph.
- Preserved GPS smart-paper mode, DOT PDF package, route/load, miles, timezone, and backup/import behavior.


## v95.86 — HOS Effective Drive Mode Clock
- Preserved raw 11-hour `hos.drive` calculation.
- Added `hos.effectiveDrive` for legal drive time available right now.
- Drive Mode `DRIVE` display now respects expired SHIFT, BREAK, and CYCLE clocks.
- If SHIFT is 00:00, displayed DRIVE is 00:00 instead of showing raw 11-hour time as green.
- Added blocker metadata and Drive Mode helper text.
- Added v95.86 HOS effective-drive verifiers.


## v95.85 — DOT package document full-screen viewer
- Roadside Documents inside exported DOT HTML packages now open in a full-screen in-page viewer instead of relying on raw `data:` links.
- Added a large Back control for officer-friendly return to the log package.
- Supports image preview, PDF iframe preview, and fallback Open action for other file types.
- Added full-screen styling for the in-app DOT saved document viewer.
- UI/document presentation only: no duty times, driving times, HOS, route/load, miles, signing, backup/import, or GPS logic changed.

# v95.84 Home terminal time zone settings

- Defaults DOT log-day time to Eastern Time (`America/New_York`) for MC871792 / Narta Express.
- Adds a Log Time Zone setting from Log Tools with common U.S. zones plus custom IANA timezone entry.
- Uses configured home-terminal time for `localDayKey`, Today, current minute, open-driving rollover, HOS/Drive Mode clocks, and log-day displays.
- Shows the active log timezone on Home and Log Day screens.
- Does not convert or rewrite existing duty-event start/end minutes.

# v95.79 — Rest-Only Coverage Clean

- Treats OFF DUTY/SLEEPER-only restored days as full rest/off-duty coverage for DOT Check/signing.
- Prevents one-minute imported OFF/SB artifacts from opening a missing-coverage Fix Wizard on old off-duty days.
- Keeps true missing coverage checks active for driving/ON DUTY working days.
- Added verifier for the real backup Jun 29 / Jun 30 rest-only days.

# v95.78 — Quiet DOT Review Items

- Hid non-actionable rest progress review cards from the main DOT Check panel.
- Prevented later pre-trip events from being compared against earlier driving segments.
- Suppressed completed-inspection link metadata noise in the main DOT Check.
- Removed non-fatal delivery route-link review cards from the main DOT Check.
- Added verifier for the real backup Jul 05 noisy-review case.

# v95.77 — Off Duty No Shipping Docs Fix

- Fixed Sign/Fix Wizard requiring shipping documents on OFF DUTY/SLEEPER-only days.
- Missing shipping docs now applies only when a day has driving, loaded route work, or ON DUTY load-work text.
- No driving event times, duty statuses, miles, route legs, or backup data changed.

