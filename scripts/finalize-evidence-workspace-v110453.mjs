import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){const s=read(path);if(s.includes(after))return;if(s.split(before).length!==2)throw Error('Evidence workspace anchor changed: '+path);fs.writeFileSync(path,s.replace(before,()=>after));}
const base='source/src/modules/owneros/';
for(const [from,to] of [['core.js','evidenceWorkspaceCoreV110453.js'],['storage.js','evidenceWorkspaceStorageV110453.js'],['packet.js','evidenceWorkspacePacketV110453.js'],['Workspace.jsx','EvidenceWorkspaceV110453.jsx'],['workspace.css','evidenceWorkspaceV110453.css']])fs.copyFileSync('scripts/v110453/'+from,base+to);
const owner=base+'OwnerOperatorOSV102.jsx';
patch(owner,"import EvidenceCenter from", "import EvidenceWorkspace from './EvidenceWorkspaceV110453.jsx';\nimport EvidenceCenter from");
const old="{tab==='documents' && <LoadFoldersV10969 onOpenBackup={onOpenBackup} loads={loads} documents={documents} state={state} businessStore={businessStore} loading={loadingDocs} ownerStore={ownerStore} onImportMileage={()=>mileageRef.current?.click()} onScan={onScan} onOpenLog={onOpenLog} onContinueBilling={loadNo=>{ setSelectedLoadNo(loadNo); setTab('billing'); }} />}";
const loads=old.slice(old.indexOf('<LoadFolders'),-1);
patch(owner,'  const nav = <div',`  if(tab==='documents')return <EvidenceWorkspace state={state} documents={documents} onBack={onBack} onScan={onScan} onOpenLog={onOpenLog} loadsView={${loads}}/>;\n\n  const nav = <div`);
patch(owner,"window.addEventListener('storage',refreshBusiness);","window.addEventListener('storage',refreshBusiness);\n    window.addEventListener('road-ready-evidence-filed',refreshBusiness);");
patch(owner,"window.removeEventListener('storage',refreshBusiness);","window.removeEventListener('storage',refreshBusiness);\n      window.removeEventListener('road-ready-evidence-filed',refreshBusiness);");
const VERSION='110.4.53',BUILD='v110453-evidence-workspace';
for(const path of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(path));Object.assign(v,{version:VERSION,build:BUILD,label:'v110.4.53 Your records',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Find documents by load, date, unit, vendor and category.','File receipts with durable source-linked history.','Prepare selected evidence packets with originals, CSV and readable log copies.']});fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const path of ['package.json','package-lock.json']){const v=JSON.parse(read(path));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(v,null,2)+'\n');}
for(const[path,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(path);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(path,s);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx','lib/owner-op-cloud/cloudMirrorV110450.js','lib/owner-op-cloud/recordSyncV110451.js'])fs.writeFileSync(path,read(path).replaceAll('110.4.52',VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,read(path).replaceAll("'110.4.52'","'"+VERSION+"'").replaceAll("'v110452-retained-duplicate-records'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — evidence workspace, filing and source packets installed');

await import('./finalize-manual-backup-v110454.mjs');
