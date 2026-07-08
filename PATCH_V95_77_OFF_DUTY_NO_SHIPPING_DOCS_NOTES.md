# Patch v95.77 — Off Duty Days Do Not Require Shipping Docs

## Problem
The Sign/Fix Wizard still flagged full OFF DUTY / no-load days, such as Sat Jul 04, with:
"Shipping document information is missing."

That is wrong. A completed day with only OFF DUTY/SLEEPER and no driving or load work does not need a BOL/shipping document.

## Fix
- Added `hasShippingDocsRequirementForDay(...)` in signing logic.
- Missing shipping-doc warnings now appear only when the day has real driving, loaded route work, or ON DUTY load-work text.
- OFF/SB-only days do not trigger a shipping-doc fix item.
- Empty/reposition/bobtail-style days are also treated as documented when noted that way.

## Safety
- Does not change driving event times.
- Does not change duty statuses.
- Does not change route legs or miles.
- Does not change backup/import data.
