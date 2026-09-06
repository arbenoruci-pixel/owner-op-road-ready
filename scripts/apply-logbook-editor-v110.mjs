import fs from 'node:fs';
const read = p => fs.readFileSync(p,'utf8');
function change(path,fn) { const before=read(path),after=fn(before);fs.writeFileSync(path,after); }
function once(text,from,to) { if(text.split(from).length!==2)throw Error('Logbook editor anchor changed: '+from.slice(0,110));return text.replace(from,to); }
const api='source/src/modules/logbook/public-api.js';
change(api,s=>s.includes("from './eventEditingV110.js'")?s:s+"\nexport { editorTimeInput, editorMinute, editorRangeError, logbookClock, projectLogbookEvents, applyLogbookEditorEdit } from './eventEditingV110.js';\n");
// The legacy materializers run first. These entrypoints choose the reviewed final renderer.
fs.writeFileSync('source/src/modules/graph/LogGraph.jsx',"export { default } from './LogGraphV110.jsx';\n");
fs.writeFileSync('source/src/modules/editor/components/EditorTimeControls.jsx',"export { default } from './EditorTimeControlsV110.jsx';\n");
const dayPath='source/src/modules/logbook/DayLogScreen.jsx';
change(dayPath,s=>{
 if(s.includes('// EXACT_LOGBOOK_VIEW_V110'))return s;
 s=once(s,"import EventList from './EventList.jsx';","import EventList from './EventList.jsx';\nimport { projectLogbookEvents } from './eventEditingV110.js';\nimport { useLogbookClockV110 } from '../../shared/utils/useLogbookClockV110.js';");
 const start=s.indexOf('  const [liveMinuteV1036, setLiveMinuteV1036]');
 const end=s.indexOf('\n  useEffect(() => {\n    const requested',start);
 if(start<0||end<0)throw Error('Day clock anchor changed');
 s=s.slice(0,start)+`  // EXACT_LOGBOOK_VIEW_V110: a read-only clock never repairs stored events.
  const clockV110 = useLogbookClockV110(state);
  const liveMinuteV1036 = clockV110.minute;
`+s.slice(end);
 s=once(s,'  const displaySelectedEvent = displayEvents.find(event => event.id === state.selectedEventId) || selectedEvent || null;',`  const exactViewEventsV110 = useMemo(() => projectLogbookEvents(state, state.activeDay, clockV110.at), [state.eventsByDay, state.activeDay, state.currentStatus, state.manualDrivingSession, state.gpsTrip, state.certifyStatus, clockV110.at]);
  const displaySelectedEvent = exactViewEventsV110.find(event => event.id === state.selectedEventId) || selectedEvent || null;`);
 s=once(s,'() => (isMoving ? displayEventsForDay(previewRawEvents, isToday(state.activeDay), { nowMinute:liveMinuteV1036 }) : displayEvents),\n    [isMoving, previewRawEvents, state.activeDay, displayEvents, liveMinuteV1036]',`() => (isMoving ? projectLogbookEvents({...state, eventsByDay:{...state.eventsByDay,[state.activeDay]:previewRawEvents}}, state.activeDay, clockV110.at) : exactViewEventsV110),
    [isMoving, previewRawEvents, state.activeDay, exactViewEventsV110, clockV110.at]`);
 s=once(s,'? displayEventsForDay(bulkShiftResult.events, isToday(state.activeDay), { nowMinute:liveMinuteV1036 })','? projectLogbookEvents({...state,eventsByDay:{...state.eventsByDay,[state.activeDay]:bulkShiftResult.events}}, state.activeDay, clockV110.at)');
 s=once(s,'screen active graph-first-screen ${moveOpen','screen active graph-first-screen logbook-ui-v110 ${moveOpen');
 return s;
});
const editPath='source/src/modules/editor/EditEventSheet.jsx';
change(editPath,s=>{
 if(s.includes('// EXACT_EDITOR_DRAFT_V110'))return s;
 s=once(s,"import { durLabel, fromInput, toInput, timeLabel } from '../../shared/utils/time.js';",`import { durLabel, timeLabel } from '../../shared/utils/time.js';
import { editorMinute as fromInput, editorTimeInput as toInput, editorRangeError, projectLogbookEvents } from '../logbook/public-api.js';
import { useLogbookClockV110 } from '../../shared/utils/useLogbookClockV110.js';`);
 s=once(s,"import { applyPatchWithNeighbors } from '../../core/timeline/timelineEngine.js';\n",'');
 s=once(s,'function EditEventSheet({ event, events, onClose, onSave, onDelete, onSwitch })','function EditEventSheet({ event, events, logbookContext = {}, onClose, onSave, onDelete, onSwitch, onEndLive })');
 s=once(s,'  const initialForm = useMemo(() => formStateFromEvent(event), [event.id]);',`  // EXACT_EDITOR_DRAFT_V110: raw snapshot, draft and derived Now remain separate.
  const dayV110 = logbookContext.activeDay;
  const clockV110 = useLogbookClockV110(logbookContext);
  const initialRawV110 = useMemo(() => structuredClone((logbookContext.eventsByDay?.[dayV110] || []).find(e => e.id === event.id) || event), [event.id, dayV110]);
  const projectedV110 = projectLogbookEvents(logbookContext, dayV110, clockV110.at);
  const liveV110 = !!projectedV110.find(e => e.id === event.id)?.isLive;
  const initialForm = useMemo(() => formStateFromEvent(event), [event.id, dayV110]);`);
 s=once(s,'endMin:Math.max(fromInput(start) + 5, fromInput(end)),','endMin:liveV110 ? clockV110.minute : fromInput(end),');
 s=once(s,'  const previewEvents = applyPatchWithNeighbors(events, event.id, preview);',`  const rangeErrorV110 = editorRangeError(preview.startMin, preview.endMin, liveV110);
  const previewEvents = (projectedV110.length ? projectedV110 : events).map(e => e.id === event.id && !rangeErrorV110 ? {...preview,isLive:liveV110} : e);`);
 s=once(s,'const durationMinutes = Math.max(0, preview.endMin - preview.startMin);','const durationMinutes = rangeErrorV110 ? 0 : Math.max(0, preview.endMin - preview.startMin);');
 const start=s.indexOf('  function save() {'),end=s.indexOf('\n  return (',start);
 if(start<0||end<0)throw Error('Editor save anchor changed');
 s=s.slice(0,start)+`  function save() {
    if (rangeErrorV110 || gpsPending) return;
    const patch = {};
    const put = (key,value,initial) => { if (JSON.stringify(value ?? null) !== JSON.stringify(initial ?? null)) patch[key] = value; };
    if (!liveV110) {
      put('status',status,initialForm.status);
      put('startMin',preview.startMin,fromInput(initialForm.start));
      put('endMin',preview.endMin,fromInput(initialForm.end));
    }
    for (const [key,value] of Object.entries({city,state,description,note,lat,lng,gpsAccuracy,locationSource})) put(key,value,initialForm[key]);
    if (status !== initialForm.status || JSON.stringify(selectedOnReasons) !== JSON.stringify(parseOnDutyNote(initialForm.note).selected)) {
      put('reasons',status === 'ON' ? selectedOnReasons : [],initialRawV110.reasons);
    }
    if (shippingDocs !== initialForm.shippingDocs || destination !== initialForm.destination) {
      const goingTo = parseCityState(destination,initialForm.destinationState || '');
      patch.shippingDocs = shippingDocs.trim(); patch.loadNo = shippingDocs.trim(); patch.bol = shippingDocs.trim();
      patch.destination = cityStateText(goingTo.city,goingTo.state); patch.destinationState = goingTo.state;
      patch.loadDetailsExplicit = true;
    }
    const accepted = onSave({__logbookEditorV110:true,day:dayV110,expected:initialRawV110,patch});
    if (accepted !== false) onClose();
  }

  function changeLiveStatusV110() {
    if (dirty && !window.confirm('Discard unsaved details and change current status?')) return;
    onEndLive?.();
  }
`+s.slice(end);
 s=once(s,'className="sheet active editor-clean-v85"','className="sheet active editor-clean-v85 editor-ui-v110"');
 s=once(s,'<EditorDutyStatusControls status={status} onChange={changeStatus} />',`{liveV110 ? <div className="editor-live-heading-v110"><strong>{DUTY_SHORT_LABELS[status]} <span>LIVE</span></strong><button type="button" onClick={changeLiveStatusV110}>Change status</button></div> : <EditorDutyStatusControls status={status} onChange={changeStatus} />}`);
 s=once(s,"onEditTime={(edge, m) => edge === 'start' ? setStart(toInput(m)) : setEnd(toInput(m))}","onEditTime={liveV110 ? undefined : (edge, m) => edge === 'start' ? setStart(toInput(Math.min(1439,m))) : setEnd(toInput(m))}");
 s=once(s,'<span>Selected event time</span>','<span>{liveV110 ? \'Current event · Now\' : \'Selected event time\'}</span>');
 s=once(s,'<b>{durLabel(durationMinutes)}</b>','<b>{rangeErrorV110 ? \'Check times\' : durLabel(durationMinutes)}</b>');
 s=once(s,'<em>{timeLabel(preview.startMin, true)} – {timeLabel(preview.endMin, true)}</em>',`<em>{timeLabel(preview.startMin, true)} – {liveV110 ? 'Now · ' : ''}{timeLabel(preview.endMin, true)}{!liveV110 && preview.endMin === 1440 ? ' (next day)' : ''}</em>`);
 s=once(s,'<EditorTimeControls start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />',`<EditorTimeControls start={start} end={liveV110 ? toInput(clockV110.minute) : end} onStartChange={setStart} onEndChange={setEnd} live={liveV110} timeZone={clockV110.timeZone} />
        {rangeErrorV110 && <p role="alert" className="editor-error-v110">{rangeErrorV110}</p>}
        {!liveV110 && <p className="editor-help-v110">Only this event changes. Check the graph for gaps or overlaps before saving.</p>}`);
 s=once(s,'        <div className="edit-sticky-save"><button className="save-main" onClick={save} disabled={gpsPending}>{gpsPending ? \'Locking GPS…\' : \'Save\'}</button></div>\n\n','');
 s=once(s,'        <EditorNotesField note={note} onNoteChange={setNote} />',`        <EditorNotesField note={note} onNoteChange={setNote} />
        <div className="edit-sticky-save"><button className="save-main" onClick={save} disabled={gpsPending || !!rangeErrorV110 || !dirty}>{gpsPending ? 'Locking GPS…' : liveV110 ? 'Save details' : 'Save'}</button></div>`);
 return s;
});
change('source/src/modules/editor/InsertEditEventSheet.jsx',s=>{
 if(s.includes('// INSERT_TIME_CONTRACT_V110'))return s;
 s=once(s,"import { fromInput, nowMin, timeLabel, toInput } from '../../shared/utils/time.js';",`// INSERT_TIME_CONTRACT_V110
import { nowMin, timeLabel } from '../../shared/utils/time.js';
import { editorMinute as fromInput, editorTimeInput as toInput, editorRangeError, projectLogbookEvents } from '../logbook/public-api.js';
import { useLogbookClockV110 } from '../../shared/utils/useLogbookClockV110.js';
import EditEventSheet from './EditEventSheet.jsx';`);
 s=once(s,'function AddStatusSheet({ defaults = {}, events, onClose, onSave, onCreate, onUpdate })','function AddStatusSheet({ defaults = {}, events, logbookContext = {}, onClose, onSave, onCreate, onUpdate, onDelete, onEndLive })');
 s=once(s,'function safeDefaultStart(events = []) {\n  const now = Math.max(0, Math.min(1439, nowMin()));','function safeDefaultStart(events = [], currentMinute = nowMin()) {\n  const now = Math.max(0, Math.min(1439, currentMinute));');
 s=once(s,'  const defaultStart = defaults.startMin ?? safeDefaultStart(events);',`  const clockV110 = useLogbookClockV110(logbookContext);
  events = projectLogbookEvents(logbookContext,logbookContext.activeDay,clockV110.at);
  const defaultStart = defaults.startMin ?? safeDefaultStart(events,clockV110.minute);`);
 const componentStart=s.indexOf('export default function AddStatusSheet(');
 s=s.slice(0,componentStart)+s.slice(componentStart).replaceAll('nowMin()','clockV110.minute');
 s=once(s,'return Math.max(start + 5, Math.min(1439, Number(end || start + 15)));','return Number(end ?? Math.min(1440,start + 15));');
 s=s.replaceAll('Math.min(1439, defaultStart + 15)','Math.min(1440, defaultStart + 15)').replaceAll('Math.min(1439, start + 15)','Math.min(1440, start + 15)').replaceAll('Math.min(1439, startMin + 15)','Math.min(1440, startMin + 15)').replaceAll('Math.min(1439, s + 15)','Math.min(1440, s + 15)').replaceAll('Math.min(1439, start + minutes)','Math.min(1440, start + minutes)');
 s=once(s,"if (edge === 'start') s = Math.min(minute, e - 5);","if (edge === 'start') s = Math.min(minute, e - 1);");
 s=once(s,"if (edge === 'end') e = Math.max(minute, s + 5);","if (edge === 'end') e = Math.max(minute, s + 1);");
 s=once(s,'  function save() {','  function save() {\n    if (editorRangeError(fromInput(form.start),fromInput(form.end))) return;');
 s=once(s,'  const previewEvents = graphEvents();',`  const rangeErrorV110 = editorRangeError(fromInput(form.start),fromInput(form.end));
  const previewEvents = rangeErrorV110 ? events : graphEvents();`);
 s=once(s,'  return (\n    <div className="sheet active v30-insert editor-clean-v85">',`  if (mode === 'edit' && selectedExisting) return <EditEventSheet key={selectedExisting.id} event={(logbookContext.eventsByDay?.[logbookContext.activeDay] || []).find(e => e.id === selectedExisting.id) || selectedExisting} events={events} logbookContext={logbookContext} onClose={onClose} onSave={patch => onUpdate?.(selectedExisting.id,patch)} onSwitch={selectEvent} onDelete={() => onDelete?.(selectedExisting.id)} onEndLive={onEndLive} />;
  return (
    <div className="sheet active v30-insert editor-clean-v85 editor-ui-v110">`);
 s=once(s,'              start={form.start}','              timeZone={clockV110.timeZone}\n              start={form.start}');
 s=once(s,'            {mode === \'insert\' && (\n              <div className="insert-duration-panel">',`            {rangeErrorV110 && <p role="alert" className="editor-error-v110">{rangeErrorV110}</p>}
            {mode === 'insert' && (
              <div className="insert-duration-panel">`);
 s=once(s,'className="save-main" onClick={save}>{mode','className="save-main" onClick={save} disabled={!!rangeErrorV110}>{mode');
 return s;
});
change('source/src/app/App.jsx',s=>{
 if(s.includes('// LOGBOOK_EDITOR_COMMAND_V110'))return s;
 s=once(s,"import EditEventSheet from '../modules/editor/EditEventSheet.jsx';","import EditEventSheet from '../modules/editor/EditEventSheet.jsx';\nimport { applyLogbookEditorEdit } from '../modules/logbook/public-api.js';");
 s=once(s,'  function updateEvent(id, patch) {',`  function updateEvent(id, patch) {
    // LOGBOOK_EDITOR_COMMAND_V110: explicit target-day command, no startup/continuity repair.
    if (patch?.__logbookEditorV110) {
      const command = {day:patch.day,id,patch:patch.patch,expected:patch.expected};
      const checked = applyLogbookEditorEdit(state,command);
      if (!checked.ok) { window.alert(checked.error); return false; }
      setState(current => {
        const result = applyLogbookEditorEdit(current,command);
        if (!result.ok || !result.changed) return current;
        return markDayRecert(result.state,command.day);
      });
      return true;
    }`);
 s=once(s,'<InsertEditEventSheet defaults={state.sheet.defaults} events={events}',`<InsertEditEventSheet defaults={state.sheet.defaults} events={events} logbookContext={state} onDelete={deleteEvent} onEndLive={()=>setState(s=>({...s,sheet:{type:'status'}}))}`);
 s=once(s,'<EditEventSheet event={selectedEvent} events={events}',`<EditEventSheet key={state.activeDay+selectedEvent.id} event={selectedEvent} events={events} logbookContext={state} onEndLive={()=>setState(s=>({...s,sheet:{type:'status'}}))}`);
 return s;
});
change('source/src/modules/logbook/EventList.jsx',s=>{
 if(s.includes('data-log-event-id'))return s;
 s=once(s,'            key={event.id}','            key={event.id}\n            data-log-event-id={event.id}');
 s=once(s,'{timeLabel(event.startMin, true)} · {durLabel(event.endMin - event.startMin)}',"{timeLabel(event.startMin, true)} – {event.isLive ? 'Now' : timeLabel(event.endMin, true)} · {durLabel(event.endMin - event.startMin)}");
 return s;
});
change('source/src/modules/logbook/SelectedEventBar.jsx',s=>s.includes("event.isLive ? 'Now'")?s:once(s,'{timeLabel(event.endMin, true)}',"{event.isLive ? 'Now' : timeLabel(event.endMin, true)}"));
change('source/src/modules/editor/components/EditorDutyStatusControls.jsx',s=>s.includes('data-status={s}')?s:once(s,'            key={s}','            key={s}\n            data-status={s}'));
change('source/src/modules/editor/components/EditorLocationFields.jsx',s=>s.includes('aria-label="Location"')?s:once(once(s,'          value={draft}','          aria-label="Location"\n          value={draft}'),'          className="desc-v85"','          aria-label="Description"\n          className="desc-v85"'));
const layout=['app/layout.jsx','app/layout.js','app/layout.tsx'].find(p=>fs.existsSync(p));
if(!layout)throw Error('App stylesheet entrypoint missing');
change(layout,s=>s.includes('logbook-editor-v110.css')?s:"import '../source/src/logbook-editor-v110.css';\n"+s);
// Keep the final stylesheet last so scoped light fields win over legacy dark themes.
change(layout,s=>s.replace("import '../source/src/logbook-editor-v110.css';\n",'').replace(/(import [^\n]+;\n)(?![\s\S]*import [^\n]+;\n)/,'$1'+"import '../source/src/logbook-editor-v110.css';\n"));
const VERSION='110.2.0',BUILD='v110200-logbook-editor';
fs.writeFileSync('release-version.json',JSON.stringify({version:VERSION,build:BUILD,label:'Exact Logbook graph and safe live editor'},null,2)+'\n');
const meta=JSON.parse(read('public/app-version.json'));
fs.writeFileSync('public/app-version.json',JSON.stringify({...meta,version:VERSION,build:BUILD,label:'Exact Logbook graph and safe live editor',force:false,notes:['Exact graph joins preserve real gaps and overlaps.','Live status details never close or shorten the active event.','Home-terminal time and 24:00 editing; historical signatures retained.']},null,2)+'\n');
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']])change(path,s=>s.replace(new RegExp(`(const ${name}_VERSION = )['"][^'"]+['"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['"][^'"]+['"]`),`$1'${BUILD}'`));
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])change(p,s=>s.replace(/App v110\.1\.0/g,'App v'+VERSION).replace(/APP V110\.1\.0/g,'APP V'+VERSION));
console.log('Applied exact Logbook editor/graph release '+VERSION+'; no device data, HOS, certification or cloud writes');
