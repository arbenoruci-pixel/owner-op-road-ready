import fs from 'node:fs';
import assert from 'node:assert/strict';

const VERSION='110.2.10';
const BUILD='v110210-live-start-edit';
const read=path=>fs.readFileSync(path,'utf8');
const write=(path,value)=>fs.writeFileSync(path,value);
function once(source,before,after,label){
  if(source.includes(after) && !source.includes(before)) return source;
  const count=source.split(before).length-1;
  assert.equal(count,1,`110.2.10 anchor changed: ${label}; found ${count}`);
  return source.replace(before,after);
}

// Restore the driver's explicit ability to correct the START boundary of the
// current live manual status. End stays projected to Now and status changes
// continue through the separate Change status workflow. Automatic Driving
// remains protected.
{
  const path='source/src/modules/logbook/eventEditingV110.js';
  let source=read(path);
  source=once(source,
    "const after={...before,...changes},temporal=boundsChanged(before,after),live=liveIds(state,day,at);if(temporal&&live.has(id))return{ok:false,error:'Use Change status to end the live event. Its timing continues while you edit details.'};if(temporal&&isProtectedAutomaticDriving(before))return{ok:false,error:'Automatic Driving time is protected. Its notes can be edited separately.'};",
    "const after={...before,...changes},temporal=boundsChanged(before,after),live=liveIds(state,day,at);const liveTarget=live.has(id);const liveStartCorrection=liveTarget&&temporal&&Object.hasOwn(changes,'startMin')&&!Object.hasOwn(changes,'status')&&!Object.hasOwn(changes,'endMin');if(temporal&&liveTarget&&!liveStartCorrection)return{ok:false,error:'Use Change status to end the live event. End stays at Now while Start can be corrected.'};if(temporal&&isProtectedAutomaticDriving(before))return{ok:false,error:'Automatic Driving time is protected. Its notes can be edited separately.'};",
    'live edit permission');
  source=once(source,
    "if(temporal){if(expectedRows&&!equal(rows,expectedRows))return{ok:false,error:'Another event changed while Edit was open. Reopen the day before replacing time.'};return replaceInterval(rows,before,after,live);}return{ok:true,changed:true,events:rows.map(e=>e===before?after:e),changedIds:[id],neighborIds:[],timelineChanged:false};",
    "if(temporal){if(expectedRows&&!equal(rows,expectedRows))return{ok:false,error:'Another event changed while Edit was open. Reopen the day before replacing time.'};if(liveStartCorrection){const clock=logbookClock(state,at);if(after.startMin>=clock.minute)return{ok:false,error:'Live Start must stay before Now.'};const projectedBefore={...before,endMin:clock.minute};const liveAfter={...after,endMin:clock.minute};return replaceInterval(rows,projectedBefore,liveAfter,live);}return replaceInterval(rows,before,after,live);}return{ok:true,changed:true,events:rows.map(e=>e===before?after:e),changedIds:[id],neighborIds:[],timelineChanged:false};",
    'live start override');
  write(path,source);
}

// The live editor now previews and saves Start exactly like a manual boundary
// override. End is still read-only Now; live status itself still uses Change status.
{
  const path='source/src/modules/editor/EditEventSheet.jsx';
  let source=read(path);
  source=once(source,
    "  const previewPatchV11023 = liveV110 ? {} : {status,startMin:preview.startMin,endMin:preview.endMin};",
    "  const previewPatchV11023 = liveV110 ? {startMin:preview.startMin} : {status,startMin:preview.startMin,endMin:preview.endMin};",
    'live preview patch');
  source=once(source,
    "  const previewEvents = liveV110\n    ? projectedV110.map(e=>e.id===event.id?{...preview,isLive:true}:e)\n    : (previewResultV11023.ok ? projectLogbookEvents(previewStateV11023,dayV110,clockV110.at) : projectedV110);",
    "  const previewEvents = previewResultV11023.ok ? projectLogbookEvents(previewStateV11023,dayV110,clockV110.at) : projectedV110;",
    'live override preview timeline');
  source=once(source,
    "    if (rangeErrorV110 || gpsPending || (!liveV110 && previewResultV11023?.ok === false)) return;",
    "    if (rangeErrorV110 || gpsPending || previewResultV11023?.ok === false) return;",
    'live preview save guard');
  source=once(source,
`    if (!liveV110) {
      put('status',status,initialForm.status);
      put('startMin',preview.startMin,fromInput(initialForm.start));
      put('endMin',preview.endMin,fromInput(initialForm.end));
    }`,
`    if (liveV110) {
      put('startMin',preview.startMin,fromInput(initialForm.start));
    } else {
      put('status',status,initialForm.status);
      put('startMin',preview.startMin,fromInput(initialForm.start));
      put('endMin',preview.endMin,fromInput(initialForm.end));
    }`,
    'save live start only');
  source=once(source,
    "        onEditTime={liveV110 ? undefined : (edge, m) => edge === 'start' ? setStart(toInput(Math.min(1439,m))) : setEnd(toInput(m))}",
    "        onEditTime={(edge, m) => { if (edge === 'start') setStart(toInput(Math.min(liveV110 ? Math.max(0, clockV110.minute - 1) : 1439, m))); else if (!liveV110) setEnd(toInput(m)); }}",
    'live graph start callback');
  source=once(source,
    "disabled={gpsPending || !!rangeErrorV110 || (!liveV110 && previewResultV11023?.ok === false) || !dirty}",
    "disabled={gpsPending || !!rangeErrorV110 || previewResultV11023?.ok === false || !dirty}",
    'live save disabled guard');
  write(path,source);
}

// Direct Start input remains editable during a live manual status; End stays Now.
{
  const path='source/src/modules/editor/components/EditorTimeControlsV110.jsx';
  let source=read(path);
  source=once(source,
    "value={start==='24:00'?'00:00':start} disabled={live} onChange={e=>onStartChange(e.target.value)}",
    "value={start==='24:00'?'00:00':start} onChange={e=>onStartChange(e.target.value)}",
    'live Start input');
  write(path,source);
}

// Compact phone graph exposes one large START handle for a live event. The End
// handle remains absent because the live event always ends at Now.
{
  const path='source/src/modules/editor/components/CompactGraphPanelV111.jsx';
  let source=read(path);
  source=once(source,
    "const editable = !!selected && !!onEditTime && !selected.isLive;const centers = handleCentersV111(selected?.startMin || 0, selected?.endMin || 0, width);",
    "const editable = !!selected && !!onEditTime;const editableEdges = selected?.isLive ? ['start'] : ['start','end'];const centers = handleCentersV111(selected?.startMin || 0, selected?.endMin || 0, width);",
    'live compact editable start');
  source=once(source,
    "function drag(e, edge) {if (!editable || (e.button != null && e.button !== 0)) return;",
    "function drag(e, edge) {if (!editable || !editableEdges.includes(edge) || (e.button != null && e.button !== 0)) return;",
    'live compact drag edge');
  source=once(source,
    "{editable && <div className=\"graph-handle-rail-v111\" ref={rail}>{['start', 'end'].map(edge =>",
    "{editable && <div className=\"graph-handle-rail-v111\" ref={rail}>{editableEdges.map(edge =>",
    'live compact handle list');
  write(path,source);
}

// Update the existing real-browser contracts: live Start is editable, exactly
// one START slider is visible, and End remains Now/read-only.
{
  const path='scripts/browser-logbook-editor-v110.mjs';
  let source=read(path);
  source=once(source,
    "await page.locator('[data-log-event-id=live] .blue-edit').click();assert.ok(await page.getByLabel('Start time',{exact:true}).isDisabled());assert.match(await page.locator('.live-now-v110').innerText(),/Now\\s*17:20/);assert.equal((await page.locator('.selected-duration-live b').innerText()).trim(),'2h 5m');",
    "await page.locator('[data-log-event-id=live] .blue-edit').click();assert.equal(await page.getByLabel('Start time',{exact:true}).isDisabled(),false);assert.equal(await page.getByRole('slider',{name:'start time handle',exact:true}).count(),1);assert.equal(await page.getByRole('slider',{name:'end time handle',exact:true}).count(),0);assert.match(await page.locator('.live-now-v110').innerText(),/Now\\s*17:20/);assert.equal((await page.locator('.selected-duration-live b').innerText()).trim(),'2h 5m');",
    'browser live start enabled');
  write(path,source);
}
{
  const path='scripts/browser-compact-editor-v111.mjs';
  let source=read(path);
  source=once(source,
    "assert.equal(await page.getByRole('slider').count(),0,'live timing remains protected');assert.ok(await page.getByLabel('Start time',{exact:true}).isDisabled());",
    "assert.equal(await page.getByRole('slider').count(),1,'live event exposes only its Start boundary');assert.equal(await page.getByRole('slider',{name:'start time handle',exact:true}).count(),1);assert.equal(await page.getByRole('slider',{name:'end time handle',exact:true}).count(),0);assert.equal(await page.getByLabel('Start time',{exact:true}).isDisabled(),false);",
    'compact browser live start contract');
  write(path,source);
}

// Release identity. Keep the normal service-worker handshake and preserve all
// local driver data.
for (const path of ['release-version.json','public/app-version.json']) {
  const meta=JSON.parse(read(path));
  Object.assign(meta,{
    version:VERSION,
    build:BUILD,
    force:false,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || meta.sourceCommit || null,
    releasedAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    label:'Editable live Start boundary',
    notes:[
      'The current live manual duty event Start can be moved backward or forward to any minute before Now.',
      'Moving live Start replaces overlapping manual duty time with full edit-history preservation.',
      'End remains Now, Change status remains separate, and automatic Driving timing remains protected.'
    ]
  });
  write(path,JSON.stringify(meta,null,2)+'\n');
}
for (const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let source=read(path);
  source=source.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`)
    .replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);
  write(path,source);
}
for (const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']) {
  let source=read(path);
  source=source.replace(/App v110\.2\.9/g,`App v${VERSION}`).replace(/APP V110\.2\.9/g,`APP V${VERSION}`);
  write(path,source);
}

console.log('PASS — 110.2.10 live Start editing restored; End remains Now and automatic Driving stays protected');
