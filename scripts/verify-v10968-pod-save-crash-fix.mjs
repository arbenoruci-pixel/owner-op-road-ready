import fs from 'node:fs';
import assert from 'node:assert/strict';

const sheet = fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx', 'utf8');
assert.match(sheet, /if \(activeRateConFieldsV10964\) \{\s*try \{ dispatchVaultDocumentCommitV105\(\{ record \}\); \} catch \{\}/, 'Immediate document commit is not restricted to Rate Confirmations');
assert.doesNotMatch(sheet, /setTimeout\(\(\) => \{\s*try \{ dispatchVaultDocumentCommitV105\(\{ record \}\); \} catch \{\}\s*if \(activeRateConFieldsV10964\)/, 'Legacy full-app commit still runs for POD/BOL');
assert.match(sheet, /onClose\?\.\(\); \} catch \{\} window\.setTimeout\(\(\) => \{ try \{ onOpenBusiness\?\.\('documents'\)/, 'Saved-screen navigation is not isolated from the save paint');
assert.match(sheet, /setSaved\(savedViewV10964\);\s*setStage\('saved'\)/, 'Compact saved confirmation remains required');
console.log('PASS — v109.6.8 POD save crash isolation');
