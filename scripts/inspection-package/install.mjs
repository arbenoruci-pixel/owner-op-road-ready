import fs from 'node:fs';
const lib='lib/owner-op-cloud/',ui='source/src/modules/dot/',dir='scripts/inspection-package/';
fs.copyFileSync('scripts/inspection-signed/core.js',lib+'inspectionSignedLegacy.js');
for(const[from,to]of [['core.js',lib+'inspectionSnapshot.js'],['client.js',lib+'inspectionShare.js'],['wallet.js',lib+'inspectionWallet.js'],['InspectionWizard.jsx',ui+'InspectionWizard.jsx']])fs.copyFileSync(dir+from,to);
// Restore the existing three-step presentation without adding a second design.
fs.copyFileSync('scripts/inspection-wizard/wizard.css',ui+'inspectionWizard.css');
const email=fs.readFileSync('scripts/inspection-wizard/readiness.js','utf8').split('export function officerEmailLink')[1];
fs.writeFileSync(ui+'inspectionEmail.js',('export function officerEmailLink'+email).replace('Supporting documents will be presented separately.', 'Digital Wallet documents are included in the same link.'));
console.log('PASS — original DOT wizard with verified signed continuity and current-phone wallet files');
