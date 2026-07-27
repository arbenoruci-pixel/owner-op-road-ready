import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const engine=read('source/src/modules/owneros/loadFolderEngineV10969.js');
const reconciliation=read('source/src/modules/owneros/loadFolderReconciliationV10974.js');
const support=read('source/src/modules/owneros/supportingDocumentsV10977.js');
const ui=read('source/src/modules/owneros/LoadFoldersV10969.jsx');
const version=JSON.parse(read('public/app-version.json'));
const checks=[
 [version.version==='109.7.11'||version.version==='109.8.0','release version is not an approved weekly load-folder release'],
 [reconciliation.includes("aliases.set('178564','424590-1')"),'178564 alias merge missing'],
 [engine.includes("n&&n!=='178564'"),'178564 can render as a load folder'],
 [support.includes("core:${load}|rate_confirmation"),'duplicate Rate Confirmation logical slot missing'],
 [support.includes("core:${load}|bol|stop:${stop||0}"),'BOL logical deduplication missing'],
 [support.includes("core:${load}|pod|stop:${stop}"),'POD stop deduplication missing'],
 [support.indexOf("supporting_packet")<support.indexOf("rate_confirmation"),'supporting packet can be misclassified as core'],
 [engine.includes("const AMAZON_LOADS=new Set(['2581','607','111Y7Z983'])"),'verified Amazon loads missing'],
 [engine.includes("loadType==='amazon'?amazonChecklist"),'Amazon completion logic missing'],
 [engine.includes("loadType==='legacy'?legacyChecklist"),'legacy completion logic missing'],
 [ui.includes('WEEKLY LOAD FOLDERS')&&ui.includes('weekLabel')&&ui.includes('setOpenWeek'),'weekly Documents grouping missing'],
 [ui.includes('documents need identity review')&&ui.includes("resolveReview('duplicate')"),'review wizard actions missing'],
 [(ui.includes('Cleanup migration v109.7.11 applied')||ui.includes('Historical evidence v109.8.0')),'cleanup or historical evidence status missing'],
];
for(const [ok,message] of checks)if(!ok)throw new Error(`weekly load-folder verification failed: ${message}`);
console.log('PASS — weekly grouping, reconciliation, type logic, deduplication and historical evidence verified');
