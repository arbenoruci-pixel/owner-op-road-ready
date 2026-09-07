import assert from 'node:assert/strict';
import fs from 'node:fs';
import { draggedMinuteV111, handleCentersV111, clampedHandleLeftV111 } from '../source/src/modules/editor/components/graphHandlesV111.js';
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS — '+name);};
for(const width of [320,390,430,844]) for(const range of [[0,1],[915,916],[1400,1440],[0,1440]])test('grabbers remain separate and inside '+width+'px '+range,()=>{
 const points=handleCentersV111(...range,width);assert.ok(points.start>=58);assert.ok(points.end<=width-58);assert.ok(points.end-points.start>=108);
});
const event={id:'fixture',startMin:915,endMin:916,status:'ON'},before=structuredClone(event);
test('zero-distance drag never jumps to the label position',()=>assert.equal(draggedMinuteV111(event,'end',916,0,390),916));
test('start cannot cross the other endpoint',()=>assert.equal(draggedMinuteV111(event,'start',915,500,390),915));
test('end cannot cross the other endpoint',()=>assert.equal(draggedMinuteV111(event,'end',916,-500,390),916));
test('next-day midnight remains a valid end',()=>assert.equal(draggedMinuteV111(event,'end',916,500,390),1440));
test('drag never mutates the original event',()=>assert.deepEqual(event,before));
for(const name of ['EditEventSheet','InsertEditEventSheet'])test(name+' has graph first and one explicit save footer',()=>{
 const s=fs.readFileSync(`source/src/modules/editor/${name}.jsx`,'utf8');
 const graph=s.indexOf('      <EditorGraphPanel'),form=s.indexOf('      <div className="form editor-form-v85">'),duty=s.indexOf('      <EditorDutyStatusControls',graph);
 assert.ok(graph>0&&form>graph);if(duty>0)assert.ok(duty>form);
 assert.equal((s.match(/className="save-main"/g)||[]).length,1);assert.match(s,/compact-editor-footer-v111/);assert.match(s,/editor-compact-v111/);
});
test('existing live edit and original-row guard stay installed',()=>{
 const s=fs.readFileSync('source/src/modules/editor/EditEventSheet.jsx','utf8');assert.match(s,/onEditTime=\{liveV110 \? undefined/);assert.match(s,/expected:initialRawV110,patch/);assert.match(s,/onClose\(\)/);
});
test('compact renderer uses real-pixel targets and pointer cancellation',()=>{
 const s=fs.readFileSync('source/src/modules/editor/components/CompactGraphPanelV111.jsx','utf8');assert.match(s,/role="slider"/);assert.match(s,/setPointerCapture/);assert.match(s,/pointercancel/);assert.match(s,/!selected.isLive/);assert.match(s,/Done graph/);assert.doesNotMatch(s,/localStorage|indexedDB|setState\(/);
});
test('stylesheet is last, scoped and provides a 44px grabber',()=>{
 const css=fs.readFileSync('source/src/modules/editor/compact-editor-v111.css','utf8'),layout=fs.readFileSync('app/layout.jsx','utf8');
 assert.match(css,/height:44px!important/);assert.match(css,/min-height:0!important;overflow-y:auto/);assert.match(css,/\.editor-ui-v110.editor-compact-v111/);assert.ok(layout.indexOf('compact-editor-v111.css')>layout.indexOf('logbook-editor-v110.css'));
});
test('both grabbers are synchronously capped by current CSS container width',()=>{
 assert.equal(clampedHandleLeftV111('start',180),'clamp(8px, 130px, calc(100% - 216px))');
 assert.equal(clampedHandleLeftV111('end',290),'clamp(116px, 240px, calc(100% - 108px))');
 const source=fs.readFileSync('source/src/modules/editor/components/CompactGraphPanelV111.jsx','utf8');assert.match(source,/left: clampedHandleLeftV111\(edge,centers\[edge\]\)/);assert.match(source,/visualViewport\?\.addEventListener/);
});
for(const oldWidth of [312,382,836])for(const width of [312,382,836])test('delayed observer remains bounded: '+oldWidth+'→'+width,()=>{
 const p=handleCentersV111(915,916,oldWidth);
 const start=Math.max(8,Math.min(width-216,p.start-50));
 const end=Math.max(116,Math.min(width-108,p.end-50));
 assert.ok(start>=0&&end+100<=width);assert.ok(end-start>=108);
});
console.log(`${passed} compact editor layout/drag regression checks passed`);
