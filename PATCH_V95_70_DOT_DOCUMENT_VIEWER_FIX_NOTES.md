# PATCH V95.70 — DOT Document Viewer Fix

Issue: DOT Roadside Documents used direct `data:` attachment links with `target="_blank"`. On iOS/PWA this can open a blank page or fail silently, especially for large saved wallet images/PDFs.

Fix:
- Added an in-app DOT document viewer modal for saved wallet attachments.
- Converts saved data URLs to Blob/Object URLs for safer preview.
- Shows images inline and PDFs in an iframe where supported.
- Added Share / Save file and Open in browser fallback actions.
- Replaced `Open document` anchors with buttons that open the viewer.

Safety:
- Does not modify logs, duty status, driving events, route legs, miles, or wallet document data.
