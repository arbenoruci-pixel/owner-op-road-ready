import fs from 'node:fs';

const VERSION='109.6.9';
const BUILD='v10969-pro-load-folders';
const SCREEN='source/src/modules/owneros/OwnerOperatorOSV102.jsx';
function read(path){ return fs.readFileSync(path,'utf8'); }
function write(path,value){ fs.writeFileSync(path,value); }

let screen=read(SCREEN);
const importAnchor="import { buildAuditPacketPdfV102, buildBillingPacketPdfV102, buildInvoicePdfV102 } from './ownerOpsPdfV102.js';";
const componentImport="import LoadFoldersV10969 from './LoadFoldersV10969.jsx';";
if(!screen.includes(componentImport)){
  if(!screen.includes(importAnchor)) throw new Error('v109.6.9 owner OS import anchor missing');
  screen=screen.replace(importAnchor,`${importAnchor}\n${componentImport}`);
}
const documentsPattern=/        \{tab==='documents' && <>[\s\S]*?        <\/\>}\n\n        \{tab==='billing'/;
const replacement="        {tab==='documents' && <LoadFoldersV10969 loads={loads} documents={documents} state={state} businessStore={businessStore} loading={loadingDocs} onScan={onScan} onOpenLog={onOpenLog} onContinueBilling={loadNo=>{ setSelectedLoadNo(loadNo); setTab('billing'); }} />}\n\n        {tab==='billing'";
if(!screen.includes('<LoadFoldersV10969 loads={loads}')){
  if(!documentsPattern.test(screen)) throw new Error('v109.6.9 documents block missing');
  screen=screen.replace(documentsPattern,replacement);
}
write(SCREEN,screen);

for(const path of ['package.json','package-lock.json']) if(fs.existsSync(path)){
  const data=JSON.parse(read(path));
  data.version=VERSION;
  data.engines={...(data.engines||{}),node:'24.x'};
  if(data.packages?.['']){ data.packages[''].version=VERSION; data.packages[''].engines={...(data.packages[''].engines||{}),node:'24.x'}; }
  write(path,JSON.stringify(data,null,2)+'\n');
}
const releasedAt=new Date().toISOString();
write('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt,updatedAt:releasedAt,label:'v109.6.9 Professional Load Folders',force:true,notes:['Replaces the flat document list with smart load folders.','Matches PODs to delivery stops and flags missing stop proof in red.','Combines Rate Confirmation, BOL, POD, Logbook, mileage, fuel and expense evidence per load.','Adds one-tap actions to add missing documents, open supporting logs and continue to billing.','Preserves original documents and keeps Logbook, HOS, Scanner and isolated readers unchanged.']},null,2)+'\n');
let sw=read('public/sw.js');
sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw=sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js');
update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`);
update=update.replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js',update);
console.log('PASS — v109.6.9 professional smart load folders applied');
