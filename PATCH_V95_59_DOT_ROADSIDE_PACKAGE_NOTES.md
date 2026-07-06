# PATCH V95.59 — DOT Roadside Package View

Goal: DOT Mode should show officer-ready logs and wallet documents together, not hide wallet docs inside the normal driver wallet screen.

Changes:
- DOT Mode now opens an officer-facing Roadside Package.
- Added Package / Logs / Documents switch inside DOT Mode.
- Package view shows:
  - Logs / RODS summary for today + previous 7 days.
  - Day strip for direct log opening.
  - Roadside Documents list from DOT Digital Wallet.
- Documents view groups wallet docs by:
  - Driver
  - Truck / Power Unit
  - Trailer
  - Carrier
  - Current Load
  - Supporting Docs
- Each document row shows:
  - status: Ready, Missing, Expired, Review, Watch
  - expiration / key details
  - saved filename when available
  - Open document action for saved photo/PDF attachments
- Printable/share DOT report now includes Roadside Documents before daily log pages.
- Logs remain visible and officer can open any day from today + previous 7.
- No duty-status, signing, coverage wizard, GPS, or storage logic changed.

Acceptance:
- DOT Mode must show Roadside Package.
- Officer can tap Documents and see wallet docs.
- Officer can tap Logs and see graph + event rows.
- Saved wallet files can be opened from DOT Mode.
- Report export includes wallet docs plus logs.
