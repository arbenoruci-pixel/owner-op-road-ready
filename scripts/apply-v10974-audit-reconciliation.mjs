import fs from 'node:fs';
const VERSION='109.7.4';
const BUILD='v10974-audit-reconciliation';
const SCREEN='source/src/modules/owneros/LoadFoldersV10969.jsx';
function read(p){return fs.readFileSync(p,'utf8');}
function write(p,v){fs.writeFileSync(p,v);}
let screen=read(SCREEN);
if(!screen.includes("import './loadFolderReviewV10974.css';")) screen=screen.replace("import './loadFoldersV10969.css';","import './loadFoldersV10969.css';\nimport './loadFolderReviewV10974.css';");
if(!screen.includes('reconcileLoadFoldersV10974')) throw new Error('v109.7.4 reconciliation UI missing');
write(SCREEN,screen);
for(const p of ['package.json','package-lock.json']) if(fs.existsSync(p)){const d=JSON.parse(read(p));d.version=VERSION;d.engines={...(d.engines||{}),node:'24.x'};if(d.packages?.['']){d.packages[''].version=VERSION;d.packages[''].engines={...(d.packages[''].engines||{}),node:'24.x'};}write(p,JSON.stringify(d,null,2)+'\n');}
const now=new Date().toISOString();write('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.7.4 Audit Reconciliation',force:true,notes:['Reconciles Vault and business document stores before building load folders.','Deduplicates document records and recognizes saved Rate Confirmations immediately.','Infers missing delivery stop slots from BOL and POD stop evidence.','Quarantines suspicious shipment, receipt and date references into Needs Review instead of creating fake load folders.','Prevents instruction text from being displayed as a route.']},null,2)+'\n');
let sw=read('public/sw.js');sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js');update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);write('source/src/core/update/appUpdate.js',update);
console.log('PASS — v109.7.4 audit reconciliation applied');