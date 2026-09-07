import fs from 'node:fs';
import assert from 'node:assert/strict';

function once(text, before, after, label) {
  // Check the old anchor first: a replacement may be a substring of it.
  if (!text.includes(before) && text.includes(after)) return text;
  assert.equal(text.split(before).length, 2, label + ' anchor changed');
  return text.replace(before, after);
}

// Canonical command is applied after every legacy materializer.
fs.copyFileSync('source/src/modules/logbook/overrideContractV11023.js','source/src/modules/logbook/eventEditingV110.js');

const apiPath='source/src/modules/logbook/public-api.js';
let api=fs.readFileSync(apiPath,'utf8');
api=api.replace('projectLogbookEvents, applyLogbookEditorEdit','projectLogbookEvents, previewLogbookEditorOverride, previewLogbookInsertOverride, applyLogbookEditorInsert, isProtectedAutomaticDriving, applyLogbookEditorEdit');
api=api.replace("['eventsByDay','certifyStatus'","['eventsByDay','logbookEditHistoryByDay','certifyStatus'");
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

// Full day snapshot is required for an edit that can change neighboring records.
edit=fs.readFileSync(editPath,'utf8');
edit=once(edit,'  const projectedV110 = projectLogbookEvents',
  '  const initialRowsV11023 = useMemo(() => structuredClone(logbookContext.eventsByDay?.[dayV110] || []), [event.id,dayV110]);\n  const projectedV110 = projectLogbookEvents','day snapshot');
edit=edit.replace('patch:previewPatchV11023,expected:initialRawV110}', 'patch:previewPatchV11023,expected:initialRawV110,expectedRows:initialRowsV11023}');
edit=edit.replace('expected:initialRawV110,patch}', 'expected:initialRawV110,expectedRows:initialRowsV11023,patch}');
edit=edit.replace('JSON.stringify(parseOnDutyNote(initialForm.note).selected)', 'JSON.stringify(selectedReasonsFromForm(initialForm))');
edit=once(edit,'                  key={reason}\n','                  key={reason}\n                  aria-pressed={selectedOnReasons.includes(reason)}\n                  title={reason}\n','edit chip semantics');
// Activities follow Duty Status directly; Location/Notes stay below them.
const locationStart=edit.indexOf('        <EditorLocationFields');
const activityStart=edit.indexOf("        {status === 'ON' && (",locationStart);
const activityEnd=edit.indexOf('        {activityKind && (',activityStart);
assert.ok(locationStart>0 && activityStart>locationStart && activityEnd>activityStart);
const locationBlock=edit.slice(locationStart,activityStart),activityBlock=edit.slice(activityStart,activityEnd);
edit=edit.slice(0,locationStart)+activityBlock+locationBlock+edit.slice(activityEnd);
edit=edit.replace("'Dragging this event replaces overlapping manual duty time. Automatic/live Driving stays protected.'",
  "'This range replaces overlapping manual duty time. Save keeps the original in edit history.'");
fs.writeFileSync(editPath,edit);

insertEditor=fs.readFileSync(insertPath,'utf8');
insertEditor=insertEditor.replace("editorRangeError, projectLogbookEvents }", "editorRangeError, projectLogbookEvents, previewLogbookInsertOverride }");
insertEditor=once(insertEditor,'  const clockV110 = useLogbookClockV110(logbookContext);',`  const clockV110 = useLogbookClockV110(logbookContext);
  const originalRowsV11023 = useMemo(() => structuredClone(logbookContext.eventsByDay?.[logbookContext.activeDay] || []), [logbookContext.activeDay]);`,'insert day snapshot');
insertEditor=once(insertEditor,"  const [insertDraftEvent, setInsertDraftEvent] = useState(() => draftEvent({",`  const [insertDraftEvent, setInsertDraftEvent] = useState(() => draftEvent({
    id:'manual_' + globalThis.crypto.randomUUID(),`,'stable new event ID');
// Same names and note delimiter in both editors. No automatic PTI selection.
insertEditor=insertEditor.replace(/const onReasons = \[[^\n]+\];/,"const onReasons = ['Pre-trip inspection','Fuel','Pickup / Loading','Delivery / Unloading','Drop Off','Drop & Hook','Waiting','Hook Empty / Reposition'];");
insertEditor=insertEditor.replace("return picked.length ? picked : [reasons[0]].filter(Boolean);","return picked;");
insertEditor=insertEditor.replace("return reasons.filter(Boolean).join(' / ');","return reasons.filter(Boolean).join(' · ');");
insertEditor=insertEditor.replace("return reasonListForStatus(status)[0] || statusLabel(status);","return status === 'ON' ? '' : (reasonListForStatus(status)[0] || statusLabel(status));");
insertEditor=insertEditor.replace("(current.length > 1 ? current.filter(item => item !== reason) : current)","current.filter(item => item !== reason)");
insertEditor=once(insertEditor,'              key={reason}\n','              key={reason}\n              aria-pressed={selectedReasons.includes(reason)}\n              title={reason}\n','insert chip semantics');
// This result supplies both preview and Save; the legacy insert normalizer is
// intentionally bypassed only for this explicit manual editor command.
insertEditor=once(insertEditor,'  const previewEvents = rangeErrorV110 ? events : graphEvents();',`  const insertEventV11023 = {...insertDraftEvent,id:insertDraftEvent.id,status:form.status,startMin:fromInput(form.start),endMin:fromInput(form.end),city:form.city,state:form.state,note:form.note,reasons:selectedReasons,description:form.description,lat:form.lat,lng:form.lng,gpsAccuracy:form.gpsAccuracy,locationSource:form.locationSource};
  const insertResultV11023 = rangeErrorV110 ? {ok:false,error:rangeErrorV110} : previewLogbookInsertOverride(logbookContext,{day:logbookContext.activeDay,event:insertEventV11023,expectedRows:originalRowsV11023},clockV110.at);
  const previewEvents = mode === 'insert' ? (insertResultV11023.ok ? projectLogbookEvents({...logbookContext,eventsByDay:{...logbookContext.eventsByDay,[logbookContext.activeDay]:insertResultV11023.events}},logbookContext.activeDay,clockV110.at) : [...events,{...insertEventV11023,isDraft:true}]) : events;`,'insert shared preview');
insertEditor=once(insertEditor,"      createFn?.(payload);",`      if (!insertResultV11023.ok) return;
      const accepted=createFn?.({__logbookInsertV11023:true,day:logbookContext.activeDay,expectedRows:originalRowsV11023,event:{...payload,id:insertDraftEvent.id,note:form.note || statusLabel(form.status),reasons:selectedReasons}});
      if (accepted !== false) onClose();`,'insert exact command');
insertEditor=insertEditor.replace('disabled={!!rangeErrorV110}',"disabled={!!rangeErrorV110 || (mode === 'insert' && !insertResultV11023.ok)}");
insertEditor=insertEditor.replace('{rangeErrorV110 && <p role="alert" className="editor-error-v110">{rangeErrorV110}</p>}',`{(rangeErrorV110 || (mode === 'insert' && !insertResultV11023.ok)) && <p role="alert" className="editor-error-v110">{rangeErrorV110 || insertResultV11023.error}</p>}`);
fs.writeFileSync(insertPath,insertEditor);

app=fs.readFileSync(appPath,'utf8');
app=app.replace('import { applyLogbookEditorEdit }', 'import { applyLogbookEditorEdit, applyLogbookEditorInsert }');
app=app.replace('patch:patch.patch,expected:patch.expected}', 'patch:patch.patch,expected:patch.expected,expectedRows:patch.expectedRows}');
app=once(app,'  function addEvent(eventOrEvents) {',`  function addEvent(eventOrEvents) {
    // Explicit Insert uses the same protected interval command as its preview.
    if(eventOrEvents?.__logbookInsertV11023) {
      const command={day:eventOrEvents.day,event:eventOrEvents.event,expectedRows:eventOrEvents.expectedRows};
      const checked=applyLogbookEditorInsert(state,command);
      if(!checked.ok){window.alert(checked.error);return false;}
      const acceptedInspection=maybeAcceptInspectionForEvent(state,command.day,command.event);
      setState(current=>{
        const result=applyLogbookEditorInsert(current,command);
        if(!result.ok)return current;
        const next=withAcceptedPreTripInspection(result.state,command.day,command.event,acceptedInspection);
        return markDayRecert(reconcilePreTripInspections(next,[command.day]),command.day);
      });
      return true;
    }`,'insert App command');
fs.writeFileSync(appPath,app);
// UI refinement affects only the requested editor. 44px touch targets and a
// compact three-column grid; text stays readable at 320px and under WebKit.
css=fs.readFileSync(cssPath,'utf8');
css+=`\n/* REVIEWED_QUICK_CHIPS_V11023 */
.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .form-label-row{display:none!important}
.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .reason-pills button,.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .insert-reason-grid button{min-height:44px!important;font-size:12px!important;letter-spacing:0!important;border-radius:10px!important;padding:6px 5px!important;font-weight:600!important}
.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .reason-pills,.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .insert-reason-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important}
.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .drop-hook-note{font-size:11px!important;line-height:1.35!important;padding:5px 0!important;margin:0!important;color:#526278!important;background:transparent!important;border:0!important}
.editor-ui-v110.editor-compact-v111 .quick-activities-head-v11023{margin-bottom:6px!important}
.editor-ui-v110.editor-compact-v111 .quick-activities-v11023 .insert-section-title{font-size:12px!important;margin:0 0 6px!important;color:#334155!important}
`;
fs.writeFileSync(cssPath,css);
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
