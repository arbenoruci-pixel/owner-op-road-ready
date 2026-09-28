import fs from 'node:fs';
const VERSION='110.4.18',BUILD='v110418-reviewed-load-reference',stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.18 Reviewed load references',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Use source-bound reviewed broker assignments instead of stale OCR numbers.','Label BOL references separately from broker load numbers.','Keep weekly filing and original records unchanged.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name]of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=fs.readFileSync(path,'utf8');for(const [key,replacement]of [['VERSION',VERSION],['BUILD',BUILD]])value=value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll("'110.4.17'","'"+VERSION+"'").replaceAll("'v110417-clear-loads'","'"+BUILD+"'"));
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
function patch(path,before,after){const source=fs.readFileSync(path,'utf8');if(source.includes(after))return;if(source.split(before).length!==2)throw new Error('Reviewed identity anchor changed: '+path+' / '+before.slice(0,90));fs.writeFileSync(path,source.replace(before,after));}
const core='source/src/modules/owneros/evidenceCoreV110413.js';
patch(core,'export function buildEvidence(',fs.readFileSync('scripts/v110418/identityChecks.js','utf8')+'\nexport function buildEvidence(');
patch(core,`    const rawRefs=new Set([doc.load_no,doc.loadNo,doc.canonicalLoadNo,doc.extracted?.loadNo,doc.extracted?.canonicalLoadNo].map(resolve).filter(Boolean));
    if(rawRefs.size>1&&!doc.repairOverlayApplied)issue(id+':identity','Load references disagree','Compare the broker load number with the BOL / pickup references.','load',doc);`, `    const identity=documentLoadIdentityIssue(doc,resolve);
    if(identity)issue(id+':identity',identity.label,identity.detail,'load',doc);`);
const ui='source/src/modules/owneros/EvidenceCenterV110413.jsx';
patch(ui,'CATALOG,FIELD_LABELS,buildEvidence','CATALOG,evidenceFieldLabel,buildEvidence');
patch(ui,'function Field({name,value,onChange}){\n  const label=FIELD_LABELS[name];',"function Field({name,value,onChange,kind}){\n  const label=evidenceFieldLabel(kind,name);");
patch(ui,'<Field key={name} name={name} value={fields[name]}','<Field key={name} name={name} kind={kind} value={fields[name]}');
console.log('PASS — v110418 reviewed broker identity and separate BOL reference labels installed');
