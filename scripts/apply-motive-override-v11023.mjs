import fs from 'node:fs';
import assert from 'node:assert/strict';

function once(text, before, after, label) {
  if (text.includes(after)) return text;
  assert.equal(text.split(before).length, 2, label + ' anchor changed');
  return text.replace(before, after);
}

const editingPath='source/src/modules/logbook/eventEditingV110.js';
let editing=fs.readFileSync(editingPath,'utf8');
const oldBlock=`/** Exact single-event edit. No inferred OFF, neighbor merge, current-status change,
 * load mutation or signature replacement. The caller updates certification status. */
export function applyLogbookEditorEdit(state, { day, id, patch = {}, expected }, at = new Date()) {
  const rows = state.eventsByDay?.[day] || [];
  const index = rows.findIndex(e => e?.id === id && !e.voided);
  if (index < 0) return { ok:false, error:'This event is no longer available. Reopen the log.' };
  const before = rows[index];
  if (expected && !equal(before,expected)) return { ok:false, error:'This event changed while the editor was open. Reopen it before saving.' };
  const changes = {};
  for (const [key,value] of Object.entries(patch)) {
    if (!EDIT_FIELDS.has(key)) return { ok:false, error:\`Unsupported log field: \${key}\` };
    if (!equal(value,before[key])) changes[key] = value;
  }
  if (!Object.keys(changes).length) return { ok:true, changed:false, state };
  const live = projectLogbookEvents(state,day,at).find(e => e.id === id)?.isLive;
  if (live && ['status','startMin','endMin'].some(k => Object.hasOwn(changes,k))) return { ok:false, error:'Use Change status to end the live event. Its timing continues while you edit details.' };
  const after = { ...before, ...changes };
  if (!['OFF','SB','D','ON'].includes(after.status)) return { ok:false,error:'Choose a valid duty status.' };
  const error = editorRangeError(Number(after.startMin),Number(after.endMin));
  if (error) return { ok:false,error };
  const next = rows.slice(); next[index] = after;
  return { ok:true, changed:true, state:{ ...state, eventsByDay:{ ...state.eventsByDay,[day]:next } } };
}`;
const newBlock=`// MOTIVE_OVERRIDE_V11023: a manual time edit owns its selected interval.
// Overlapped manual rows are trimmed/split/removed; protected automatic Driving
// and the currently live row can never be overwritten by another event.
function isProtectedAutomaticDriving(event = {}) {
  if (event?.status !== 'D') return false;
  const source = String(event.source || '').toLowerCase();
  return event.autoRecorded === true || event.eld === true || event.vehicleGateway === true ||
    event.locationSource === 'eld' || event.drivingSource === 'eld' || event.drivingSource === 'vehicle_gateway' ||
    source === 'eld' || source === 'vehicle_gateway' || source.startsWith('gps_drive');
}
function intervalsOverlap(aStart,aEnd,bStart,bEnd) {
  return Number(aStart) < Number(bEnd) && Number(aEnd) > Number(bStart);
}
function uniqueSplitId(rows, sourceId, targetId, minute) {
  const used = new Set(rows.map(e => String(e?.id || '')));
  const base = \`\${sourceId}__split_\${targetId}_\${minute}\`;
  if (!used.has(base)) return base;
  for (let i=2;i<1000;i+=1) if (!used.has(\`\${base}_\${i}\`)) return \`\${base}_\${i}\`;
  return \`\${base}_\${Date.now()}\`;
}
function overrideManualInterval(rows, before, after) {
  const work = rows.filter(e => e?.id !== before.id).map(e => ({...e}));
  const changedIds = new Set([before.id]);
  // When one handle shrinks the old interval, the touching neighbor takes the
  // released time. This keeps a normal RODS day continuous like Motive.
  if (Number(after.startMin) > Number(before.startMin)) {
    const previous = work.filter(e => Number(e.endMin) === Number(before.startMin) && Number(e.startMin) < Number(before.startMin))
      .sort((a,b)=>Number(b.startMin)-Number(a.startMin))[0];
    if (previous && !isProtectedAutomaticDriving(previous)) {
      const blocker = work.filter(e => e.id !== previous.id && Number(e.startMin) > Number(before.startMin) && Number(e.startMin) < Number(after.startMin))
        .sort((a,b)=>Number(a.startMin)-Number(b.startMin))[0];
      previous.endMin = blocker ? Number(blocker.startMin) : Number(after.startMin);
      changedIds.add(previous.id);
    }
  }
  if (Number(after.endMin) < Number(before.endMin)) {
    const next = work.filter(e => Number(e.startMin) === Number(before.endMin) && Number(e.endMin) > Number(before.endMin))
      .sort((a,b)=>Number(a.endMin)-Number(b.endMin))[0];
    if (next && !isProtectedAutomaticDriving(next)) {
      const blocker = work.filter(e => e.id !== next.id && Number(e.endMin) < Number(before.endMin) && Number(e.endMin) > Number(after.endMin))
        .sort((a,b)=>Number(b.endMin)-Number(a.endMin))[0];
      next.startMin = blocker ? Number(blocker.endMin) : Number(after.endMin);
      changedIds.add(next.id);
    }
  }
  const out=[];
  for (const row of work) {
    if (!intervalsOverlap(row.startMin,row.endMin,after.startMin,after.endMin)) { out.push(row); continue; }
    if (isProtectedAutomaticDriving(row)) return {ok:false,error:'Automatic Driving time cannot be overwritten. Move the handle to the Driving boundary.'};
    changedIds.add(row.id);
    const keepLeft = Number(row.startMin) < Number(after.startMin);
    const keepRight = Number(row.endMin) > Number(after.endMin);
    if (keepLeft) out.push({...row,endMin:Number(after.startMin)});
    if (keepRight) {
      const right = {...row,startMin:Number(after.endMin)};
      if (keepLeft) right.id = uniqueSplitId([...rows,...out],row.id,before.id,after.endMin);
      out.push(right);
    }
  }
  out.push(after);
  out.sort((a,b)=>Number(a.startMin)-Number(b.startMin) || Number(a.endMin)-Number(b.endMin) || String(a.id).localeCompare(String(b.id)));
  return {ok:true,events:out,changedIds:[...changedIds]};
}
export function previewLogbookEditorOverride(state, { day, id, patch = {}, expected }, at = new Date()) {
  const rows = state.eventsByDay?.[day] || [];
  const index = rows.findIndex(e => e?.id === id && !e.voided);
  if (index < 0) return { ok:false, error:'This event is no longer available. Reopen the log.' };
  const before = rows[index];
  if (expected && !equal(before,expected)) return { ok:false, error:'This event changed while the editor was open. Reopen it before saving.' };
  const changes = {};
  for (const [key,value] of Object.entries(patch)) {
    if (!EDIT_FIELDS.has(key)) return { ok:false, error:\`Unsupported log field: \${key}\` };
    if (!equal(value,before[key])) changes[key] = value;
  }
  if (!Object.keys(changes).length) return { ok:true, changed:false, events:rows, changedIds:[] };
  const projected = projectLogbookEvents(state,day,at);
  const liveTarget = projected.find(e => e.id === id)?.isLive;
  const timingChanged = ['startMin','endMin'].some(k => Object.hasOwn(changes,k));
  if (liveTarget && ['status','startMin','endMin'].some(k => Object.hasOwn(changes,k))) return { ok:false, error:'Use Change status to end the live event. Its timing continues while you edit details.' };
  const after = { ...before, ...changes };
  if (!['OFF','SB','D','ON'].includes(after.status)) return { ok:false,error:'Choose a valid duty status.' };
  const error = editorRangeError(Number(after.startMin),Number(after.endMin));
  if (error) return { ok:false,error };
  if (isProtectedAutomaticDriving(before) && ['status','startMin','endMin'].some(k => Object.hasOwn(changes,k))) {
    return {ok:false,error:'Automatic Driving time is protected. Add notes/details without changing its duty time.'};
  }
  if (timingChanged) {
    const liveConflict = projected.find(e => e.id !== id && e.isLive && intervalsOverlap(e.startMin,e.endMin,after.startMin,after.endMin));
    if (liveConflict) return {ok:false,error:'The current live event cannot be overwritten. Move the handle to its start time or change status first.'};
    const result = overrideManualInterval(rows,before,after);
    if (!result.ok) return result;
    return {ok:true,changed:true,events:result.events,changedIds:result.changedIds,timelineChanged:result.changedIds.some(changedId=>changedId!==id)};
  }
  const next=rows.slice(); next[index]=after;
  return {ok:true,changed:true,events:next,changedIds:[id],timelineChanged:false};
}
/** Explicit Logbook edit. Time changes use Motive-style manual interval override;
 * metadata-only edits remain exact single-row writes. Loads/documents stay external. */
export function applyLogbookEditorEdit(state, command, at = new Date()) {
  const result = previewLogbookEditorOverride(state,command,at);
  if (!result.ok || !result.changed) return result.ok ? {...result,state} : result;
  return {...result,state:{...state,eventsByDay:{...state.eventsByDay,[command.day]:result.events}}};
}`;
if (!editing.includes('MOTIVE_OVERRIDE_V11023')) {
  assert.equal(editing.split(oldBlock).length,2,'eventEditing exact-edit block changed');
  editing=editing.replace(oldBlock,newBlock);
  fs.writeFileSync(editingPath,editing);
}

const apiPath='source/src/modules/logbook/public-api.js';
let api=fs.readFileSync(apiPath,'utf8');
api=api.replace('projectLogbookEvents, applyLogbookEditorEdit','projectLogbookEvents, previewLogbookEditorOverride, applyLogbookEditorEdit');
fs.writeFileSync(apiPath,api);

const editPath='source/src/modules/editor/EditEventSheet.jsx';
let edit=fs.readFileSync(editPath,'utf8');
if(!edit.includes('MOTIVE_PREVIEW_V11023')) {
  edit=once(edit,
    "import { editorMinute as fromInput, editorTimeInput as toInput, editorRangeError, projectLogbookEvents } from '../logbook/public-api.js';",
    "import { editorMinute as fromInput, editorTimeInput as toInput, editorRangeError, projectLogbookEvents, previewLogbookEditorOverride } from '../logbook/public-api.js';",
    'editor public API import');
  edit=once(edit,
    "  const previewEvents = (projectedV110.length ? projectedV110 : events).map(e => e.id === event.id && !rangeErrorV110 ? {...preview,isLive:liveV110} : e);",
    `  // MOTIVE_PREVIEW_V11023: graph previews the same override that Save commits.
  const previewPatchV11023 = liveV110 ? {} : {status,startMin:preview.startMin,endMin:preview.endMin};
  const previewResultV11023 = rangeErrorV110 ? {ok:false,error:rangeErrorV110} : previewLogbookEditorOverride(logbookContext,{day:dayV110,id:event.id,patch:previewPatchV11023,expected:initialRawV110},clockV110.at);
  const previewStateV11023 = previewResultV11023.ok && previewResultV11023.changed
    ? {...logbookContext,eventsByDay:{...logbookContext.eventsByDay,[dayV110]:previewResultV11023.events}}
    : logbookContext;
  const previewEvents = liveV110
    ? projectedV110.map(e=>e.id===event.id?{...preview,isLive:true}:e)
    : (previewResultV11023.ok ? projectLogbookEvents(previewStateV11023,dayV110,clockV110.at) : projectedV110);`,
    'editor preview');
  edit=once(edit,
    `        {!liveV110 && <p className="editor-help-v110">Only this event changes. Check the graph for gaps or overlaps before saving.</p>}`,
    `        {!liveV110 && <p className={\`editor-help-v110 motive-override-help-v11023 \${previewResultV11023?.ok===false?'blocked':''}\`}>{previewResultV11023?.ok===false ? previewResultV11023.error : 'Dragging this event replaces overlapping manual duty time. Automatic/live Driving stays protected.'}</p>}`,
    'editor override help');
  edit=once(edit,
    `    if (rangeErrorV110 || gpsPending) return;`,
    `    if (rangeErrorV110 || gpsPending || (!liveV110 && previewResultV11023?.ok === false)) return;`,
    'editor save conflict guard');
  edit=once(edit,
    `disabled={gpsPending || !!rangeErrorV110 || !dirty}`,
    `disabled={gpsPending || !!rangeErrorV110 || (!liveV110 && previewResultV11023?.ok === false) || !dirty}`,
    'editor save disabled conflict');
  edit=once(edit,
    `<details className="compact-activities-v111"><summary>On duty activity <strong>{selectedOnReasons.length ? selectedOnReasons.join(' · ') : 'Choose activity'}</strong></summary><section className="form-section editor-on-duty-reasons">`,
    `<section className="form-section editor-on-duty-reasons quick-activities-v11023" aria-label="Quick on duty activities"><div className="quick-activities-head-v11023"><strong>Quick activity</strong><span>pick one or more</span></div>`,
    'quick activities open');
  edit=once(edit,
    `          </section></details>\n        )}`,
    `          </section>\n        )}`,
    'quick activities close');
  edit=edit.replace("{selectedOnReasons.includes(reason) ? '✓ ' : ''}{reason}",`<span className="quick-chip-check-v11023" aria-hidden="true">{selectedOnReasons.includes(reason) ? '✓' : ''}</span><span>{reason === 'Pre-trip inspection' ? 'PTI' : reason === 'Pickup / Loading' ? 'Pickup' : reason === 'Delivery / Unloading' ? 'Delivery' : reason === 'Hook Empty / Reposition' ? 'Reposition' : reason}</span>`);
  fs.writeFileSync(editPath,edit);
}

const insertPath='source/src/modules/editor/InsertEditEventSheet.jsx';
let insertEditor=fs.readFileSync(insertPath,'utf8');
if(!insertEditor.includes('MOTIVE_INSERT_QUICK_CHIPS_V11023')) {
  insertEditor=once(insertEditor,
    `      {/* COMPACT_INSERT_ACTIVITY_V111: selected activity stays visible; expand to change. */}
      <details className="compact-activities-v111"><summary>Activity <strong>{selectedReasons.length ? selectedReasons.join(' · ') : actionHeadingForStatus(form.status)}</strong></summary>
      <div className="insert-driver-block">`,
    `      {/* MOTIVE_INSERT_QUICK_CHIPS_V11023: always-visible multi-select quick activities. */}
      <div className="insert-driver-block quick-activities-v11023">`,
    'insert quick activities open');
  insertEditor=once(insertEditor,`      </div></details>

        <EditorLocationFields`,`      </div>

        <EditorLocationFields`,'insert quick activities close');
  insertEditor=insertEditor.replace(`              {reason}
            </button>`,`              <span className="quick-chip-check-v11023" aria-hidden="true">{selectedReasons.includes(reason) ? '✓' : ''}</span><span>{reason === 'Pre-trip inspection' ? 'PTI' : reason === 'Pickup / Loading' ? 'Pickup' : reason === 'Delivery / Unloading' ? 'Delivery' : reason === 'Hook Empty / Reposition' ? 'Reposition' : reason}</span>
            </button>`);
  fs.writeFileSync(insertPath,insertEditor);
}

const appPath='source/src/app/App.jsx';
let app=fs.readFileSync(appPath,'utf8');
if(!app.includes('MOTIVE_OVERRIDE_INSPECTION_RECONCILE_V11023')) {
  app=once(app,
    `        const linked = current.inspectionByDay?.[command.day]?.sourceEventId === id;\n        if (linked && ['status','startMin','endMin','city','state'].some(key => Object.hasOwn(command.patch,key))) {\n          next = reconcilePreTripInspections(next,[command.day]);\n        }`,
    `        // MOTIVE_OVERRIDE_INSPECTION_RECONCILE_V11023: an override can trim/remove\n        // neighboring manual events, so reconcile this day if any neighbor changed.\n        const linked = current.inspectionByDay?.[command.day]?.sourceEventId === id;\n        if (result.timelineChanged || (linked && ['status','startMin','endMin','city','state'].some(key => Object.hasOwn(command.patch,key)))) {\n          next = reconcilePreTripInspections(next,[command.day]);\n        }`,
    'inspection reconcile');
  fs.writeFileSync(appPath,app);
}

const cssPath='source/src/modules/editor/compact-editor-v111.css';
let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('MOTIVE_QUICK_CHIPS_V11023')) {
  css+=`\n/* MOTIVE_QUICK_CHIPS_V11023: always-visible multi-select activities. */\n.editor-ui-v110.editor-compact-v111 .quick-activities-v11023{margin:0!important;padding:0!important;border:0!important;background:transparent!important}\n.editor-ui-v110.editor-compact-v111 .quick-activities-head-v11023{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:0 0 6px;color:#334155}\n.editor-ui-v110.editor-compact-v111 .quick-activities-head-v11023 strong{font-size:12px;letter-spacing:.06em;text-transform:uppercase}.editor-ui-v110.editor-compact-v111 .quick-activities-head-v11023 span{font-size:11px;color:#667085}\n.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .reason-pills,.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .insert-reason-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important}\n.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .reason-pills button,.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .insert-reason-grid button{display:flex!important;align-items:center!important;justify-content:center!important;gap:4px!important;min-height:36px!important;padding:5px 6px!important;border-radius:18px!important;border:1px solid #c8d2dc!important;background:#fff!important;color:#334155!important;-webkit-text-fill-color:#334155!important;font-size:11px!important;font-weight:650!important;line-height:1.15!important}\n.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .reason-pills button.picked,.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .insert-reason-grid button.picked{border-color:#318c79!important;background:#e7f3ef!important;color:#075643!important;-webkit-text-fill-color:#075643!important}\n.editor-ui-v110.editor-compact-v111 .quick-chip-check-v11023{display:inline-grid;width:15px;height:15px;place-items:center;border-radius:50%;background:#edf1f5;color:transparent;font-size:10px;line-height:1;flex:none}\n.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 button.picked .quick-chip-check-v11023{background:#08765f;color:#fff!important;-webkit-text-fill-color:#fff!important}\n.editor-ui-v110.editor-compact-v111 .motive-override-help-v11023{margin:0!important;padding:6px 8px!important;border-radius:7px!important;background:#f2f7f5!important;color:#355b52!important;font-size:11px!important;line-height:1.35!important}.editor-ui-v110.editor-compact-v111 .motive-override-help-v11023.blocked{background:#fff1ed!important;color:#8b2017!important}\n@media(max-width:360px){.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .reason-pills,.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .insert-reason-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}\n`;
  fs.writeFileSync(cssPath,css);
}

const VERSION='110.2.3',BUILD='v110203-motive-override-chips';
for(const p of ['release-version.json','public/app-version.json']){
  const meta=JSON.parse(fs.readFileSync(p,'utf8'));
  meta.version=VERSION; meta.build=BUILD; meta.force=false; meta.sourceCommit=process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null;
  meta.label='Motive-style Logbook override + quick activity chips';
  meta.notes=['Dragging a manual event overrides overlapping manual duty time.','Live and automatic Driving remain protected.','ON DUTY quick activities are always visible and multi-select.'];
  fs.writeFileSync(p,JSON.stringify(meta,null,2)+'\n');
}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=fs.readFileSync(p,'utf8');
  source=source.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);
  fs.writeFileSync(p,source);
}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){
  let source=fs.readFileSync(p,'utf8');
  source=source.replace(/App v110\.2\.2/g,'App v'+VERSION).replace(/APP V110\.2\.2/g,'APP V'+VERSION);
  fs.writeFileSync(p,source);
}
console.log('PASS — Motive-style manual override, protected Driving, visible multi-select quick chips; '+VERSION);
