# Patch v92.2 — Easy-Eyes / RoadGuard UI (compact, calm, professional)

## Goal
Reduce eye strain and visual load for a driver who needs to open the app,
see the most important problem in ~2 seconds, fix it, and keep driving.
The functional behavior was already correct; this patch is a **visual layer
only** — more compact, softer colors, clearer hierarchy. No timeline, signing,
compliance, routing, or data-engine logic was changed.

## What was wrong (visually)
- Type was oversized across every screen (headings 21–28px, body 16–17px).
- Cards were large and bubbly (16–22px radius), with generous 14–26px padding.
- Saturated blue (`#0b7dec` / `#2563eb`) and a hard red (`#dc2626` / `#e25d5d`)
  were used everywhere, so nothing stood out and everything felt loud.
- The active-day marker used an alert-red ring even though an active day is a
  notice, not a defect.

## Changes
All visual changes live in **one appended block** at the end of
`source/src/styles.css`: `/* V92.2  EASY-EYES ... */` (~240 lines).
It wins by source order, so the existing rules are untouched and the layer is
easy to review or revert.

- **Color system (softer, semantic):** calm blue `#2f6db0` for primary actions
  only; muted brick red `#c14a44` for *true* fix-required / urgent only; amber
  `#9a6b16` for review/warning; neutral slate for normal info and notices. All
  exposed as `--ee-*` tokens at `:root`.
- **Compaction everywhere:** smaller type scale, tighter section/card/row
  padding, calmer 10–13px radii, button heights reduced to 40–46px while staying
  finger-friendly (≥40px tap target). Headers and tabs are shorter.
- **A) Day Log:** smaller Log Check card; compact event rows and action rail;
  the active-day ring is now neutral; **the Certify button now looks
  unavailable (neutral) when the log is not ready** via a new `.cert-line.not-ready`
  state (`DayLogScreen.jsx`), but it still works — tapping surfaces the existing
  block message. "Active day / Not certified yet" reads as a small neutral label.
- **B) Sign / RoadGuard:** compact summary header (18px headline, 19px score
  numbers), calmer score tiles, neutral notice strip. **One strong global "Copy
  Log for ChatGPT"** stays primary; the per-issue "Copy" buttons are
  de-emphasised to quiet secondary chips. The active-day sign button now reads
  **"Sign after day is complete"** (neutral) instead of the red "Fix Issues
  Before Sign" when the only blocker is the active-day notice (`DayLogScreen.jsx`).
- **C) Ask ChatGPT helper:** already collapsed-by-default with a bottom-sheet
  paste flow (from v92.0); this patch makes the collapsed row and actions
  compact so it no longer dominates the Sign screen.
- **D) DOT Inspection Mode:** smaller headings/buttons, calmer accents, official
  paper look preserved; report action row keeps iPhone safe-area bottom padding.
- **E) Form tab:** compact rows, labels, and values.
- **F) Inspection tab:** compact headline, check grid, and prompt card.
- **Home:** calmer hero, tighter cards, muted (easy-on-eyes) tile colors.
- **iPhone safety:** Certify line, action rail, RoadGuard panel, and DOT report
  actions keep `env(safe-area-inset-bottom)` spacing so nothing sits under the
  Safari toolbar. `prefers-reduced-motion` is respected.

## Files changed
- `source/src/styles.css` — appended the V92.2 Easy-Eyes layer (no existing
  rules edited).
- `source/src/modules/logbook/DayLogScreen.jsx` — two display-only refinements
  (neutral active-day sign label; `not-ready` class on the certify line).
- `scripts/verify-easy-eyes-v922.mjs` — new offline verification (Node built-ins).
- `package.json` — added `test:easyeyes` script.

## Safety behavior (unchanged and re-verified)
- The app still never asks the driver to falsify records. ChatGPT "apply" still
  only auto-fills safe fields (name, carrier, office, unit, BOL/empty) on driver
  confirmation; time / status / HOS items remain **Review/Open only**.
- Signing is still gated: `signLogDay()` aborts via `signBlockMessage()` whenever
  any fix-required issue exists, and the sign button stays disabled on blockers.
  The certify button routes through the same gate. There is **no path** to
  certify/sign a fix-required or active-day log.
- The active day is still categorised as a *notice*, not a defect.
- Continuous-timeline engine, HOS engine, RoadGuard, and DOT report are byte-for-
  byte unchanged and still read the same normalized `displayEventsForDay` data.

## Validation
> Note: `npm install` / `npm run build` cannot run in this offline sandbox
> (no npm registry access, no `node_modules`). Validation was done with the
> tools available:
- **Syntax/parse:** all 54 `.js`/`.jsx`/`.mjs` files parsed with the TypeScript
  compiler (JSX mode) — **0 syntax errors**.
- **Imports:** all relative imports resolve — **0 unresolved**.
- **`npm run test:easyeyes`** — **20/20 checks green** (CSS integrity, the two
  display tweaks, and the compliance/routing invariants listed above).
- **`npm run test:offline`** — **passed** (no regression to the sync layer).
- **No route files were added or changed** (the app has no client router at all).

## Issues remaining / honest caveats
- A real `next build` and an on-device Safari visual pass should be run in your
  normal environment before shipping; they could not run here.
- This patch intentionally did not rewrite on-screen copy beyond resizing. If you
  want shorter wording in specific labels, that can be a small follow-up.
