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

const dot = read('source/src/modules/dot/DotMode.jsx');
const css = read('source/src/styles.css');
const wallet = read('source/src/core/wallet/dotWallet.js');
const pkg = JSON.parse(read('package.json'));
const appVersion = JSON.parse(read('public/app-version.json'));

ok(dot.includes("../../core/wallet/dotWallet.js"), 'DotMode imports wallet helpers');
ok(dot.includes('officerWalletRows'), 'DotMode builds officer wallet rows');
ok(dot.includes('OfficerDocumentList'), 'DotMode renders officer document list');
ok(dot.includes('WalletDocLink'), 'DotMode can open saved wallet attachment');
ok(dot.includes('Open document'), 'Officer has visible Open document action');
ok(dot.includes('Roadside Package'), 'Officer view is labeled Roadside Package');
ok(dot.includes('Logs / RODS'), 'Officer view has Logs / RODS section');
ok(dot.includes('Roadside Documents'), 'Officer view has Roadside Documents section');
ok(dot.includes('dot-roadside-switch'), 'Officer view has Package / Logs / Documents switch');
ok(dot.includes('officerPane'), 'Officer view can switch between package, logs, documents');
ok(dot.includes('walletReportSectionHtml'), 'Printable/share report includes wallet documents');
ok(dot.includes('walletSummary.fileCount'), 'Report shows saved file count');
ok(dot.includes('days.map(day => <DailyPaper'), 'Report still includes all log days');
ok(dot.includes('dot-days-strip clean'), 'Officer view still exposes day list');
ok(dot.includes('useState(localDayKey())'), 'DOT Mode selected day anchors to today');
ok(dot.includes('dayRange(localDayKey())'), 'DOT Mode days are today + previous 7');
ok(dot.includes('selectedDay'), 'Officer can open specific log day');
ok(dot.includes('LogGraph events={selectedEvents}'), 'Officer logs still show graph');
ok(dot.includes('selectedEvents.map'), 'Officer logs still show event rows');
ok(dot.includes('attachmentDataUrl'), 'Wallet attachment data URLs are used');
ok(dot.includes('target="_blank"'), 'Document links open separately');
ok(wallet.includes('driver_license'), 'Wallet still has CDL requirement');
ok(wallet.includes('medical_certificate'), 'Wallet still has medical certificate requirement');
ok(wallet.includes('truck_registration'), 'Wallet still has truck registration requirement');
ok(wallet.includes('insurance_card'), 'Wallet still has insurance requirement');
ok(css.includes('.dot-roadside-switch'), 'CSS for roadside switch exists');
ok(css.includes('.dot-doc-card'), 'CSS for doc card exists');
ok(css.includes('.dot-doc-open'), 'CSS for Open document action exists');
ok(css.includes('.wallet-doc-report'), 'CSS for report wallet section exists');
ok(pkg.version === '95.60.0', 'package version is 95.60.0');
ok(appVersion.version === '95.60.0', 'app-version is 95.60.0');

console.log(`verify-dot-roadside-package-v9559: ${pass} checks passed`);
