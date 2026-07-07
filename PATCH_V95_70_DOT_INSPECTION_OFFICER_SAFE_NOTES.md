# PATCH V95.70 — DOT Inspection Officer-Safe Package

## Issue
DOT Inspection / DOT Mode was showing app review language to the officer, including missing/review document status and log review counts. Driver needs to know what is missing, but officer view should show only the roadside package the driver is presenting.

## Fix
- Added a driver-only review card on DOT Inspection home before handoff.
- Officer view now shows only package counts: displayed log days, signed logs, and saved documents.
- Officer Documents tab filters out missing wallet requirements and shows only present/saved documents.
- Officer Documents tab uses neutral labels like `Open file` / `Details`, not `Missing`, `Expired`, or `Review`.
- Printable/share report hides review issue lists and wallet status labels.
- Empty officer log days use neutral `No rows to display` copy.

## Safety
- No duty status event changes.
- No route, load, mileage, signing, wallet storage, or backup logic changes.
- Driver-facing review still flags missing logs, unsigned logs, log review items, missing documents, expired documents, and expiring-soon documents before opening officer view.

## Expected Result
When stopped for DOT:
1. Driver opens DOT Inspection.
2. Driver sees private review items first.
3. If handing phone to officer, officer sees only Roadside Package tabs: Package, Logs, Documents.
4. Officer does not see app-generated missing/review warning cards.
