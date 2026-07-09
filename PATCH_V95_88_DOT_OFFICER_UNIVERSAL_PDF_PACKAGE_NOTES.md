# PATCH v95.88 — DOT Officer Universal PDF Package

## Goal
Make roadside/DOT sharing reliable when sent through WhatsApp, email, phone file preview, Android, iPhone, desktop, Google Drive, or browser PDF viewer.

## Changes
- Added primary `Share DOT Officer PDF` action.
- Added `Download Officer PDF` fallback.
- Generated one self-contained PDF with cover page, log pages, document index, and roadside document image pages.
- PDF does not require JavaScript, clickable embedded data URLs, external image links, or HTML viewer behavior.
- HTML package remains as secondary backup.
- Added mobile responsive HTML fallback so text/tables wrap on phones.
- Kept documents embedded from wallet data; image docs are flattened into PDF pages.

## Safety
- No duty event times changed.
- No driving event times changed.
- No statuses changed.
- No HOS logic changed.
- No timezone logic changed.
- No route/load/miles/signing/backup/import/GPS behavior changed.
