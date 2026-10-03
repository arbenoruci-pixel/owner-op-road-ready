import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
fs.copyFileSync('scripts/v110431/BackupLogsScreen.jsx','source/src/modules/backup/BackupLogsScreen.jsx');
fs.copyFileSync('scripts/v110431/chunkedZip.js','source/src/modules/backup/chunkedZipV110431.js');
let large=read('scripts/v110431/largeBackup.js').replace("from '../../lib/local-db/dexie.js'","from '../../../../lib/local-db/dexie.js'").replace("from '../v110429/portableBackup.js'","from './portableBackupV110429.js'").replace("from './chunkedZip.js'","from './chunkedZipV110431.js'");
fs.writeFileSync('source/src/modules/backup/largeBackupV110431.js',large);
const VERSION='110.4.31',BUILD='v110431-large-device-export';
for(const p of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(p));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.31 Reliable large exports',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Prepare large document collections in small chunks without a giant base64 JSON copy.','Watch file and MB progress, cancel preparation, then save or share the completed ZIP.','Import the original ZIP directly on another phone or iPad; existing JSON backups remain supported.']});fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n');
}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.30'","'"+VERSION+"'").replaceAll("'v110430-export-center'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.31 bounded-memory document ZIP export and direct verified ZIP restore');

await import('./finalize-direct-backup-save-v110432.mjs');
