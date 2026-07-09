
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

