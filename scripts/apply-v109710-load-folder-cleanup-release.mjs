import fs from 'node:fs';
const VERSION='109.7.10';
const BUILD='v109710-load-folder-cleanup';
function read(p){return fs.readFileSync(p,'utf8');}
function write(p,v){fs.writeFileSync(p,v);}
const reconciliation=read('source/src/modules/owneros/loadFolderReconciliationV10974.js');
const supporting=read('source/src/modules/owneros/supportingDocumentsV10977.js');
if(!reconciliation.includes("aliases.set('178564','424590-1')"))throw new Error('v109.7.10 alias migration missing');
if(!reconciliation.includes('documents:accepted')||!reconciliation.includes('documents:[]'))throw new Error('v109.7.10 single document pass missing');
if(!supporting.includes("core:${load}|bol|stop:${stop||0}")||!supporting.includes("core:${load}|pod|stop:${stop}"))throw new Error('v109.7.10 logical core deduplication missing');
for(const p of ['package.json','package-lock.json'])if(fs.existsSync(p)){const d=JSON.parse(read(p));d.version=VERSION;d.engines={...(d.engines||{}),node:'24.x'};if(d.packages?.['']){d.packages[''].version=VERSION;d.packages[''].engines={...(d.packages[''].engines||{}),node:'24.x'};}write(p,JSON.stringify(d,null,2)+'\n');}
const now=new Date().toISOString();
write('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.7.10 Load Folder Cleanup',force:true,notes:['Automatically merges pickup/order alias 178564 into Load 424590-1.','Counts reconciled documents only once across Vault and business stores.','Keeps one logical Rate Confirmation, one pickup BOL per stop slot and one POD per delivery stop.','Separates supporting packets from BOL and POD counts.','Reduces identity review after logical deduplication without deleting originals.']},null,2)+'\n');
let sw=read('public/sw.js');sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js');update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);write('source/src/core/update/appUpdate.js',update);
console.log('PASS — v109.7.10 load folder cleanup release applied');
