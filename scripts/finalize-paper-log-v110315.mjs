import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
function patch(file,before,after){const s=read(file);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,`Paper log anchor: ${file} ${before.slice(0,80)}`);fs.writeFileSync(file,s.replace(before,after));}
fs.copyFileSync('scripts/v110315/paperLogEditingV110315.js','source/src/modules/logbook/eventEditingV110.js');
const edit='source/src/modules/editor/EditEventSheet.jsx';
if(!read(edit).includes('PAPER_LOG_EDIT_COMPLETE_V110315')) {
 patch(edit,'  const initialForm = useMemo(() => formStateFromEvent(event), [event.id, dayV110]);',`  // PAPER_LOG_EDIT_V110315: every stored duty status has editable Start, End and status.
  const initialForm = useMemo(() => formStateFromEvent(projectedV110.find(e=>e.id===event.id) || event), [event.id, dayV110]);`);
 patch(edit,'endMin:liveV110 ? clockV110.minute : fromInput(end),','endMin:liveV110 && end===initialForm.end ? clockV110.minute : fromInput(end),');
 patch(edit,'const rangeErrorV110 = editorRangeError(preview.startMin, preview.endMin, liveV110);','const rangeErrorV110 = editorRangeError(preview.startMin, preview.endMin, liveV110 && end===initialForm.end);');
 patch(edit,"const previewPatchV11023 = liveV110 ? {startMin:preview.startMin} : {status,startMin:preview.startMin,endMin:preview.endMin};",`const previewPatchV11023 = {};
  if(status!==initialForm.status)previewPatchV11023.status=status;
  if(start!==initialForm.start)previewPatchV11023.startMin=preview.startMin;
  if(end!==initialForm.end)previewPatchV11023.endMin=fromInput(end);`);
 patch(edit,'? {...logbookContext,eventsByDay:{...logbookContext.eventsByDay,[dayV110]:previewResultV11023.events}}','? (previewResultV11023.state || {...logbookContext,eventsByDay:{...logbookContext.eventsByDay,[dayV110]:previewResultV11023.events}})');
 const s=read(edit),a=s.indexOf('    if (liveV110) {\n      put('),b=s.indexOf('    for (const [key,value]',a);assert.ok(a>0&&b>a);
 fs.writeFileSync(edit,s.slice(0,a)+`    put('status',status,initialForm.status);
    put('startMin',preview.startMin,fromInput(initialForm.start));
    if(end!==initialForm.end)put('endMin',fromInput(end),fromInput(initialForm.end));
`+s.slice(b));
 patch(edit,"onEditTime={(edge, m) => { if (edge === 'start') setStart(toInput(Math.min(liveV110 ? Math.max(0, clockV110.minute - 1) : 1439, m))); else if (!liveV110) setEnd(toInput(m)); }}","onEditTime={(edge, m) => { if (edge === 'start') setStart(toInput(Math.min(1439,m))); else setEnd(toInput(m)); }}");
 patch(edit,'<EditorTimeControls start={start} end={liveV110 ? toInput(clockV110.minute) : end} onStartChange={setStart} onEndChange={setEnd} live={liveV110} timeZone={clockV110.timeZone} />','<EditorTimeControls allowMidnightInput start={start} end={liveV110 && end===initialForm.end ? toInput(clockV110.minute) : end} onStartChange={setStart} onEndChange={setEnd} timeZone={clockV110.timeZone} />');
 patch(edit,'{!liveV110 && previewResultV11023?.ok===false','{previewResultV11023?.ok===false');
 patch(edit,'{liveV110 ? <div className="editor-live-heading-v110"><strong>{DUTY_SHORT_LABELS[status]} <span>LIVE</span></strong><button type="button" onClick={changeLiveStatusV110}>Change status</button></div> : <EditorDutyStatusControls status={status} onChange={changeStatus} />}','<EditorDutyStatusControls status={status} onChange={changeStatus} />');
 // The graph and field must display the same exact draft even while a live end is being corrected.
 patch(edit,'events={editorGraphEventsV11034}','events={editorGraphEventsV11034.map(row=>row.id===event.id?{...row,startMin:preview.startMin,endMin:preview.endMin,isLive:false}:row)}');
  fs.writeFileSync(edit,'// PAPER_LOG_EDIT_COMPLETE_V110315\n'+read(edit));
}
patch('source/src/modules/editor/components/CompactGraphPanelV111.jsx',"const editableEdges = selected?.isLive ? ['start'] : ['start','end'];","const editableEdges = ['start','end'];");
const insert='source/src/modules/editor/InsertEditEventSheet.jsx';
patch(insert,'const insertLimitV110314 = insertDayLimitV110314(logbookContext, clockV110);','const insertLimitV110314 = 1440;\n  const defaultInsertLimitV110315 = insertDayLimitV110314(logbookContext, clockV110);');
patch(insert,'initialInsertRangeV110314(insertLimitV110314, defaults.startMin, defaults.endMin)','initialInsertRangeV110314(defaultInsertLimitV110315, defaults.startMin, defaults.endMin)');
patch(insert,'quickInsertRangeV110314(insertLimitV110314, minAgo)','quickInsertRangeV110314(defaultInsertLimitV110315, minAgo)');
// Direct manual End wins over the app's live-tail display after Save/reopen.
patch('source/src/core/timeline/displayTimeline.js','  const raw = realDisplayBase(eventsByDay?.[day] || []);','  const raw = realDisplayBase(eventsByDay?.[day] || []);\n  if(raw.some(e=>e.paperLogEndV110315))return raw;');
patch('source/src/modules/logbook/dutyViewV110212.js','  if (!exactEvents.length) return continuousEvents;','  if (!exactEvents.length) return continuousEvents;\n  if(exactEvents.some(e=>e.paperLogEndV110315))return exactEvents;');
patch('source/src/core/timeline/liveStatusTailV1036.js','  const last = rows[lastIndex] || {};','  const last = rows[lastIndex] || {};\n  if(last.paperLogEndV110315)return {events:rows,extended:false,eventId:last.id,rawEndMin:last.endMin,targetEnd};');
const VERSION='110.3.15',BUILD='v110315-paper-log-editing';
for(const file of ['release-version.json','public/app-version.json']){const data=JSON.parse(read(file));Object.assign(data,{version:VERSION,build:BUILD,force:false,label:'v110.3.15 Editable paper log',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Edit Start, End and duty status for every paper-log event, including Driving and current events.','Edit and Insert adjust neighboring intervals without live or ELD source restrictions.','Manually corrected End times persist after reopening.']});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
for(const file of ['package.json','package-lock.json']){const d=JSON.parse(read(file));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(file);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(file,s);}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.14');assert.equal(meta.build,'v110314-valid-insert-time-controls');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — paper log 110.3.15: editable Driving, current events and adjacent boundaries');
// Update the old browser expectations to the explicitly requested paper-log behavior.
const logTest='scripts/browser-logbook-editor-v110.mjs';
patch(logTest,"assert.equal(await page.getByRole('slider',{name:'end time handle',exact:true}).count(),0)","assert.equal(await page.getByRole('slider',{name:'end time handle',exact:true}).count(),1)");
patch(logTest,"assert.match(await page.locator('.live-now-v110').innerText(),/Now\\s*17:20/)","assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'17:20')");
patch(logTest,"await page.getByRole('button',{name:'Change status',exact:true}).click();await page.waitForTimeout(250);assert.equal(await page.locator('.editor-ui-v110').count(),0);assert.equal((await stored(page)).currentStatus,'D');", "await page.locator('.editor-duty-grid').getByRole('button',{name:'ON',exact:true}).click();await page.locator('.save-main').click();await waitState(page,s=>s.currentStatus==='ON');assert.equal(await page.locator('.editor-ui-v110').count(),0);");
const compact='scripts/browser-compact-editor-v111.mjs';
patch(compact,"assert.equal(await page.getByRole('slider').count(),1,'live event exposes only its Start boundary')","assert.equal(await page.getByRole('slider').count(),2,'paper-log current event exposes both boundaries')");
patch(compact,"assert.equal(await page.getByRole('slider',{name:'end time handle',exact:true}).count(),0)","assert.equal(await page.getByRole('slider',{name:'end time handle',exact:true}).count(),1)");
const motive='scripts/browser-motive-override-v11023.mjs';
if(!read(motive).includes('PAPER_SOURCE_EDIT_V110315')) {
 const s=read(motive),a=s.indexOf('   }else{\n    await openTarget(page);'),b=s.indexOf('   }\n   assert.deepEqual(errors',a);assert.ok(a>0&&b>a);
 fs.writeFileSync(motive,s.slice(0,a)+`   }else{
    // PAPER_SOURCE_EDIT_V110315: imported/GPS source tags are editable in this manual log.
    await openTarget(page);await page.getByLabel('End time',{exact:true}).fill('12:15');assert.equal(await page.locator('.save-main').isDisabled(),false);await page.locator('.cancel-main').click();assert.deepEqual((await stored(page)).eventsByDay,original.eventsByDay);
    await page.getByRole('button',{name:'Insert',exact:true}).click();await page.locator('.editor-compact-v111').waitFor();await page.getByLabel('Start time',{exact:true}).fill('12:10');await page.getByLabel('End time',{exact:true}).fill('12:20');assert.equal(await page.locator('.save-main').isDisabled(),false);await page.locator('.save-main').click();const saved=await waitState(page,s=>s.eventsByDay[day].some(e=>e.startMin===730&&e.endMin===740&&e.status==='ON'));assert.equal(saved.eventsByDay[day].find(e=>e.id==='auto').endMin,730);await page.reload();await openLog(page);assert.deepEqual((await stored(page)).eventsByDay,saved.eventsByDay);
`+s.slice(b));
}
