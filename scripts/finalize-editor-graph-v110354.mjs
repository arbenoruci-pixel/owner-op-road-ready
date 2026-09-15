import fs from 'node:fs';
import assert from 'node:assert/strict';

const VERSION='110.3.54';
const BUILD='v110354-editor-graph-cleanup';
const panelPath='source/src/modules/editor/components/CompactGraphPanelV111.jsx';
let source=fs.readFileSync(panelPath,'utf8');

// The phone editor already has direct Start/End fields immediately below the graph.
// Keep the graph as a clean preview and remove the duplicate floating START/END
// grabber rail that covers the duty trace on iOS. Edit and Insert share this panel.
const before="    {editable && <div className=\"graph-handle-rail-v111\" ref={rail}>{['start', 'end'].map(edge => <button key={edge} type=\"button\" className=\"graph-handle-v110 graph-handle-large-v110 modern-handle-v11027\" role=\"slider\" aria-label={`${edge} time handle`} aria-valuemin={edge === 'start' ? 0 : selected.startMin + 1} aria-valuemax={edge === 'start' ? selected.endMin - 1 : 1440} aria-valuenow={selected[edge + 'Min']} aria-valuetext={timeLabel(selected[edge + 'Min'])} data-edge={edge} style={{ left: clampedHandleLeftV111(edge,centers[edge]) }} onPointerDown={e => drag(e, edge)} onKeyDown={e => {if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;e.preventDefault(); const direction = e.key === 'ArrowLeft' ? -1 : 1;onEditTime(edge, draggedMinuteV111(selected, edge, selected[edge + 'Min'], direction * (e.shiftKey ? 5 : 1) * 0.894 / 1440, 1));}}><span>{edge.toUpperCase()}</span><b>{timeLabel(selected[edge + 'Min'])}</b><i aria-hidden=\"true\">•••</i></button>)}</div>}";
const after="    {/* EDITOR_GRAPH_CLEAN_V110354: Start/End are edited with the direct time controls below; no duplicate floating rail over the graph. */}";
if(!source.includes(after)){
  assert.equal(source.split(before).length-1,1,'Compact editor floating handle rail anchor changed');
  source=source.replace(before,after);
}
assert.ok(!source.includes('graph-handle-rail-v111\" ref={rail}'),'Floating graph handle rail must be absent');
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

// The shared panel is the important regression contract: both editors route through it.
const edit=fs.readFileSync('source/src/modules/editor/EditEventSheet.jsx','utf8');
const insert=fs.readFileSync('source/src/modules/editor/InsertEditEventSheet.jsx','utf8');
assert.ok(edit.includes('<EditorGraphPanel'),'Edit must still render the shared graph panel');
assert.ok(insert.includes('<EditorGraphPanel'),'Insert must still render the shared graph panel');
assert.ok(edit.includes('<EditorTimeControls'),'Edit must retain direct time controls');
assert.ok(insert.includes('<EditorTimeControls'),'Insert must retain direct time controls');
console.log('PASS — v110.3.54 Edit/Insert graph no longer renders duplicate floating time bubbles');