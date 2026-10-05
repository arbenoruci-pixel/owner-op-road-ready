import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const VERSION='110.4.54',BUILD='v110454-manual-cloud-backup';
for(const path of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,label:'v110.4.54 Manual backup',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Create a full cloud backup only when you tap Back up everything now.','Opening the app and reconnecting no longer start full backups.','Keep existing cloud copies available for download.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const[path,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(path);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,s);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js'])fs.writeFileSync(path,read(path).replaceAll('110.4.53',VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.4.53'","'"+VERSION+"'").replaceAll("'v110453-evidence-workspace'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — full cloud backups run only on request');
