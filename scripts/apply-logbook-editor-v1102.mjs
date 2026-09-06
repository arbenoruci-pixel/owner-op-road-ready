import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
function once(src,before,after,label){if(src.includes(after))return src;if(src.split(before).length!==2)throw new Error('Logbook editor anchor changed: '+label);return src.replace(before,after);}
function block(src,start,end,replacement,label){const a=src.indexOf(start),b=src.indexOf(end,a);if(a<0||b<0||src.indexOf(start,a+start.length)>=0)throw new Error('Logbook editor block changed: '+label);return src.slice(0,a)+replacement+src.slice(b);}
const write=(p,s)=>fs.writeFileSync(p,s);
fs.copyFileSync('source/src/modules/graph/LogGraphV1102.jsx','source/src/modules/graph/LogGraph.jsx');
fs.copyFileSync('source/src/modules/editor/components/EditorTimeControlsV1102.jsx','source/src/modules/editor/components/EditorTimeControls.jsx');
let editor=read('source/src/modules/editor/EditEventSheet.jsx');
if(!editor.includes('// LOGBOOK_EDITOR_V1102')){
 editor="// LOGBOOK_EDITOR_V1102\nimport { editorInput, editorMinute, editorRange, eventView, liveEventId, sparseEditorPatch, applyEditorPatch, timelineRelations } from '../../shared/utils/logbookEditorTimeV1102.js';\nimport { getHomeTerminalTimeZone, homeTerminalMinute } from '../../core/time/homeTerminalTime.js';\n"+editor;
 editor=editor.replace("import { applyPatchWithNeighbors } from '../../core/timeline/timelineEngine.js';\n",'');
 editor=once(editor,'start:toInput(event.startMin),','start:editorInput(event.startMin),','initial start');
 editor=once(editor,'end:toInput(event.endMin),','end:editorInput(event.endMin),','initial end');
 editor=once(editor,'export default function EditEventSheet({ event, events, onClose, onSave, onDelete, onSwitch }) {',`export default function EditEventSheet({ event, events, logContext = {}, onClose, onSave, onDelete, onSwitch, onEndCurrent }) {
  const day = logContext.activeDay;
  const [clock, setClock] = useState(() => Date.now());
  const now = new Date(clock), timeZone = getHomeTerminalTimeZone(logContext);
  const live = liveEventId(logContext, day, now) === event.id;
  const original = useMemo(() => ({ day, event:structuredClone((logContext.eventsByDay?.[day] || []).find(e => e.id === event.id) || event) }), [event.id, day]);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    const visible = () => { if (!document.hidden) tick(); };
    const timer = window.setInterval(tick, 10000);
    window.addEventListener('focus', tick); document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', visible); };
  }, []);`,'editor props and clock');
 editor=once(editor,'  const activityKind = loadActivityKind(status, note, description);',`  const range = editorRange(start, end, { live, storedStart:event.startMin, nowMinute:homeTerminalMinute(now, timeZone) });
  const timeChanged = !live && (start !== initialForm.start || end !== initialForm.end);
  const activityKind = loadActivityKind(status, note, description);`,'range model');
 editor=once(editor,'startMin:fromInput(start),\n    endMin:Math.max(fromInput(start) + 5, fromInput(end)),','startMin:range.startMin,\n    endMin:range.endMin,','exact range');
 editor=once(editor,'  const previewEvents = applyPatchWithNeighbors(events, event.id, preview);',`  const baseView = eventView(logContext, day, now, events);
  const previewEvents = range.valid ? baseView.map(e => e.id === event.id ? { ...e, ...preview, uiLive:live } : e) : baseView;`,'read only exact preview');
 editor=once(editor,'const durationMinutes = Math.max(0, preview.endMin - preview.startMin);','const durationMinutes = range.duration ?? 0;','duration');
 editor=once(editor,'const header = `${DUTY_SHORT_LABELS[status]} · ${timeLabel(fromInput(start))} - ${timeLabel(preview.endMin)}`;','const header = `${DUTY_SHORT_LABELS[status]} · ${timeLabel(range.startMin, true)} – ${live ? \'Now\' : timeLabel(range.endMin, true)}`;','header');
 editor=block(editor,'  function save() {','\n  return (',`  function save() {
    if (!range.valid || gpsPending) return;
    const current = { status, city, state, description, note, lat, lng, gpsAccuracy, locationSource };
    const patch = sparseEditorPatch(initialForm, current);
    if (timeChanged) {
      if (start !== initialForm.start) patch.startMin = range.startMin;
      if (end !== initialForm.end) patch.endMin = range.endMin;
    }
    if (JSON.stringify(selectedOnReasons) !== JSON.stringify(selectedReasonsFromForm(initialForm))) patch.reasons = status === 'ON' ? selectedOnReasons : [];
    if (shippingDocs !== initialForm.shippingDocs) {
      Object.assign(patch, { shippingDocs:shippingDocs.trim(), loadNo:shippingDocs.trim(), bol:shippingDocs.trim(), loadDetailsExplicit:true, shippingDocsUpdatedAt:Date.now() });
    }
    if (destination !== initialForm.destination) {
      const parts = parseCityState(destination, initialForm.destinationState || '');
      Object.assign(patch, { destination:cityStateText(parts.city, parts.state), destinationState:parts.state, loadDetailsExplicit:true });
    }
    if (!Object.keys(patch).length) { onClose(); return; }
    try {
      const changed = applyEditorPatch(events, event.id, patch, { liveId:live ? event.id : null });
      if (timeChanged && JSON.stringify(timelineRelations(changed)) !== JSON.stringify(timelineRelations(events)) && timelineRelations(changed).length) {
        if (!window.confirm('This exact time edit leaves a gap or overlap. Only the selected event will change. Save this range?')) return;
      }
      if (onSave(patch, original) !== false) onClose();
    } catch (error) { window.alert(error.message); }
  }
`,'save exact sparse fields');
 editor=once(editor,'className="sheet active editor-clean-v85"','className="sheet active editor-clean-v85 editor-v1102"','scope');
 editor=once(editor,'<button onClick={onDelete}>⋮</button>','<button onClick={onDelete} disabled={live} aria-label="Delete event">⋮</button>','live delete guard');
 editor=once(editor,'      <EditorDutyStatusControls status={status} onChange={changeStatus} />',`      {live ? <div className="editor-live-notice"><strong>{DUTY_SHORT_LABELS[status]} · Now</strong><div>This status is running. Saving a note or location keeps its recorded times and live status.</div><button type="button" onClick={() => { if (!dirty || window.confirm('Discard unsaved edits and open Change current status?')) onEndCurrent?.(); }}>Change current status</button></div> : <EditorDutyStatusControls status={status} onChange={changeStatus} />}
      <div className="editor-timezone">{day} · Home terminal time: {timeZone}. Historical minutes remain unchanged.</div>`,'live notice');
 editor=once(editor,"onEditTime={(edge, m) => edge === 'start' ? setStart(toInput(m)) : setEnd(toInput(m))}","onEditTime={live ? undefined : (edge, m) => edge === 'start' ? setStart(editorInput(m)) : setEnd(editorInput(m))}",'handles');
 editor=once(editor,'<b>{durLabel(durationMinutes)}</b>','<b>{range.valid ? durLabel(durationMinutes) : \'Invalid range\'}</b>','valid duration');
 editor=once(editor,'<em>{timeLabel(preview.startMin, true)} – {timeLabel(preview.endMin, true)}</em>','<em>{range.valid ? `${timeLabel(range.startMin, true)} – ${live ? \'Now · \' : \'\'}${timeLabel(range.endMin, true)}` : \'Check Start and End\'}</em>','range preview');
 editor=once(editor,'<EditorTimeControls start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />',`<EditorTimeControls start={live ? editorInput(range.startMin) : start} end={live ? editorInput(range.endMin) : end} live={live} onStartChange={setStart} onEndChange={setEnd} />
        {!range.valid && <div className="editor-range-error" role="alert">{range.error}</div>}
        {timeChanged && range.valid && <div className="editor-range-help">Only this event will change. The graph keeps actual gaps and overlaps visible.</div>}`,'time controls');
 editor=once(editor,'        <div className="edit-sticky-save"><button className="save-main" onClick={save} disabled={gpsPending}>{gpsPending ? \'Locking GPS…\' : \'Save\'}</button></div>\n\n        <EditorNotesField note={note} onNoteChange={setNote} />',`        <EditorNotesField note={note} onNoteChange={setNote} />
        <div className="edit-sticky-save"><button className="save-main" onClick={save} disabled={gpsPending || !range.valid || !dirty}>{gpsPending ? 'Locking GPS…' : 'Save'}</button></div>`,'save after notes');
 write('source/src/modules/editor/EditEventSheet.jsx',editor);
}
let fields=read('source/src/modules/editor/components/EditorLocationFields.jsx');
fields=once(fields,'    onLocationChange(parsed.city, parsed.state);','    if (parsed.city !== city || parsed.state !== state) onLocationChange(parsed.city, parsed.state);','focus blur no mutation');
fields=once(fields,'          value={draft}','          aria-label="Location"\n          value={draft}','location label');
fields=once(fields,'          className="desc-v85"','          aria-label="Description"\n          className="desc-v85"','description label');
write('source/src/modules/editor/components/EditorLocationFields.jsx',fields);
let app=read('source/src/app/App.jsx');
if(!app.includes('// LOGBOOK_EDITOR_COMMAND_V1102')){
 app=once(app,"import { runExternalCommand, preserveRecordedDays, readLogbookDayState, applyDayFormEdit } from '../modules/logbook/public-api.js';",`import { runExternalCommand, preserveRecordedDays, readLogbookDayState, applyDayFormEdit } from '../modules/logbook/public-api.js';
import { applyEditorPatch, liveEventId, recordedEvents } from '../shared/utils/logbookEditorTimeV1102.js';`,'App helper import');
 app=once(app,'  function updateEvent(id, patch) {',`  function updateEvent(id, patch, expected = null) {
    // LOGBOOK_EDITOR_COMMAND_V1102: explicit editor command, exact raw event.
    // Existing non-editor workflows keep their own established contracts.
    if (expected) {
      const day = expected.day;
      const before = state.eventsByDay?.[day]?.find(e => e.id === id);
      if (!before || JSON.stringify(before) !== JSON.stringify(expected.event)) {
        window.alert('This event changed while Edit was open. Cancel and reopen to review the latest record.');
        return false;
      }
      try { applyEditorPatch(state.eventsByDay[day], id, patch, { liveId:liveEventId(state, day) }); }
      catch (error) { window.alert(error.message); return false; }
      setState(s => {
        const actual = s.eventsByDay?.[day]?.find(e => e.id === id);
        if (JSON.stringify(actual) !== JSON.stringify(expected.event)) return s;
        let rows;
        try { rows = applyEditorPatch(s.eventsByDay[day], id, patch, { liveId:liveEventId(s, day) }); }
        catch { return s; }
        if (rows === s.eventsByDay[day]) return s;
        const eventsByDay = { ...s.eventsByDay, [day]:rows };
        return markDayRecert({ ...s, eventsByDay, sheet:null, selectedEventId:null }, day);
      });
      return true;
    }`,'exact editor command');
 app=once(app,'<EditEventSheet event={selectedEvent} events={events}',"<EditEventSheet key={state.activeDay + ':' + selectedEvent.id} event={selectedEvent} events={recordedEvents(state.eventsByDay?.[state.activeDay] || [])} logContext={state} onEndCurrent={()=>setState(s=>({...s,selectedEventId:null,sheet:{type:'status'}}))}",'edit context');
 app=once(app,'onSave={(patch)=>updateEvent(selectedEvent.id, patch)}','onSave={(patch,expected)=>updateEvent(selectedEvent.id,patch,expected)}','save baseline');
 app=once(app,'<InsertEditEventSheet defaults={state.sheet.defaults} events={events}',"<InsertEditEventSheet defaults={state.sheet.defaults} events={recordedEvents(state.eventsByDay?.[state.activeDay] || [])} logContext={state} onEditExisting={id=>setState(s=>({...s,selectedEventId:id,sheet:{type:'edit',id}}))}",'insert shared edit');
 write('source/src/app/App.jsx',app);
}
let insert=read('source/src/modules/editor/InsertEditEventSheet.jsx');
if(!insert.includes('// INSERT_EDITOR_V1102')){
 insert="// INSERT_EDITOR_V1102\nimport { editorInput, editorMinute, editorRange } from '../../shared/utils/logbookEditorTimeV1102.js';\nimport { getHomeTerminalTimeZone } from '../../core/time/homeTerminalTime.js';\n"+insert;
 insert=once(insert,'export default function AddStatusSheet({ defaults = {}, events, onClose, onSave, onCreate, onUpdate }) {','export default function AddStatusSheet({ defaults = {}, events, logContext = {}, onEditExisting, onClose, onSave, onCreate, onUpdate }) {','insert context');
 insert=once(insert,'  return Math.max(start + 5, Math.min(1439, Number(end || start + 15)));','  return Number(end);','no hidden minimum');
 insert=insert.replaceAll('toInput(', 'editorInput(').replaceAll('fromInput(', 'editorMinute(');
 insert=insert.replaceAll('editorMinute(form.end)', "editorMinute(form.end, 'end')").replaceAll('editorMinute(next.end)', "editorMinute(next.end, 'end')");
 insert=insert.replace(/Math\.min\(1439, (defaultStart|start|s|startMin) \+ (15|minutes)\)/g,'Math.min(1440, $1 + $2)').replaceAll('editorInput(1439)','editorInput(1440)').replaceAll('endMin: 1439','endMin: 1440');
 insert=once(insert,"    if (edge === 'start') s = Math.min(minute, e - 5);\n    if (edge === 'end') e = Math.max(minute, s + 5);","    if (edge === 'start') s = minute;\n    if (edge === 'end') e = minute;",'exact insert handles');
 insert=once(insert,"  const defaultStart = defaults.startMin ?? safeDefaultStart(events);","  useEffect(() => { if (defaults.selectedEventId) onEditExisting?.(defaults.selectedEventId); }, [defaults.selectedEventId]);\n  const defaultStart = defaults.startMin ?? safeDefaultStart(events);",'delegate initially selected event');
 insert=once(insert,'<button className="save-main" onClick={save}>','<button className="save-main" onClick={save} disabled={!editorRange(form.start, form.end).valid}>','disable invalid insert');
 insert=once(insert,'  function selectEvent(id) {','  function selectEvent(id) {\n    if (onEditExisting) { onEditExisting(id); return; }','shared existing editor');
 insert=once(insert,'  function graphEvents() {',"  function graphEvents() {\n    if (!editorRange(form.start, form.end).valid) return events;",'invalid preview');
 insert=once(insert,'  function save() {',"  function save() {\n    if (!editorRange(form.start, form.end).valid) return;",'invalid save');
 insert=once(insert,'className="sheet active v30-insert editor-clean-v85"','className="sheet active v30-insert editor-clean-v85 editor-v1102"','insert scope');
 insert=once(insert,'      <EditorDutyStatusControls\n',`      <div className="editor-timezone">{logContext.activeDay} · Home terminal time: {getHomeTerminalTimeZone(logContext)}</div>
      {!editorRange(form.start, form.end).valid && <div className="editor-range-error" role="alert">{editorRange(form.start, form.end).error}</div>}
      <EditorDutyStatusControls\n`,'insert zone and validation');
 write('source/src/modules/editor/InsertEditEventSheet.jsx',insert);
}
let day=read('source/src/modules/logbook/DayLogScreen.jsx');
if(!day.includes('// LOGBOOK_DISPLAY_V1102')){
 day="// LOGBOOK_DISPLAY_V1102\nimport { eventView, timelineRelations } from '../../shared/utils/logbookEditorTimeV1102.js';\n"+day;
 day=once(day,"    () => (isMoving ? displayEventsForDay(previewRawEvents, isToday(state.activeDay), { nowMinute:liveMinuteV1036 }) : displayEvents),\n    [isMoving, previewRawEvents, state.activeDay, displayEvents, liveMinuteV1036]", "    () => eventView(state, state.activeDay, new Date(), previewRawEvents),\n    [previewRawEvents, state.activeDay, state.currentStatus, state.manualDrivingSession, state.gpsTrip, state.homeTerminalTimeZone, liveMinuteV1036]",'raw UI graph');
 day=once(day,'? displayEventsForDay(bulkShiftResult.events, isToday(state.activeDay), { nowMinute:liveMinuteV1036 })','? eventView(state, state.activeDay, new Date(), bulkShiftResult.events)','raw bulk preview');
 day=once(day,'    window.setTimeout(() => onOpenEdit?.(eventId), 0);','    // Selection stays linked to the trace; Edit is an explicit second action.','graph selection');
 day=once(day,'className={`screen active graph-first-screen ${moveOpen ? "inline-moving" : ""}`}','className={`screen active graph-first-screen logbook-v1102 ${moveOpen ? "inline-moving" : ""}`}','day scope');
 day=once(day,"      {activeTab === 'form' && <MiniFormPanel",`      {activeTab === 'log' && selectedPreviewEvent && !state.selectMode && <div className="selected-link-v1102" data-selected-link={selectedPreviewEvent.id}><div><strong>{selectedPreviewEvent.status}{selectedPreviewEvent.uiLive ? ' · Now' : ''}</strong><div>{timeLabel(selectedPreviewEvent.startMin, true)} – {selectedPreviewEvent.uiLive ? 'Now' : timeLabel(selectedPreviewEvent.endMin, true)} · {durLabel(selectedPreviewEvent.endMin - selectedPreviewEvent.startMin)}</div></div><button type="button" onClick={() => onOpenEdit(selectedPreviewEvent.id)}>Edit selected</button></div>}
      {activeTab === 'log' && timelineRelations(bulkPreviewEvents).length > 0 && <div className="timeline-review-v1102">{timelineRelations(bulkPreviewEvents).map(r => r.type === 'gap' ? 'Gap' : 'Overlap').filter((v,i,a)=>a.indexOf(v)===i).join(' / ')} in recorded events. Times are shown exactly; review before certification.</div>}

      {activeTab === 'form' && <MiniFormPanel`,'selection link');
 write('source/src/modules/logbook/DayLogScreen.jsx',day);
}
let list=read('source/src/modules/logbook/EventList.jsx');
list=once(list,'            key={event.id}','            key={event.id}\n            data-event-row={event.id}','row selector');
list=once(list,'<span>{timeLabel(event.startMin, true)} · {durLabel(event.endMin - event.startMin)}</span>',"<span className=\"event-time-v1102\">{timeLabel(event.startMin, true)} – {event.uiLive ? 'Now' : timeLabel(event.endMin, true)} · {durLabel(event.endMin - event.startMin)}</span>",'list exact range');
write('source/src/modules/logbook/EventList.jsx',list);
let layout=read('app/layout.jsx');
if(!layout.includes("import '../source/src/modules/editor/logbook-v1102.css';"))layout="import '../source/src/modules/editor/logbook-v1102.css';\n"+layout;
// CSS is intentionally last so generated legacy selectors cannot override it.
layout=layout.replace("import '../source/src/modules/editor/logbook-v1102.css';\n",'').replace(/(import [^\n]+;\n)(?![\s\S]*import [^\n]+;\n)/,'$1'+"import '../source/src/modules/editor/logbook-v1102.css';\n");
write('app/layout.jsx',layout);
const VERSION='110.2.0',BUILD='v110200-logbook-editor';
write('release-version.json',JSON.stringify({version:VERSION,build:BUILD,label:'Exact Logbook editor and joined duty graph'},null,2)+'\n');
const meta=JSON.parse(read('public/app-version.json'));
write('public/app-version.json',JSON.stringify({...meta,version:VERSION,build:BUILD,label:'Logbook editor',force:false,notes:['Exact event ranges and explicit live-status changes.','Connected duty traces retain real gaps and overlaps.','Historical certification and module boundaries preserved.']},null,2)+'\n');
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const [suffix,value] of [['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${suffix}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${suffix} = '${value}';`);write(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])write(p,read(p).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
console.log('PASS — exact Logbook editor, live-state guard, scoped contrast and joined SVG materialized');
