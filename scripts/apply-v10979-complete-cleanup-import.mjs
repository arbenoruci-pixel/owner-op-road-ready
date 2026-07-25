import fs from 'node:fs';
const VERSION='109.7.9';
const BUILD='v10979-complete-cleanup-import';
function read(p){return fs.readFileSync(p,'utf8');}
function write(p,v){fs.writeFileSync(p,v);}
const engine=read('source/src/modules/owneros/repairImportV10975.js');
const panel=read('source/src/modules/owneros/RepairImportPanelV10975.jsx');
if(!engine.includes('applyCompletePackageV10979')||!engine.includes('parseZip')||!engine.includes('existingHashes')||!engine.includes('logical.has(key)')) throw new Error('v109.7.9 cleanup importer missing');
if(!panel.includes('Apply cleanup package')||!panel.includes('.zip')) throw new Error('v109.7.9 cleanup UI missing');
for(const p of ['package.json','package-lock.json'])if(fs.existsSync(p)){const d=JSON.parse(read(p));d.version=VERSION;d.engines={...(d.engines||{}),node:'24.x'};if(d.packages?.['']){d.packages[''].version=VERSION;d.packages[''].engines={...(d.packages[''].engines||{}),node:'24.x'};}write(p,JSON.stringify(d,null,2)+'\n');}
const now=new Date().toISOString();write('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.7.9 Complete Cleanup Import',force:true,notes:['Imports one verified cleanup ZIP with its repair plan and Outlook documents.','Skips byte-identical files using SHA-256 and skips duplicate Rate Con/POD logical slots.','Keeps original documents immutable and adds only verified missing files.','Organizes imported files by load, document type and delivery stop.','Supporting packets never inflate BOL or POD counts.']},null,2)+'\n');
let sw=read('public/sw.js');sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js');update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);write('source/src/core/update/appUpdate.js',update);
console.log('PASS — v109.7.9 complete cleanup import applied');