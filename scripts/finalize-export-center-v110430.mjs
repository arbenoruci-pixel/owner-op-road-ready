import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function replace(path,from,to){const s=read(path);if(s.includes(to))return;assert.ok(s.includes(from),`Export center anchor: ${path}`);fs.writeFileSync(path,s.replace(from,to));}
fs.copyFileSync('scripts/v110430/BackupLogsScreen.jsx','source/src/modules/backup/BackupLogsScreen.jsx');
fs.copyFileSync('scripts/v110430/everythingZip.js','source/src/modules/backup/everythingZipV110430.js');
replace('source/src/app/App.jsx','        onOpenLogbook={openLogbook}',"        onOpenLogbook={openLogbook}\n        onOpenBackup={()=>setState(s=>({ ...s, view:'backup', sheet:null }))}");
replace('source/src/modules/home/HomeScreen.jsx','  onOpenLogbook,','  onOpenLogbook,\n  onOpenBackup,');
replace('source/src/modules/home/HomeScreen.jsx','        section={businessSection}','        section={businessSection}\n        onOpenBackup={onOpenBackup}');
replace('source/src/modules/home/HomeScreen.jsx','      <AdaptiveHomeV1038',`      <button type="button" className="rr-export-entry" onClick={onOpenBackup}><span><b>Export & Backup</b><small>Documents · Logbook · Loads · Everything</small></span><span aria-hidden="true">↗</span></button>
      <AdaptiveHomeV1038`);
replace('source/src/modules/owneros/OwnerOperatorOSV102.jsx',"section = 'overview', onBack, onScan, onOpenLog", "section = 'overview', onBack, onScan, onOpenLog, onOpenBackup");
replace('source/src/modules/owneros/OwnerOperatorOSV102.jsx','<LoadFoldersV10969 loads={loads}','<LoadFoldersV10969 onOpenBackup={onOpenBackup} loads={loads}');
replace('source/src/modules/owneros/LoadFoldersV10969.jsx','onOpenLog,onContinueBilling})','onOpenLog,onContinueBilling,onOpenBackup})');
replace('source/src/modules/owneros/LoadFoldersV10969.jsx','    {moreOpen?<section',`    {!folder && !week ? <button type="button" className="rr-export-entry" onClick={onOpenBackup}><span><b>Export & Backup</b><small>All documents + logbooks + loads</small></span><span aria-hidden="true">↗</span></button> : null}
    {moreOpen?<section`);
const css='source/src/command-center.css';
if(!read(css).includes('/* export-center-v110430 */'))fs.appendFileSync(css,`\n/* export-center-v110430 */
.rr-export-entry{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;width:calc(100% - 28px);margin:12px 14px;padding:16px 18px;border:1px solid #b9d6f2;border-radius:16px;background:#edf6ff;color:#123e69;text-align:left;font:inherit;cursor:pointer}.rr-export-entry b{display:block;font-size:17px;line-height:1.35}.rr-export-entry small{display:block;font-size:13px;line-height:1.5;margin-top:3px;color:#345d83}.rr-export-entry>span:last-child{font-size:24px}.rr-driver-documents>.rr-export-entry{width:100%;margin:12px 0}.rr-export-entry:focus-visible{outline:3px solid #1678d3;outline-offset:2px}\n`);
const VERSION='110.4.30',BUILD='v110430-export-center';
for(const p of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(p));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.30 Export & Backup',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Open Export & Backup directly from Home or Documents.','Save one ZIP with original PDFs/photos, every driver logbook, loads and a complete device backup.','Open the ZIP in Files to view documents or select the included JSON backup for import.']});fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n');
}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.29'","'"+VERSION+"'").replaceAll("'v110429-portable-everything'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.30 visible Export & Backup with original files and logbook ZIP');

await import('./finalize-large-device-export-v110431.mjs');
