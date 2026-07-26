import fs from 'node:fs';
const VERSION='109.7.12';
const BUILD='v109712-load-fuel-mileage-link';
function read(p){return fs.readFileSync(p,'utf8');}
function write(p,v){fs.writeFileSync(p,v);}
const evidence=read('source/src/modules/owneros/loadEvidenceV10976.js');
const engine=read('source/src/modules/owneros/loadFolderEngineV10969.js');
if(!evidence.includes('linkedDaysForLoad')||!evidence.includes('dailyMilesByLoad'))throw new Error('v109.7.12 load-specific mileage link missing');
if(!engine.includes('fuelCandidates')||!engine.includes('fuelTransactions')||!engine.includes('No fuel record linked to this trip yet'))throw new Error('v109.7.12 fuel activity link missing');
for(const p of ['package.json','package-lock.json'])if(fs.existsSync(p)){const d=JSON.parse(read(p));d.version=VERSION;d.engines={...(d.engines||{}),node:'24.x'};if(d.packages?.['']){d.packages[''].version=VERSION;d.packages[''].engines={...(d.packages[''].engines||{}),node:'24.x'};}write(p,JSON.stringify(d,null,2)+'\n');}
const now=new Date().toISOString();
write('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.7.12 Load Fuel and Mileage Link',force:true,notes:['Daily miles are counted only on Logbook days linked to the selected load.','The same weekly mileage total is no longer copied into every load folder.','Fuel activity is detected from fuel records, fuel transactions and categorized expense transactions on linked trip days.','Fuel evidence remains informational and does not create a false broker document failure.']},null,2)+'\n');
let sw=read('public/sw.js');sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js');update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);write('source/src/core/update/appUpdate.js',update);
console.log('PASS — v109.7.12 load-specific fuel and mileage linking applied last');