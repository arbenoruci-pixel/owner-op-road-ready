# Driving line on the originating day — 110.3.72

## Report and reproduced baseline
The driver reports that the September 17 Driving trace stops around 22:05, while the trip appears after midnight on September 18. The screenshot uses America/New_York home-terminal time. Raw records from the driver's phone have not been inspected.

Diagnostic commit d07324578c8a1d667e464e19b5e40a5c60451e10 built the exact current main materialization chain. GitHub Actions run 35314393079 reproduced the mismatch: a stored 22:05–22:06 origin projects to 23:42 while that day is current, then drops back to 22:06 after terminal midnight. An explicit next-day midnight continuation projects to 00:42 while the origin remains short. The projection exits for historical days; the read-only duty view deliberately retains exact Driving boundaries, so it ignores the linked continuation.

## Scope
A read-only helper completes only the final recorded Driving origin whose next calendar day's actual midnight continuation explicitly names the origin day/event. During the immediate midnight tick, an exact active manual session may establish the old day's endpoint while no next-day record exists yet. Ambiguous/voided/deleted origins or bridges, explicit End edits, legacy historical End corrections and independent next-day Driving are excluded.

Graph, event list and the existing mileage view use the same bounded result. Current-day Now, raw Edit/Insert/Select intervals, duty storage, signatures, audit history, recorded locations and other-day rows remain unchanged. No new Driving row is invented. The projection does not certify the day, remove a raw coverage warning or rewrite an export; raw-record corrections still require the driver's existing review/edit workflow.

This is an independent patch from Reader PR #120. Do not combine the two materialization chains without preserving release ordering and both sets of tests. In particular, publishing the Reader 110.3.71 finalizer after 110.3.72 requires a later reconciled release identity.

## Verification
Nineteen pure helper cases passed locally. The exact candidate production build additionally executes the installed helper through the real React DayLogScreen, checking originating-day midnight, current-day Now, unchanged Select, manual End and unlinked historical Driving. Mobile Chromium/WebKit tests exercise the compiled app with synthetic local records, intercepted account APIs, unchanged history and reload. CI outcomes and preview status must be checked for the exact candidate SHA before publication; no physical iPhone verification is claimed.
