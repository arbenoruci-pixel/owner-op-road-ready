import fs from 'node:fs';
const VERSION='109.7.5';
const BUILD='v10975-safe-repair-import';
const SCREEN='source/src/modules/owneros/LoadFoldersV10969.jsx';
function read(p){return fs.readFileSync(p,'utf8');}
function write(p,v){fs.writeFileSync(p,v);}
const screen=read(SCREEN);
if(!screen.includes('RepairImportPanelV10975')) throw new Error('v109.7.5 repair import UI missing');
if(!fs.existsSync('source/src/modules/owneros/repairImportV10975.js')) throw new Error('v109.7.5 repair engine missing');
for(const p of ['package.json','package-lock.json']) if(fs.existsSync(p)){const d=JSON.parse(read(p));d.version=VERSION;d.engines={...(d.engines||{}),node:'24.x'};if(d.packages?.['']){d.packages[''].version=VERSION;d.packages[''].engines={...(d.packages[''].engines||{}),node:'24.x'};}write(p,JSON.stringify(d,null,2)+'\n');}
const now=new Date().toISOString();write('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.7.5 Safe Repair Import',force:true,notes:['Imports Road Ready audit packages for non-destructive review.','Imports approved repair-plan JSON files with a full preview before applying.','Stores corrections as reversible metadata overlays; original documents and Logbook events are never overwritten.','Creates a rollback snapshot and supports Undo last repair.','Supports load aliases, document-to-load assignments, stop counts, legacy-load status and false-record quarantine.']},null,2)+'\n');
let sw=read('public/sw.js');sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js');update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);write('source/src/core/update/appUpdate.js',update);
console.log('PASS — v109.7.5 safe repair import applied');
