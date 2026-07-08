# Owner-Op Road Ready v95.76.0 — Safe bump of reviewed v9574b patch

This package keeps the v9574b code changes and bumps the update metadata to `95.76.0` so it can safely supersede a previously deployed `95.74.0` build and the emergency `95.75.0` rollback.

No app logic was changed from the reviewed v9574b patch except version/update metadata.

Safety confirmations from review:

- NO ROOT structure.
- No `node_modules`, `.next`, build output, or cache folders.
- Real-backup normalization keeps DRIVING event `status`, `startMin`, and `endMin` unchanged.
- July 6 route-mile suggestion from the real backup normalizes to `206`.
- July 7 equipment move normalizes to `empty/reposition` without current `113NRH53Z` carryover.
- Top-level `loadInfo` clears stale `113NRH53Z` after Drop Off / No equipment.
- Transition display text is not parsed as raw shipping-doc words.
