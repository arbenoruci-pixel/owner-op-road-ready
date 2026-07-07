#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let pass = 0;
function ok(condition, message) {
  if (!condition) throw new Error(message);
  pass += 1;
}
function versionAtLeast(version, base = '95.70.0') {
  const a = String(version || '').split('.').map(n => Number(n || 0));
  const b = base.split('.').map(n => Number(n || 0));
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return true;
}

const dot = read('source/src/modules/dot/DotMode.jsx');
const css = read('source/src/styles.css');
const pkg = JSON.parse(read('package.json'));
const appVersion = JSON.parse(read('public/app-version.json'));

ok(dot.includes('driverInspectionReadiness'), 'driver-only readiness helper missing');
ok(dot.includes('dot-driver-review-card'), 'driver review card missing from DOT home');
ok(dot.includes('Fix these before handing the phone over.'), 'driver-only fix copy missing');
ok(dot.includes('officerPresentationWalletRows'), 'officer-safe document filter missing');
ok(dot.includes('hasOfficerPresentableDoc'), 'presentable-doc guard missing');
ok(dot.includes("officerSafe ? 'present' : documentStatusClass(row)"), 'officer document cards should avoid missing/review classes');
ok(dot.includes('officerDocumentLabel(row)'), 'officer document labels should be neutral');
ok(dot.includes('Details saved'), 'neutral no-file label missing');
ok(dot.includes('No documents selected for display.'), 'neutral empty docs copy missing');
ok(dot.includes('availableLogDays'), 'officer log count should use available days');
ok(dot.includes('signedLogDays'), 'officer signed count should be neutral package data');
ok(dot.includes('walletSummary.count'), 'officer document count should use presentable docs');
ok(!dot.includes('unsigned previous'), 'officer view still exposes unsigned previous count');
ok(!dot.includes('review days'), 'officer view still exposes review days count');
ok(!dot.includes('No blocking review items shown'), 'officer view still mentions review items');
ok(!dot.includes('Review:</b>'), 'printable DOT package still shows review list');
ok(!dot.includes('Review items:</b>'), 'HTML DOT package still shows review items');
ok(!dot.includes('<th>Status</th><th>Details</th><th>File</th>'), 'wallet report still includes status column');
ok(dot.includes('<th>Section</th><th>Document</th><th>Details</th><th>File</th>'), 'wallet report neutral header missing');
ok(css.includes('v95.70 DOT Inspection officer-safe package'), 'v95.70 CSS marker missing');
ok(css.includes('.dot-driver-review-card'), 'driver review CSS missing');
ok(css.includes('.dot-doc-card.present'), 'officer document present CSS missing');
ok(versionAtLeast(pkg.version), 'package version should be 95.70.0 or newer');
ok(versionAtLeast(appVersion.version), 'app-version should be 95.70.0 or newer');
ok(String(appVersion.build || '').includes('officer-safe') || versionAtLeast(appVersion.version, '95.71.0'), 'app-version build label compatible');

console.log(`verify-dot-inspection-officer-safe-v9570: ${pass} checks passed`);
