# PATCH v95.57 — DOT Digital Wallet

## Goal
Add a simple owner-operator DOT Digital Wallet for roadside/compliance documents without changing smart paper-log behavior.

## Added
- `source/src/core/wallet/dotWallet.js`
  - Requirement catalog
  - Wallet normalization
  - Expiration scanning
  - Severity summary
  - Section summaries
- `source/src/modules/wallet/DigitalWalletScreen.jsx`
  - Driver / Truck / Trailer / Carrier / Load / Supporting sections
  - Metadata fields
  - Local photo/PDF attachment
  - Missing/expired/soon statuses
- Home screen DOT wallet attention card
- Tools sheet DOT Wallet action
- App route/state for `dotWallet`
- `scripts/verify-dot-wallet-v9557.mjs`

## Document logic
Roadside/core items:
- CDL / driver license
- Medical Certificate / waiver/SPE if applicable
- Truck registration
- Trailer registration when used
- Annual/periodic inspection for truck/trailer
- Insurance / cab card
- BOL / shipping papers
- Logs / RODS remain handled by Logbook but linked from Wallet

Carrier/recommended items:
- MCS-90
- Operating authority / MC / USDOT
- UCR
- IFTA license/decal
- IRP cab card
- Lease agreement if applicable
- Fuel receipts/supporting documents

## Expiration rules
- Missing required roadside doc = high priority
- Expired required roadside doc = high priority
- Expiring within 30 days = review
- Expiring within 60 days = watch
- OK = ready

## Notes
- Attachments are saved locally in app state/IndexedDB.
- This is an in-app wallet/reminder system, not a replacement for FMCSA/state filings.
- No GPS/motion tracking was added.
- No DOT Check/signing/timeline logic was changed.
