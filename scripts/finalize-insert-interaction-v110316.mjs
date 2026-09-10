import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(file,before,after) {
 const s=read(file);
 if(s.includes(after))return;
 assert.equal(s.split(before).length-1,1,`Insert 110.3.16 anchor: ${file} ${before.slice(0,100)}`);
 fs.writeFileSync(file,s.replace(before,after));
}
fs.copyFileSync('scripts/v110316/insertInteractionsV110316.js','source/src/modules/editor/insertInteractionsV110316.js');
const insert='source/src/modules/editor/InsertEditEventSheet.jsx';
patch(insert,'insertBoundaryV110314(current, edge, minute, insertLimitV110314);','insertBoundaryV110314(current, edge, minute, insertLimitV110314, true);');
patch(insert,'      <EditorGraphPanel\n        events={previewEvents}',`      <EditorGraphPanel
        freeInsertBoundaries={mode === 'insert'}
        onRestoreRange={range => {const next={...insertDraftEvent,startMin:range.startMin,endMin:range.endMin};setInsertDraftEvent(next);setForm(eventToForm(next));}}
        events={previewEvents}`);
patch(insert,'        onSelect={selectEvent}',"        onSelect={(id, minute) => mode === 'insert' ? graphEmptyTap(form.status, minute) : selectEvent(id)}");
assert.ok(read(insert).includes('allowMidnightInput'),'Insert must keep its editable midnight input');
patch(insert,'const defaultInsertLimitV110315 = insertDayLimitV110314(logbookContext, clockV110);',"const defaultInsertLimitV110315 = logbookContext.activeDay === clockV110.day ? Math.max(1, clockV110.minute) : 1440;");
patch(insert,"const rangeErrorV110 = mode === 'insert' && insertLimitV110314 < 1 ? 'There is no elapsed time on this log day yet.' : editorRangeError(fromInput(form.start),fromInput(form.end));","const rangeErrorV110 = editorRangeError(fromInput(form.start),fromInput(form.end));");
// Use the full preview state, including any session changes, for the graph.
patch(insert,'projectLogbookEvents({...logbookContext,eventsByDay:{...logbookContext.eventsByDay,[logbookContext.activeDay]:insertResultV11023.events}},logbookContext.activeDay,clockV110.at)',"projectLogbookEvents(insertResultV11023.state || {...logbookContext,eventsByDay:{...logbookContext.eventsByDay,[logbookContext.activeDay]:insertResultV11023.events}},logbookContext.activeDay,clockV110.at)");
const panel='source/src/modules/editor/components/CompactGraphPanelV111.jsx';
patch(panel,"import LogGraph from '../../graph/LogGraph.jsx';","import LogGraph from '../../graph/LogGraph.jsx';\nimport { insertPointerMinuteV110316 } from '../insertInteractionsV110316.js';");
patch(panel,'onSelect, onEmptyTap, header })','onSelect, onEmptyTap, header, freeInsertBoundaries=false, onRestoreRange })');
patch(panel,'draggedMinuteV111(snapshot, edge, initial, p.clientX - x, svgWidth)',"freeInsertBoundaries ? insertPointerMinuteV110316(edge,initial,p.clientX-x,svgWidth) : draggedMinuteV111(snapshot, edge, initial, p.clientX - x, svgWidth)");
patch(panel,"callback.current?.(edge, initial); stop();","if(freeInsertBoundaries && onRestoreRange)onRestoreRange(snapshot);else callback.current?.(edge, initial); stop();");
patch(panel,"aria-valuemin={edge === 'start' ? 0 : selected.startMin + 1} aria-valuemax={edge === 'start' ? selected.endMin - 1 : 1440}","aria-valuemin={freeInsertBoundaries ? (edge==='start'?0:1) : edge === 'start' ? 0 : selected.startMin + 1} aria-valuemax={freeInsertBoundaries ? (edge==='start'?1439:1440) : edge === 'start' ? selected.endMin - 1 : 1440}");
patch(panel,"onEditTime(edge, draggedMinuteV111(selected, edge, selected[edge + 'Min'], direction * (e.shiftKey ? 5 : 1) * 0.894 / 1440, 1));","onEditTime(edge, freeInsertBoundaries ? insertPointerMinuteV110316(edge,selected[edge+'Min'],direction*(e.shiftKey?5:1)*0.894/1440,1) : draggedMinuteV111(selected, edge, selected[edge + 'Min'], direction * (e.shiftKey ? 5 : 1) * 0.894 / 1440, 1));");
patch('source/src/modules/graph/LogGraphV110.jsx','onSelect?.(s.event.id);}} onKeyDown', 'onSelect?.(s.event.id,minute(e));}} onKeyDown');
patch('source/src/modules/graph/LogGraphV110.jsx',"onSelect?.(s.event.id);}}} />;","onSelect?.(s.event.id,s.event.startMin);}}} />;");
const time='source/src/modules/editor/components/EditorTimeControlsV110.jsx';
patch(time,"timeZone='',maxMinute=1440})","timeZone='',maxMinute=1440,allowMidnightInput=false})");
patch(time,"disabled={end==='24:00'}","disabled={end==='24:00' && !allowMidnightInput}");
patch(time,"onChange={e=>onEndChange(e.target.value)}","onChange={e=>onEndChange(allowMidnightInput && e.target.value==='00:00' ? '24:00' : e.target.value)}");
// A previous day's unclosed OFF/SB/ON tail already runs to midnight in the
// Logbook view. Insert splits that same interval when the driver saves there.
// Explicitly ended records and unrelated earlier intervals retain their bounds.
const contract='source/src/modules/logbook/eventEditingV110.js';
patch(contract,'export function previewLogbookInsertOverride(state,{day,event,expectedRows},at=new Date()) {',`function insertRowsV110316(state,day,event,at) {
  const projected=elapsedRows(state,day,at),clock=logbookClock(state,at);
  const last=projected.rows.filter(active).slice().sort((a,b)=>a.startMin-b.startMin).at(-1);
  if(day<clock.day && last && ['OFF','SB','ON'].includes(last.status)
    && last.source==='live_status' && !last.paperLogEndV110315
    && event.endMin>last.startMin && last.endMin<1440) {
    return {...projected,rows:projected.rows.map(row=>row===last?{...row,endMin:1440}:row)};
  }
  return projected;
}
export function previewLogbookInsertOverride(state,{day,event,expectedRows},at=new Date()) {`);
patch(contract,"const projected=elapsedRows(state,day,at), result=replaceInterval(projected.rows,null,{...event,source:'manual'});","const projected=insertRowsV110316(state,day,event,at), result=replaceInterval(projected.rows,null,{...event,source:'manual'});");
const VERSION='110.3.16',BUILD='v110316-insert-touch-and-midnight';
for(const file of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(file));Object.assign(d,{version:VERSION,build:BUILD,force:false,label:'v110.3.16 Insert time and graph',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Insert handles move one-minute intervals in both directions.','Midnight End remains editable and graph taps keep Insert open.','Insert preserves the existing overnight OFF, SB or ON tail when splitting a previous day.']});fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const file of ['package.json','package-lock.json']){const d=JSON.parse(read(file));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(file);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(file,s);}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.15');assert.equal(meta.build,'v110315-paper-log-editing');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — Insert 110.3.16: free draft handles, editable midnight and historical tail split');
