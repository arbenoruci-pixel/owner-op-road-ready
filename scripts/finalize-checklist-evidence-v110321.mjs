import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = file => fs.readFileSync(file,'utf8');
function patch(file,before,after){const s=read(file);if(after ? s.includes(after) : !s.includes(before))return;assert.equal(s.split(before).length-1,1,'Checklist anchor: '+file);fs.writeFileSync(file,s.replace(before,after));}
const loads='source/src/modules/loads/';
for(const [from,to] of [['checklistEvidence.js','checklistEvidenceV110321.js'],['useChecklistStore.js','useChecklistStoreV110321.js']])fs.copyFileSync('scripts/v110321/'+from,loads+to);
const resolver=loads+'loadGuideV103.js';
patch(resolver,"import {applyInstructionGuideV110311}","import {resolveChecklistEvidenceV110321} from './checklistEvidenceV110321.js';\nimport {readBusinessStore as readChecklistStoreV110321} from '../business/businessStore.js';\nimport {applyInstructionGuideV110311}");
const s=read(resolver),start=s.indexOf('export function resolveDriverGuideV103(state = {}, guideInput = null) {');
if(start>=0)fs.writeFileSync(resolver,s.slice(0,start)+`export function resolveDriverGuideV103(state = {}, guideInput = null, businessStore = readChecklistStoreV110321()) {
  return resolveChecklistEvidenceV110321(state,guideInput || getActiveLoadGuideV103(state),businessStore);
}
`);
const model=loads+'safeMissionModelV10966.js';
if(!read(model).includes("import {resolveChecklistEvidenceV110321}"))fs.writeFileSync(model,"import {resolveChecklistEvidenceV110321} from './checklistEvidenceV110321.js';\n"+read(model));
const m=read(model),at=m.indexOf('export function safeMissionProgressV10966(');
assert.ok(at>=0);fs.writeFileSync(model,m.slice(0,at)+`export function safeMissionProgressV10966(state = {}, guideInput = null, businessStore = {}) {
  return resolveChecklistEvidenceV110321(state,guideInput,businessStore);
}
`);
const ui=loads+'SafeDriverMissionV10966.jsx';
patch(ui,"import { readBusinessStore } from '../business/businessStore.js';","import {useChecklistStoreV110321} from './useChecklistStoreV110321.js';");
patch(ui,"  const rawGuide = useMemo(() => getActiveLoadGuideV103(state), [state]);\n  const businessStore = useMemo(() => {\n    try { return readBusinessStore(); } catch { return {}; }\n  }, [state]);","  const businessStore = useChecklistStoreV110321();\n  const rawGuide = useMemo(() => getActiveLoadGuideV103(state), [state, businessStore]);");
// Previous render effects permanently marked inferred steps and relinked documents.
// Completion now remains a projection of current evidence, including deletions.
let u=read(ui),effect=u.indexOf('  useEffect(() => {'),end=u.indexOf('\n  if (!guide) {',effect);
if(effect>=0){assert.ok(end>effect);fs.writeFileSync(ui,u.slice(0,effect)+u.slice(end));}
patch(ui,"import React, { useEffect, useMemo } from 'react';","import React, { useMemo } from 'react';");
patch(ui,"  dispatchSmartDocumentLinkV100,\n",'');
patch(ui,'key={step.id + index} style={{','key={step.id + index} data-checklist-step={step.id} data-complete={step.complete} style={{');
patch(ui,'{step.detail}</em> : null}</div>','{step.detail}</em> : null}{step.complete && step.completionEvidence ? <small style={{display:"block",marginTop:4,color:"#08784e"}}>{step.completionEvidence.label}</small> : null}</div>');
const home='source/src/modules/home/AdaptiveHomeV1038.jsx';
patch(home,"import React, { useMemo } from 'react';","import React, { useMemo } from 'react';\nimport {useChecklistStoreV110321} from '../loads/useChecklistStoreV110321.js';");
patch(home,'  const guide = useMemo(() => getActiveLoadGuideV103(props.state), [props.state]);\n  const progress = useMemo(() => resolveDriverGuideV103(props.state, guide), [props.state, guide]);','  const checklistStore = useChecklistStoreV110321();\n  const guide = useMemo(() => getActiveLoadGuideV103(props.state), [props.state, checklistStore]);\n  const progress = useMemo(() => resolveDriverGuideV103(props.state, guide, checklistStore), [props.state, guide, checklistStore]);');
const VERSION='110.3.21',BUILD='v110321-checklist-logbook-evidence';
for(const file of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(file));Object.assign(d,{version:VERSION,build:BUILD,force:false,label:'v110.3.21 Checklist reads completed logbook work',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Driver checklist recognizes existing PTI, pickup, driving and delivery logs.','Home and Full mission share load, BOL and stop evidence.','Checklist updates when logs or documents change; recorded logbook data stays intact.']});fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const file of ['package.json','package-lock.json']){const d=JSON.parse(read(file));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(file);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(file,s);}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.20');assert.equal(meta.build,'v110320-invoice-packet-outlook-send');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — shared read-only checklist evidence from load-linked Logbook and Vault');
