import fs from 'node:fs';

const VERSION='109.7.2';
const BUILD='v10972-save-dispatch-isolation';
const SHEET='source/src/modules/scan/SmartScanSheetV105.jsx';

function read(path){ return fs.readFileSync(path,'utf8'); }
function write(path,value){ fs.writeFileSync(path,value); }

let sheet=read(SHEET);
const before=`      setTimeout(() => {
        // Rate Confirmations intentionally refresh the active load board immediately.
        // POD/BOL/supporting documents are already durable in the Vault/business store;
        // do not broadcast a full-app commit while the iPhone save sheet is painting.
        // The Documents screen reads the persisted store when it opens, so no document
        // is lost and the save confirmation remains stable on memory-constrained devices.
        if (activeRateConFieldsV10964) {
          try { dispatchVaultDocumentCommitV105({ record }); } catch {}
          try {
            dispatchSmartDocumentLinkV100({
              type:meta,
              typeId:'rate_confirmation',
              fields:activeRateConFieldsV10964,
              localDocument:stored.localDocument,
              analysis:activeRateConAnalysisV10964,
              record,
              source:'road_ready_os_v105_ratecon_board_v10964',
            });
          } catch {}
        }
      }, 30);`;
const after=`      // The document and load are already durable in the local Vault/business store.
      // Do not dispatch global app-refresh events while the iPhone save confirmation
      // is mounting. The parent shell reloads persisted state after the scanner closes.
      try {
        window.__ROAD_READY_PENDING_DOCUMENT_REFRESH_V10972__ = {
          type:meta.id,
          loadNo:activeRateConFieldsV10964?.loadNo || selectedLoadNo || '',
          savedAt:Date.now(),
        };
      } catch {}`;
if(!sheet.includes(after)){
  if(!sheet.includes(before)) throw new Error('v109.7.2 global save-dispatch block missing');
  sheet=sheet.replace(before,after);
}
write(SHEET,sheet);

for(const path of ['package.json','package-lock.json']) if(fs.existsSync(path)){
  const data=JSON.parse(read(path));
  data.version=VERSION;
  data.engines={...(data.engines||{}),node:'24.x'};
  if(data.packages?.['']){ data.packages[''].version=VERSION; data.packages[''].engines={...(data.packages[''].engines||{}),node:'24.x'}; }
  write(path,JSON.stringify(data,null,2)+'\n');
}
const releasedAt=new Date().toISOString();
write('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt,updatedAt:releasedAt,label:'v109.7.2 Scanner Save Stability',force:true,notes:['Prevents iPhone client crashes after saving scanned documents.','Defers Home/load refresh until the scanner closes.','Preserves the original document, load folder, Risk Review and Logbook data.']},null,2)+'\n');
let sw=read('public/sw.js');
sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw=sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js');
update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`);
update=update.replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js',update);
console.log('PASS — v109.7.2 scanner save global dispatch isolated');
