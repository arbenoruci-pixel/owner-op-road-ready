import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8');
let portable=read('scripts/v110429/portableBackup.js');
portable=portable.replace("from '../../lib/local-db/dexie.js'","from '../../../../lib/local-db/dexie.js'")
  .replace("from '../../lib/local-db/safetyArchive.js'","from '../../../../lib/local-db/safetyArchive.js'");
fs.writeFileSync('source/src/modules/backup/portableBackupV110429.js',portable);
fs.copyFileSync('scripts/v110429/BackupLogsScreen.jsx','source/src/modules/backup/BackupLogsScreen.jsx');
const test=spawnSync(process.execPath,['scripts/v110429/portable-backup.test.mjs'],{stdio:'inherit'});
if(test.error)throw test.error;assert.equal(test.status,0,'Portable backup review-index test');
const VERSION='110.4.29',BUILD='v110429-portable-everything';
for(const p of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(p));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.29 Export / Import Everything',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Export one verified portable file with logbooks, loads and original documents.','Import the same file on another iPhone or iPad after checksum verification.','Include a readable ChatGPT review index and a smaller review-only JSON option.']});fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n');
}
for(const p of ['package.json','package-lock.json']){const value=JSON.parse(read(p));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
 let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);
}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.28'","'"+VERSION+"'").replaceAll("'v110428-full-page-scanner'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.29 portable Export Everything / Import Everything installed');
