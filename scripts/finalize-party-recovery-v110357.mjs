import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.57',BUILD='v110357-party-evidence-recovery';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){
  const source=read(path);if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,`Party recovery anchor: ${path}`);
  fs.writeFileSync(path,source.replace(before,after));
}
const scan='source/src/modules/scan/';
fs.copyFileSync('scripts/owned-reader/partyDetail.js',scan+'partyDetailV110357.js');
const reader=scan+'imageReaderV110323.js';
patch(reader,"import {prepareIdentifierDetail} from './identifierDetailV110342.js';", "import {prepareIdentifierDetail} from './identifierDetailV110342.js';\nimport {preparePartyDetails} from './partyDetailV110357.js';");
patch(reader,'(pass+Math.min(1,p))/4','(pass+Math.min(1,p))/6');
patch(reader,'  }\n  const bestPages=',`    // PARTY_DETAIL_V110357: add evidence without overriding earlier conflicts.
    try{
      const details=await preparePartyDetails(completed,()=>checkCancelled(options.signal));
      for(const [index,detail] of details.entries())await read(detail.file,'party-detail-'+(index+1),'7',{scope:'region',thresholdingMethod:'2',sourcePassId:detail.sourcePassId,region:detail.region,fieldLabel:detail.fieldLabel});
    }catch(error){checkCancelled(options.signal);failures.push({page:page+1,pass:'party-detail',code:'detail_unavailable'});}
  }
  const bestPages=`);
const preview=scan+'OwnedReaderPreview.jsx';
patch(preview,"import {resolveEvidence,confirmField} from '../../../../packages/smart-reader-core/src/index.js';", "import {resolveEvidence,confirmField} from '../../../../packages/smart-reader-core/src/index.js';\nimport {clearestEvidence,clearestCandidate} from '../../../../packages/smart-reader-core/src/reviewEvidence.js';");
patch(preview,'if(!pages.has(evidence.pageId)||!pages.get(evidence.pageId).box&&evidence.box)pages.set(evidence.pageId,evidence);','pages.set(evidence.pageId,clearestEvidence([...(pages.has(evidence.pageId)?[pages.get(evidence.pageId)]:[]),evidence]));');
patch(preview,`    const candidate=field.candidates.find(c=>c.issue!=='form_instructions');
    select(group,item.key,field,candidate,candidate?.evidence.find(e=>sources[e.sourceImageId])||candidate?.evidence[0]||sourceFor(group));`, `    const choice=clearestCandidate(field.candidates,evidence=>Boolean(sources[evidence.sourceImageId]));
    select(group,item.key,field,choice?.candidate,choice?.evidence||sourceFor(group));`);
patch(preview,'      {selectablePages.length>1?',`      {selection.candidate?.continuationEvidence?.filter(e=>e.pageId===selection.evidence?.pageId&&e.observationId===selection.evidence?.observationId).map((e,i)=><blockquote key={i}>Adjacent company suffix: <mark>{e.quote}</mark></blockquote>)}
      {selectablePages.length>1?`);

for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.57 Company name recovery',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Recover split company suffixes only with a complete reading from the same page.','Reread small areas with uncertain company names and open the clearest source first.','Keep conflicting names, identifiers and amounts available for human confirmation.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(read(path));value.version=VERSION;
  if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=read(path);
  for(const [key,replacement] of [['VERSION',VERSION],['BUILD',BUILD]]){
    const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');
    assert.equal([...value.matchAll(pattern)].length,1,'Unique release marker '+path+' '+key);
    value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);
  }
  fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.55');assert.equal(meta.build,'v110355-compact-time-grips');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — 110.3.57 company evidence recovery installed');
