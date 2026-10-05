import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){const s=read(path);if(s.includes(after))return;if(s.split(before).length!==2)throw Error('Cloud mirror anchor changed: '+path);fs.writeFileSync(path,s.replace(before,()=>after));}
for(const [source,target] of [['mirrorCore.js','lib/owner-op-cloud/mirrorCoreV110450.js'],['cloudMirror.js','lib/owner-op-cloud/cloudMirrorV110450.js'],['CloudBackupPanel.jsx','source/src/modules/cloud/CloudBackupPanelV110450.jsx'],['CloudBackupAgent.jsx','source/src/modules/cloud/CloudBackupAgent.jsx'],['documentPreview.js','source/src/modules/owneros/documentPreviewV110450.js']])fs.copyFileSync('scripts/v110450/'+source,target);
const hub='source/src/modules/cloud/CloudHub.jsx';
patch(hub,"import React,", "import CloudBackupPanel from './CloudBackupPanelV110450.jsx';\nimport React,");
patch(hub,'    {error?<section','    {session?<CloudBackupPanel/>:null}\n    {error?<section');
patch(hub,'<h2>Keep the cloud copy current</h2>','<h2>Officer wallet &amp; active log copies</h2>');
patch(hub,'Cloud backup verified. Original local records have been kept.','Wallet and active-driver log pass finished. Complete device backup is shown separately above.');
patch(hub,"'Latest backup pass completed.'","'Wallet and active-driver log pass completed.'");
patch(hub,'<label className="rr-checkbox"><input type="checkbox" checked={automatic} onChange={e=>{enableAutoBackup(session.user.id,e.target.checked);setAutomatic(e.target.checked);}}/>Automatic backup while this app is open and online</label>','<p>Update these copies before creating an officer link.</p>');
const actions='source/src/modules/owneros/documentActionsV110415.js';
patch(actions,"import {readTransferOriginal}","import {createDocumentPreview} from './documentPreviewV110450.js';\nimport {readTransferOriginal}");
const old=`  const preview=window.open('','_blank');
  try{const file=await sourceFile(doc,pages),url=URL.createObjectURL(file);if(preview)preview.location.href=url;else window.location.assign(url);setTimeout(()=>URL.revokeObjectURL(url),120000);return {ok:true};}
  catch(error){preview?.close?.();throw error;}`;
patch(actions,old,`  const preview=createDocumentPreview();
  try{const file=await sourceFile(doc,pages);preview.show(file);return {ok:true};}
  catch(error){preview.close();throw error;}`);
const VERSION='110.4.50',BUILD='v110450-verified-device-cloud-copy';
for(const path of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,label:'v110.4.50 Complete device backup',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Keep complete per-device cloud copies with verified original-file chunks.','Show missing originals and a checked downloadable restore ZIP.','Open original documents inside the app.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const[path,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(path);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,s);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replaceAll('v110.4.49','v'+VERSION).replaceAll('V110.4.49','V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.4.49'","'"+VERSION+"'").replaceAll("'v110449-load-history-sources'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — complete per-device cloud backup and inline original preview installed');
await import('./finalize-record-sync-v110451.mjs');
