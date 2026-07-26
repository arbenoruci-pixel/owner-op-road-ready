import fs from 'node:fs';
const VERSION='109.7.13';
const BUILD='v109713-event-date-mileage-link';
function read(p){return fs.readFileSync(p,'utf8');}
function write(p,v){fs.writeFileSync(p,v);}
const evidence=read('source/src/modules/owneros/loadEvidenceV10976.js');
if(!evidence.includes('explicitDay(record)||day(containerDay)'))throw new Error('v109.7.13 actual event date linking missing');
if(!evidence.includes('mileageEntries(state.dailyMilesByDay)'))throw new Error('v109.7.13 dated mileage scan missing');
for(const p of ['package.json','package-lock.json'])if(fs.existsSync(p)){const d=JSON.parse(read(p));d.version=VERSION;d.engines={...(d.engines||{}),node:'24.x'};if(d.packages?.['']){d.packages[''].version=VERSION;d.packages[''].engines={...(d.packages[''].engines||{}),node:'24.x'};}write(p,JSON.stringify(d,null,2)+'\n');}
const now=new Date().toISOString();
write('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.7.13 Event-Date Mileage Link',force:true,notes:['Links load mileage to the actual Logbook event date instead of the day the folder is opened.','Reads mileage rows by their stored date even when the container key differs.','Prevents today from being used as a fallback for a load completed on a prior date.']},null,2)+'\n');
let sw=read('public/sw.js');sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js');update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);write('source/src/core/update/appUpdate.js',update);
console.log('PASS — v109.7.13 actual event-date mileage linking applied last');