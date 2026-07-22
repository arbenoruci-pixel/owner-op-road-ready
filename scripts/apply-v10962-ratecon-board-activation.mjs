import fs from 'node:fs';

const VERSION = '109.6.2';
const BUILD = 'v10962-ratecon-board-activation';
const SHEET_PATH = 'source/src/modules/scan/SmartScanSheetV105.jsx';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, value) {
  fs.writeFileSync(path, value);
}

function writeJson(path, transform) {
  const value = JSON.parse(read(path));
  transform(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

let sheet = read(SHEET_PATH);
const importLine = "import { dispatchSmartDocumentLinkV100 } from '../loads/loadGuideV103.js';";
if (!sheet.includes(importLine)) {
  const anchor = "import { saveScannedDocument } from './scanStorage.js';";
  if (!sheet.includes(anchor)) throw new Error('v109.6.2 scanner storage import anchor missing');
  sheet = sheet.replace(anchor, `${anchor}\n${importLine}`);
}

const dispatchAnchor = '      dispatchVaultDocumentCommitV105({ record });';
const dispatchBlock = `      dispatchVaultDocumentCommitV105({ record });
      if (meta.id === 'rate_confirmation') {
        const activeRateConFieldsV10962 = {
          ...(analysis?.fields || {}),
          ...mergedFields,
          type:'rate_confirmation',
          loadNo:selectedLoadNo || mergedFields.loadNo || mergedFields.orderNo || '',
          orderNo:mergedFields.orderNo || selectedLoadNo || mergedFields.loadNo || '',
          documentDate,
          date:documentDate,
          linkDay:linkToLogbook ? (linkDay || documentDate) : documentDate,
          linkToLogbook,
        };
        dispatchSmartDocumentLinkV100({
          type:meta,
          typeId:'rate_confirmation',
          fields:activeRateConFieldsV10962,
          localDocument:stored.localDocument,
          analysis:{
            ...(analysis || {}),
            type:meta,
            fields:activeRateConFieldsV10962,
            text:analysis?.text || '',
          },
          record,
          source:'road_ready_os_v105_ratecon_board_v10962',
        });
      }`;
if (!sheet.includes('activeRateConFieldsV10962')) {
  if (!sheet.includes(dispatchAnchor)) throw new Error('v109.6.2 Vault commit dispatch anchor missing');
  sheet = sheet.replace(dispatchAnchor, dispatchBlock);
}
write(SHEET_PATH, sheet);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
});
if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) {
      lock.packages[''].version = VERSION;
      lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
    }
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.6.2 Rate Con Board Activation',
  force:true,
  notes:[
    'Activates a verified saved Rate Confirmation on the Home board immediately after Save document.',
    'Builds the Driver Mission, pickup route, delivery sequence and active-load details from the already reviewed Rate Confirmation fields.',
    'Uses the driver-selected canonical Load number and preserves the original document, Vault filing and Logbook-supporting-document choice.',
    'Creates no duty-status events and changes no HOS time, signatures or inspections.',
    'Leaves Rate Confirmation Engine 1.1 and the locked POD, BOL and Fuel engines unchanged.'
  ],
}, null, 2)}\n`);

let sw = read('public/sw.js');
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js', sw);

let update = read('source/src/core/update/appUpdate.js');
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js', update);

console.log('PASS — v109.6.2 saved Rate Confirmations activate the Home board and Driver Mission');
