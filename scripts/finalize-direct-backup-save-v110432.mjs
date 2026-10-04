import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
fs.copyFileSync('scripts/v110432/BackupLogsScreen.jsx','source/src/modules/backup/BackupLogsScreen.jsx');
const VERSION='110.4.32',BUILD='v110432-direct-backup-save';
for(const p of ['release-version.json','public/app-version.json']){
 const value=JSON.parse(read(p));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.32 Direct backup download',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Download backup is the primary save action.','Large backups save directly through the browser instead of loading the entire file into the native share menu.','The prepared file remains available after a closed or blocked share menu; verify it from Files before replacing device data.']});fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n');
}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.31'","'"+VERSION+"'").replaceAll("'v110431-large-device-export'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.32 direct backup download and bounded native sharing');

await import('./finalize-lean-documents-export-v110433.mjs');
