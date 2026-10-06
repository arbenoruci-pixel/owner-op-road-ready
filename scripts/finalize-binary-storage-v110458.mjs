import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){const s=read(path);if(s.includes(after))return;if(s.split(before).length!==2)throw Error('Binary storage anchor changed: '+path);fs.writeFileSync(path,s.replace(before,()=>after));}
fs.copyFileSync('scripts/v110458/binaryStorage.js','lib/local-db/binaryStorageV110458.js');
patch('lib/local-db/dexie.js',"import Dexie from 'dexie';","import Dexie from 'dexie';\nimport {installBinaryStorage} from './binaryStorageV110458.js';");
patch('lib/local-db/dexie.js','  return db;','  installBinaryStorage(db,Dexie);\n  return db;');
const VERSION='110.4.58',BUILD='v110458-ipad-binary-storage';
for(const path of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,label:'v110.4.58 iPad document storage',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Store received documents reliably on iPad.','Keep verified transfer progress and exact original files.','Full cloud backups remain manual.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const[path,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(path);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,s);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js','scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll('110.4.57',VERSION).replaceAll('110.4.56',VERSION).replaceAll('v110457-resumable-device-transfer',BUILD));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
await import('./v110458/binary-storage.test.mjs');
console.log('PASS iPad binary document storage installed');

patch('lib/owner-op-cloud/recordSyncV110451.js','import {canonical,projectRecords,','import {visible,canonical,projectRecords,');
patch('lib/owner-op-cloud/recordSyncV110451.js',"for(const table of db.tables)if(table.name!=='account_receive_staging')tables[table.name]=await table.toArray();", "for(const table of db.tables)if(table.name!=='account_receive_staging'){if(['document_blobs','capture_asset_blobs'].includes(table.name)){tables[table.name]=[];await table.each(row=>tables[table.name].push(visible(row)));}else tables[table.name]=await table.toArray();}");
