import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  DOT_DOCUMENT_REQUIREMENTS,
  DOC_SECTIONS,
  emptyWallet,
  normalizeWallet,
  evaluateDotWallet,
  sectionSummary,
  derivedExpiresOn,
  isoDate,
} from '../source/src/core/wallet/dotWallet.js';

const root = path.resolve(process.cwd());
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

ok(DOC_SECTIONS.length >= 6, 'has wallet sections');
ok(DOT_DOCUMENT_REQUIREMENTS.some(d => d.id === 'driver_license'), 'has CDL');
ok(DOT_DOCUMENT_REQUIREMENTS.some(d => d.id === 'medical_certificate'), 'has medical certificate');
ok(DOT_DOCUMENT_REQUIREMENTS.some(d => d.id === 'truck_registration'), 'has truck registration');
ok(DOT_DOCUMENT_REQUIREMENTS.some(d => d.id === 'insurance_card'), 'has insurance');
ok(DOT_DOCUMENT_REQUIREMENTS.some(d => d.id === 'truck_annual_inspection'), 'has truck annual inspection');
ok(DOT_DOCUMENT_REQUIREMENTS.some(d => d.id === 'bol_shipping_papers'), 'has BOL/shipping papers');
ok(DOT_DOCUMENT_REQUIREMENTS.every(d => d.section && d.title && d.required), 'all requirements have basic fields');

const wallet = normalizeWallet(emptyWallet());
const emptySummary = evaluateDotWallet(wallet, new Date('2026-07-05T12:00:00'));
ok(emptySummary.status === 'high', 'empty wallet is high priority');
ok(emptySummary.counts.missing > 0, 'empty wallet has missing docs');

const filledWallet = normalizeWallet({
  documents: {
    driver_license: { present:true, expiresOn:'2027-07-05', number:'D123', state:'IL' },
    medical_certificate: { present:true, expiresOn:'2027-07-05' },
    truck_registration: { present:true, expiresOn:'2027-07-05', unit:'529', plate:'ABC', state:'IL' },
    truck_annual_inspection: { present:true, inspectionDate:'2026-07-01' },
    trailer_registration: { present:true, expiresOn:'2027-07-05', trailer:'T1' },
    trailer_annual_inspection: { present:true, expiresOn:'2027-07-05', trailer:'T1' },
    insurance_card: { present:true, expiresOn:'2027-07-05', policyNo:'P1' },
    mcs90_endorsement: { present:true, expiresOn:'2027-07-05' },
    operating_authority: { present:true, mcNumber:'871792', usdotNumber:'123' },
    ucr_registration: { present:true, expiresOn:'2027-07-05', year:'2027' },
    ifta_license: { present:true, expiresOn:'2027-07-05', year:'2027' },
    irp_cab_card: { present:true, expiresOn:'2027-07-05', unit:'529' },
    bol_shipping_papers: { present:true, bolNo:'BOL1', loadNo:'L1' },
    fuel_receipts: { present:true, quarter:'Q3 2026' },
  },
});
const filledSummary = evaluateDotWallet(filledWallet, new Date('2026-07-05T12:00:00'));
ok(filledSummary.status === 'ok', 'filled wallet is OK');
ok(filledSummary.counts.high === 0, 'filled wallet has no high items');

const soonWallet = normalizeWallet({ documents: { ...filledWallet.documents, medical_certificate: { present:true, expiresOn:'2026-07-20' } } });
const soonSummary = evaluateDotWallet(soonWallet, new Date('2026-07-05T12:00:00'));
ok(soonSummary.status === 'review', '30-day expiry is review');
ok(soonSummary.rows.find(r => r.requirement.id === 'medical_certificate').status === 'expires_soon', 'medical flagged expires soon');

const expiredWallet = normalizeWallet({ documents: { ...filledWallet.documents, insurance_card: { present:true, expiresOn:'2026-07-01' } } });
const expiredSummary = evaluateDotWallet(expiredWallet, new Date('2026-07-05T12:00:00'));
ok(expiredSummary.status === 'high', 'expired insurance is high');
ok(expiredSummary.rows.find(r => r.requirement.id === 'insurance_card').status === 'expired', 'insurance flagged expired');

const annualReq = DOT_DOCUMENT_REQUIREMENTS.find(d => d.id === 'truck_annual_inspection');
ok(derivedExpiresOn(annualReq, { inspectionDate:'2026-07-01' }) === '2027-07-01', 'annual inspection derives 12-month expiry');
ok(isoDate(new Date('2026-01-02T15:00:00')) === '2026-01-02', 'isoDate formats local date');

const driverSection = sectionSummary(filledSummary.rows, 'driver');
ok(driverSection.status === 'ok', 'driver section OK');

const app = read('source/src/app/App.jsx');
ok(app.includes("import DigitalWalletScreen"), 'App imports wallet screen');
ok(app.includes('dotWallet: normalizeWallet'), 'App normalizes dotWallet');
ok(app.includes("state.view === 'wallet'"), 'App has wallet route');
ok(app.includes('saveWalletDocument'), 'App saves wallet documents');

const home = read('source/src/modules/home/HomeScreen.jsx');
ok(home.includes('evaluateDotWallet'), 'Home evaluates wallet');
ok(home.includes('rr-wallet-card'), 'Home renders wallet card');
ok(home.includes('onOpenWallet'), 'Home exposes wallet open action');

const tools = read('source/src/shared/ui/ToolsSheet.jsx');
ok(tools.includes('DOT Digital Wallet'), 'Tools has wallet option');

const walletScreen = read('source/src/modules/wallet/DigitalWalletScreen.jsx');
ok(walletScreen.includes('type="file"'), 'Wallet supports file attachment');
ok(walletScreen.includes('expiresOn'), 'Wallet editor supports expiry dates');
ok(walletScreen.includes('Open logs / RODS'), 'Wallet links to logs/RODS');

console.log(`verify-dot-wallet-v9557: ${checks} checks PASS`);
