import fs from 'node:fs';

const VERSION='109.7.3';
const BUILD='v10973-complete-audit-export';
function read(path){ return fs.readFileSync(path,'utf8'); }
function write(path,value){ fs.writeFileSync(path,value); }

const component=read('source/src/modules/owneros/LoadFoldersV10969.jsx');
const exporter=read('source/src/modules/owneros/auditExportV10973.js');
if(!component.includes('exportRoadReadyAuditPackageV10973')) throw new Error('v109.7.3 audit export button missing');
if(!exporter.includes("name:'audit/report.json'") || !exporter.includes("name:'audit/app-state.json'") || !exporter.includes("originals/Load-")) throw new Error('v109.7.3 complete audit package contract missing');

for(const path of ['package.json','package-lock.json']) if(fs.existsSync(path)){
  const data=JSON.parse(read(path));
  data.version=VERSION;
  data.engines={...(data.engines||{}),node:'24.x'};
  if(data.packages?.['']){ data.packages[''].version=VERSION; data.packages[''].engines={...(data.packages[''].engines||{}),node:'24.x'}; }
  write(path,JSON.stringify(data,null,2)+'\n');
}
const releasedAt=new Date().toISOString();
write('public/app-version.json',JSON.stringify({version:VERSION,build:BUILD,releasedAt,updatedAt:releasedAt,label:'v109.7.3 Complete Audit Export',force:true,notes:['Exports one complete tar.gz audit package with every locally available original document.','Includes load folders, Logbook/app state, mileage, fuel, business records and document metadata.','Generates an automatic anomaly report for POD/stop mismatches, suspicious routes, dates, load identifiers and missing Rate Confirmations.','Does not modify any source records while exporting.']},null,2)+'\n');
let sw=read('public/sw.js');
sw=sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw=sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);
write('public/sw.js',sw);
let update=read('source/src/core/update/appUpdate.js');
update=update.replace(/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`);
update=update.replace(/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`);
write('source/src/core/update/appUpdate.js',update);
console.log('PASS — v109.7.3 complete audit export ready');
