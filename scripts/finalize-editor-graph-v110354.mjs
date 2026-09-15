import fs from 'node:fs';
import assert from 'node:assert/strict';

const VERSION='110.3.54';
const BUILD='v110354-editor-graph-cleanup';
const panelPath='source/src/modules/editor/components/CompactGraphPanelV111.jsx';
let source=fs.readFileSync(panelPath,'utf8');

// Edit and Insert already expose direct Start Time / End Time controls below the
// graph. The compact graph rail duplicates those controls and becomes the two
// large floating time bubbles seen in the iPhone recording.
const marker='EDITOR_GRAPH_CLEAN_V110354';
if(!source.includes(marker)){
  const rail=/\{editable\s*&&\s*<div\s+className=["']graph-handle-rail-v111["'][\s\S]*?<\/div>\}/;
  const matches=source.match(new RegExp(rail.source,'g')) || [];
  assert.equal(matches.length,1,'Expected exactly one materialized compact graph handle rail');
  source=source.replace(rail,`{/* ${marker}: direct time fields remain below; floating duplicate rail removed. */}`);
}
assert.ok(!/className=["']graph-handle-rail-v111["']/.test(source),'Floating graph handle rail must be absent');
assert.ok(source.includes('compact-graph-panel-v111'),'Shared compact graph panel must remain installed');
assert.ok(source.includes('<LogGraph'),'Graph preview must remain installed');
fs.writeFileSync(panelPath,source);

const now=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.54 Clean Edit / Insert graph',releasedAt:now,updatedAt:now,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Remove the duplicate floating Start/End bubbles that covered the graph in Edit and Insert on iPhone.','Keep direct Start Time and End Time controls and the live graph preview.','Do not change saved duty events, edit history, Insert override logic, signatures, routes or documents.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(fs.readFileSync(path,'utf8')); value.version=VERSION; if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let text=fs.readFileSync(path,'utf8');
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]]) text=text.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);
  fs.writeFileSync(path,text);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']) fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));

const edit=fs.readFileSync('source/src/modules/editor/EditEventSheet.jsx','utf8');
const insert=fs.readFileSync('source/src/modules/editor/InsertEditEventSheet.jsx','utf8');
assert.ok(edit.includes('<EditorGraphPanel'),'Edit must still render the shared graph panel');
assert.ok(insert.includes('<EditorGraphPanel'),'Insert must still render the shared graph panel');
assert.ok(edit.includes('<EditorTimeControls'),'Edit must retain direct time controls');
assert.ok(insert.includes('<EditorTimeControls'),'Insert must retain direct time controls');
console.log('PASS — v110.3.54 Edit/Insert graph no longer renders duplicate floating time bubbles');