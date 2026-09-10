import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = file => fs.readFileSync(file,'utf8');
function patch(file,before,after){const s=read(file);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,'Load guide anchor: '+file);fs.writeFileSync(file,s.replace(before,after));}
const loads='source/src/modules/loads/';
fs.copyFileSync('scripts/v110322/loadGuideSteps.js',loads+'loadGuideStepsV110322.js');
for(const name of ['loadGuideV103.js','checklistEvidenceV110321.js']) {
  const file=loads+name, statement="import {loadGuideStepsV110322} from './loadGuideStepsV110322.js';\n";
  if(!read(file).includes(statement))fs.writeFileSync(file,statement+read(file));
}
// New Rate Cons and instruction guides start without duty-status tasks.
patch(loads+'loadGuideV103.js',"    requirements,\n    steps,\n    status:'active',","    requirements,\n    steps:loadGuideStepsV110322(steps),\n    status:'active',");
// Project old saved steps before current step, completion and totals are calculated.
patch(loads+'checklistEvidenceV110321.js','steps:list(guide.steps).map(step=>({...step,checklist:checklistItems(step.checklist)}))','steps:loadGuideStepsV110322(guide.steps).map(step=>({...step,checklist:checklistItems(step.checklist)}))');
const VERSION='110.3.22',BUILD='v110322-load-guide-without-logbook';
for(const file of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(file));Object.assign(d,{version:VERSION,build:BUILD,force:false,label:'v110.3.22 Load guide without Logbook prompts',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Removed pre-trip, Log arrival and Log Driving steps from the load guide.','Saved and new guides show route, stop and document steps with updated progress.']});fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const file of ['package.json','package-lock.json']){const d=JSON.parse(read(file));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(file);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(file,s);}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.21');assert.equal(meta.build,'v110321-checklist-logbook-evidence');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — load guide excludes Logbook steps for saved and new loads');
