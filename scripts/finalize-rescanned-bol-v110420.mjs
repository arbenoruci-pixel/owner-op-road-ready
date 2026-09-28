import fs from 'node:fs';
const VERSION='110.4.20',BUILD='v110420-rescanned-bol-review',stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.20 Re-scanned BOL review',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Identify a re-scanned BOL filed under another load.','Review the matching BOL and save its correct filing.','Keep separate original scans and weekly navigation.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
for(const [path,name]of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=fs.readFileSync(path,'utf8');for(const [key,replacement]of [['VERSION',VERSION],['BUILD',BUILD]])value=value.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${replacement}';`);fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replaceAll("'110.4.19'","'"+VERSION+"'").replaceAll("'v110419-source-copy-filing'","'"+BUILD+"'"));
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
function patch(path,before,after){const source=fs.readFileSync(path,'utf8');if(source.includes(after))return;if(source.split(before).length!==2)throw new Error('BOL filing anchor changed: '+path+' / '+before.slice(0,90));fs.writeFileSync(path,source.replace(before,after));}

const core='source/src/modules/owneros/evidenceCoreV110413.js';
patch(core,'import {projectReviewedCopies,preferredSourceCopy,sourceCopyIdentity,sourceConflictIdentity}', 'import {confirmedSource,projectReviewedCopies,preferredSourceCopy,sourceCopyIdentity,sourceConflictIdentity}');
patch(core,'export function buildEvidence(',fs.readFileSync('scripts/v110420/bolFilingMatch.js','utf8')+'\nexport function buildEvidence(');
patch(core,"    if(!isReviewed(doc))issue(id+':facts','Source details need review','Read again or confirm the fields against the original.','audit',doc);",`    const filingMatch=reviewedBolFilingMatch(doc,all,resolve);
    if(filingMatch)issue(id+':filing',\`BOL \${filingMatch.fields.reference} matches another load\`,\`Saved under Load \${filingMatch.previousLoadNo||'not set'}. Reviewed BOL: Load \${filingMatch.fields.loadNo} · \${filingMatch.fields.date}.\`,'load',doc,{filingMatch});
    else if(!isReviewed(doc))issue(id+':facts','Source details need review','Read again or confirm the fields against the original.','audit',doc);`);
const ui='source/src/modules/owneros/EvidenceCenterV110413.jsx';
patch(ui,"  const [chooser,setChooser]", "  const [filingMatch,setFilingMatch]=useState(null);\n  const [chooser,setChooser]");
patch(ui,"  function review(doc){setSelected(doc);setKind(CATALOG[kindOf(doc)]?kindOf(doc):'other');setFields({...documentFacts(doc),loadNo:evidenceLoadResolver(businessStore)(loadOf(doc))});setError('');setMessage('');setChooser(false);}","  function review(doc,match=null){setSelected(doc);setFilingMatch(match);setKind(CATALOG[kindOf(doc)]?kindOf(doc):'other');setFields({...documentFacts(doc),loadNo:evidenceLoadResolver(businessStore)(loadOf(doc)),...match?.fields});setError('');setMessage('');setChooser(false);}");
patch(ui,"setSelected(next);setMessage(book?", "setSelected(next);setFilingMatch(null);setMessage(filingMatch?`Saved to Load ${loadOf(next)}. Original scan kept.`:book?");
patch(ui,'onClick={()=>review(row.document)}>Review source</button>','onClick={()=>review(row.document,row.filingMatch)}>{row.filingMatch?\'Review match\':\'Review source\'}</button>');
patch(ui,'<h3>Review the original and its uses</h3>',`<h3>{filingMatch?'Check this BOL match':'Review the original and its uses'}</h3>{filingMatch?<p role="note">Suggested: Load {filingMatch.fields.loadNo} · BOL {filingMatch.fields.reference}. Compare this scan with the proposed details, then save.</p>:null}`);
patch(ui,'onClick={()=>save(false)}>Save reviewed details</button>',"onClick={()=>save(false)}>{filingMatch?`Save to Load ${fields.loadNo}`:'Save reviewed details'}</button>");
console.log('PASS — v110420 re-scanned BOL filing suggestions require an explicit source review');
