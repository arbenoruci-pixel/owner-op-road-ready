# PATCH V95.53 — Compact Visible Graph

## Goal
The log graph should be narrower/shorter and easier to see on iPhone, closer to the readable Motive-style graph shown in testing.

## Changes
- Reduced base graph height from 420 to 344 viewBox units.
- Reduced edit graph height from 540 to 420 viewBox units.
- Reduced duty-row height from 96 to 76 so the graph is visually tighter.
- Increased SVG row/time/total label sizes so labels stay readable after the graph is compacted.
- Increased duty trace width from 6 to 7 and darkened the base trace.
- Slightly strengthened major grid lines for visibility.
- Tightened home graph card padding/margins.
- Kept graph/display-only behavior separate from raw compliance validation.

## Safety
- No DOT/signing logic changes.
- No storage/write-base changes.
- No GPS or service worker changes.
- Graph remains display-only and uses the existing continuous-line SVG path contract.
