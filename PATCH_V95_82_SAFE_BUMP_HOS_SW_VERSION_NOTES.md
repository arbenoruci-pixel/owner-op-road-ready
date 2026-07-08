# v95.82 — Drive Mode HOS clocks safe bump

Purpose:
- Keep the v95.81 Drive Mode / HOS clock implementation.
- Correct the service-worker version string so iPhone/PWA update detection is reliable after v95.79/v95.81.
- Preserve all duty-status records and prior route/sign/off-duty fixes.

Changed:
- package.json/package-lock version: 95.82.0.
- appUpdate CURRENT_APP_VERSION: 95.82.0.
- public/app-version.json: 95.82.0.
- public/sw.js OWNER_OP_SW_VERSION: 95.82.0.

Not changed:
- No driving event start/end/status changes.
- No duty event changes.
- No automatic driving events.
- No GPS auto-driving.
- No route/load/miles/signing data changes.
- Service worker cache behavior was not changed; only version metadata was corrected.

Review result:
- v95.81 HOS verifier scripts pass.
- Real-backup route/sign/off-duty verifiers pass when run against road-ready-backup-20260707-213526.json.
