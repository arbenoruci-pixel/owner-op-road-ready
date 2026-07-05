You are reviewing an owner-operator smart paper-log app before field use.

App context:
- App name: Owner-Op Road Ready.
- Purpose: smart digital paper RODS / ELD-exempt logbook, DOT check, inspection, signing, route/shipping, and previous-7-day readiness.
- It is NOT meant to be a full ELD or GPS tracking system.
- It should behave like a clean, smart paper log: detect required fields, timeline problems, DOT/RODS review issues, and offer exact fix flows.
- Keep UI simple for an owner-operator on iPhone Safari / Add to Home Screen.
- Latest working ZIP/version to review: v95.41 PWA + deep scan prompt, based on v95.40 simple DOT Check modal.

Most important product rules:
1. Do not add complexity unless it protects DOT/RODS correctness or makes the driver faster.
2. Main log screen should stay clean: graph + event list + Insert / Status / Drive.
3. Edit flow should be simple: tap event or graph segment → edit event.
4. DOT Check should be one button/card on Sign tab, opening a focused modal with current-day issues first.
5. Previous 7 days should not scare the user with a huge table by default; it should stay collapsed unless needed.
6. Fix Wizard and DOT Check must show the problem day and route to the exact issue.
7. Location continuity, pre-trip missing, inspection link, previous unsigned/missing days, and shipping/route issues should be detected smartly.
8. Avoid state-mile breakdown complexity. DOT should ask for total miles if missing and may show simple speed-based suggestions.
9. GPS/motion automatic driving should remain disabled for now; this is smart paper log mode.
10. No “do not falsify” wording in UI. Certification text is enough: “I certify this log is true and correct.”

Current important implemented behavior:
- v95.30: DOT Check detects missing ON DUTY Pre-trip before first DRIVING and can add 15m ON DUTY Pre-trip before first driving, linking inspection.
- v95.31-v95.34: DOT Check detects location continuity errors, pre-trip/driving location mismatch, inspection link review, previous unsigned days, and recommended location-fix direction.
- v95.35: removed selected Move/Edit/Void bar. Tap event or graph opens Edit.
- v95.36: inside Edit, tapping another graph segment switches to that event unless unsaved changes exist.
- v95.37: compact edit sheet and removed obsolete manual GPS/miles warning.
- v95.38: status reason chips are multi-select; saved reason text joins with “ · ” and route/pre-trip logic still detects combined reasons.
- v95.39: location continuity uses a custom modal with red/green cards instead of native prompt.
- v95.40: Sign tab has one simple DOT Check button/modal; current-day issues are primary and previous 7 days are collapsed.

Deep scan task:
Please review the code and app behavior as if preparing it for a real owner-operator to start using this week.

Return your answer in this structure:

A) GO / NO-GO FOR FIELD TEST THIS WEEK
- Give a clear status: GO, GO WITH WATCH ITEMS, or NO-GO.
- Explain in plain language.

B) HIGH-RISK LOGIC BUGS TO FIX FIRST
Focus on:
- 24-hour coverage
- gaps/overlaps
- current day vs past day behavior
- signed day recertification
- pre-trip insertion and inspection linking
- location continuity fixes
- previous 7 days package
- route/shipping/BOL consistency
- DOT Check routing/actions
- multi-reason status chips
- edit sheet switching between events
- service/local storage/sync risk
For every issue:
- Why it matters
- How to reproduce
- Expected behavior
- Proposed fix

C) DOT CHECK SMARTNESS REVIEW
Evaluate whether the DOT Check catches and fixes:
- Missing Pre-trip ON DUTY before Driving
- Inspection complete but no linked Pre-trip
- Pre-trip after/overlapping Driving
- Pre-trip and Driving locations mismatch
- Location changes without Driving
- Missing city/state
- Missing shipping docs/BOL/no-load note
- Missing truck/trailer
- Driving miles missing total
- Current day active notice
- Previous day missing
- Previous day incomplete
- Previous day unsigned
- HOS 11h/14h/30m/70h review
For each missing or weak item, propose the exact issue text and action label.

D) UI / UX CLEANUP
Review iPhone Safari / Add to Home Screen use:
- Sign tab should not be crowded.
- DOT Check should not scare user with too many things at once.
- Edit sheet should be compact.
- Event rows and graph taps should feel predictable.
- Fix modals should clearly show the problem and the “Fix it” action.
- No unnecessary wording, no lecture text.
- No confusing buttons like old Move/Edit/Void bar.
Give exact UI changes.

E) PWA / ADD TO HOME SCREEN REVIEW
Check whether the app is ready to be installed to iPhone Home Screen:
- manifest
- icons
- apple touch icon
- mobile web app meta tags
- theme color
- viewport fit / safe areas
- standalone display issues
- offline/local persistence expectation
- Safari toolbar / bottom safe area
List any missing items and exact fix.

F) TEST PLAN FOR THIS WEEK
Give a practical 1-day and 3-day test plan:
- create fresh logs
- add multi-reason ON DUTY
- add pre-trip + pickup
- drive event
- stop event
- DOT Check
- sign
- edit signed day and recertify
- previous 7 days
- delete route leg
- Add to Home Screen launch
- airplane mode/local save
- refresh/reopen

G) COPY/PASTE PATCH PLAN
Use this format only:

PATCH_ID: P1
AREA: short area name
ISSUE: what is wrong
APP_ACTION: exact action to implement
FILES_TO_CHECK: file paths
EXPECTED_RESULT: what should happen after fix
PRIORITY: P0 / P1 / P2

H) FINAL RECOMMENDATION
Summarize the 5–10 highest-value fixes/cleanups to do before real use.
Do not rewrite the whole app. Keep it as a smart paper log.
