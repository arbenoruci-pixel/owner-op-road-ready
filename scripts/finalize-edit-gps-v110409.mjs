import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const read = file => fs.readFileSync(file,'utf8');
const write = (file,value) => fs.writeFileSync(file,value);
function patch(file,before,after) {
  const source=read(file); if(source.includes(after)) return;
  assert.equal(source.split(before).length-1,1,`v110409 anchor: ${file} ${before.slice(0,80)}`);
  write(file,source.replace(before,after));
}
function range(file,start,end,after) {
  const source=read(file); if(source.includes(after)) return;
  const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
  assert(from>=0 && to>from,`v110409 range: ${file} ${start}`);
  patch(file,source.slice(from,to),after);
}
for(const [input,output] of [
  ['bulkShift.js','core/timeline/bulkShiftV110409.js'],
  ['BulkMovePanel.jsx','modules/logbook/BulkMovePanelV110409.jsx'],
  ['gpsPosition.js','core/gps/gpsPositionV110409.js'],
  ['gpsFeedback.js','core/gps/gpsFeedbackV110409.js'],
  ['useGpsRequest.js','shared/duty/useGpsRequestV110409.js'],
]) {
  const target='source/src/'+output; fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync('scripts/v110409/'+input,target);
}
// Keep styles alongside the component without requiring a CSS loader when
// the existing graph contracts render the actual React tree in Node.
write('source/src/modules/logbook/bulkMoveStylesV110409.js','export default '+JSON.stringify(read('scripts/v110409/bulk-move.css'))+';\n');

const screen='source/src/modules/logbook/DayLogScreen.jsx';
const locks=JSON.parse(read('module-locks.v1.json'));
// Intentional reviewed DayLog UI revision. New pure and Chromium/WebKit tests
// cover preview/cancel/commit/clamp and unchanged other days/drivers/signatures.
if(!read(screen).includes('BulkMovePanelV110409')) assert.equal(createHash('sha256').update(read(screen)).digest('hex'),'0fdbba75ac9d6b9fd2e0c6ed552d1f8931ae7892a6d65da96dbf9ab654ceb872','Expected reviewed v110408 DayLog baseline');
patch(screen,"import { shiftSelectedEventsV101 } from '../../core/timeline/multiEventShiftV101.js';","import { previewBulkShift } from '../../core/timeline/bulkShiftV110409.js';\nimport BulkMovePanelV110409 from './BulkMovePanelV110409.jsx';");
patch(screen,'  const [bulkCommittedDelta, setBulkCommittedDelta] = useState(0);\n  const [bulkMoveStep, setBulkMoveStep] = useState(1);','  const [bulkDraft, setBulkDraft] = useState(null);');
patch(screen,`    setBulkCommittedDelta(0);
  }, [state.activeDay, state.selectMode, (state.selectedIds || []).join(',')]);`,`    setBulkDraft(null);
  }, [state.activeDay, state.activeDriverId, state.selectMode, (state.selectedIds || []).join(',')]);`);
range(screen,'  const bulkShiftResult = useMemo(','  const bulkPreviewEvents = useMemo(',`  const bulkDraftStale = !!bulkDraft && (bulkDraft.day !== state.activeDay || bulkDraft.driver !== (state.activeDriverId || '') || JSON.stringify(bulkDraft.rows) !== JSON.stringify(rawDayEvents));
  const bulkShiftResult = useMemo(() => {
    const result = previewBulkShift(bulkDraft?.rows || rawDayEvents, state.selectedIds || [], bulkMoveDelta, {day:state.activeDay,today:clockV110.day,currentStatus:state.currentStatus,manualDrivingSession:state.manualDrivingSession,gpsTrip:state.gpsTrip});
    return bulkDraftStale ? {...result,appliedDeltaMin:0,events:rawDayEvents,blockedReason:'The day or driver changed. Reset and review the selection again.'} : result;
  }, [rawDayEvents, bulkDraft, bulkDraftStale, (state.selectedIds || []).join(','), bulkMoveDelta, state.activeDay, clockV110.day, state.currentStatus, state.manualDrivingSession, state.gpsTrip]);
`);
range(screen,'  function nudgeSelectedEvents(delta) {','  function adjustMove(delta) {',`  function previewSelectedEvents(delta) {
    if (!delta) { setBulkMoveDelta(0); setBulkDraft(null); return; }
    if (!bulkDraft) setBulkDraft({rows:structuredClone(rawDayEvents),day:state.activeDay,driver:state.activeDriverId || ''});
    setBulkMoveDelta(delta);
  }

  function applySelectedEvents(delta) {
    if (!bulkDraft || bulkDraftStale || !delta) return;
    onQuickShift?.(delta,{day:bulkDraft.day,selectedIds:[...(state.selectedIds || [])],expectedRows:bulkDraft.rows,expectedDriverId:bulkDraft.driver});
    setBulkMoveDelta(0); setBulkDraft(null);
  }

`);
range(screen,'      {activeTab === \'log\' && state.selectMode && (','      {activeTab === \'log\' && (\n        <>',`      {activeTab === 'log' && state.selectMode && (
        <BulkMovePanelV110409 events={bulkDraft?.rows || rawDayEvents} selectedIds={state.selectedIds || []}
          delta={bulkMoveDelta} onDelta={previewSelectedEvents} result={bulkShiftResult}
          onAll={onSelectAll} onClear={()=>{previewSelectedEvents(0);onClearSelection?.();}}
          onCancel={()=>{previewSelectedEvents(0);onToggleSelectMode?.();}} onApply={applySelectedEvents}/>
      )}

`);
const list='source/src/modules/logbook/EventList.jsx';
patch(list,'<input className="event-check" type="checkbox" readOnly checked={checked} />','<input className="event-check" type="checkbox" aria-label={`Select ${label(event.status)} at ${timeLabel(event.startMin)}`} checked={checked} onClick={e=>e.stopPropagation()} onChange={()=>onToggleSelected(event.id)} />');

const app='source/src/app/App.jsx';
patch(app,"import { resolveRawShiftSelectionV101, shiftSelectedEventsV101 } from '../core/timeline/multiEventShiftV101.js';","import { resolveRawShiftSelectionV101 } from '../core/timeline/multiEventShiftV101.js';\nimport { applyBulkShift, shiftRows } from '../core/timeline/bulkShiftV110409.js';");
range(app,'  function applyShift(delta, options = {}) {','  function moveSelectedEventInline(id, delta) {',`  function applyShift(delta, options = {}) {
    setState(s => {
      const today = localDayKey(new Date(), getHomeTerminalTimeZone(s));
      const result = applyBulkShift(s,{...options,delta,today});
      if (!result.ok) {
        window.setTimeout(()=>window.alert?.(result.error),0);
        return s;
      }
      const day=options.day;
      let next={...result.state,sheet:null,selectMode:false,selectedIds:[],selectedEventId:result.changedEventIds[0] || null,
        lastShiftResult:{day,appliedDeltaMin:delta,requestedDeltaMin:delta,changedEventIds:result.changedEventIds,adjustedNeighborIds:result.adjustedNeighborIds,warnings:result.warnings,mode:result.mode,recertNeeded:s.certifyStatus?.[day]==='Certified',at:Date.now()}};
      next=reconcilePreTripInspections(next,[day]);
      for(const changedDay of new Set([day,...result.changedRouteDays])) next=markDayRecert(next,changedDay);
      return next;
    });
  }

`);
// One entry point for Move, whether opened from the day or Tools.
const oldShift="return { ...s, sheet:{ type:'shift' }, selectMode:true, selectedIds:ids }; })}";
if(read(app).includes(oldShift)) {
  assert.equal(read(app).split(oldShift).length-1,2,'Both Move entry points');
  write(app,read(app).replaceAll(oldShift,"return { ...s, view:'day', sheet:null, selectMode:true, selectedIds:ids, roadGuardTabRequest:{tab:'log',at:Date.now()} }; })}"));
}
write(app,read(app).replace("import ShiftSheet from '../modules/editor/ShiftSheet.jsx';\n",'').replace("      {state.sheet?.type === 'shift' && <ShiftSheet events={rawEvents} selectedIds={resolvedShiftIds} onApply={applyShift} onClose={()=>setState(s=>({ ...s, sheet:null }))} />}\n",''));
write(app,read(app).replaceAll("rawStoredEventsForDay(s.eventsByDay || {}, s.activeDay).map(e=>e.id)","shiftRows(s.eventsByDay?.[s.activeDay] || []).map(e=>e.id)"));

const service='source/src/core/gps/locationService.js';
patch(service,'  const accuracy = Number(position?.coords?.accuracy);','  const accuracy = typeof position?.coords?.accuracy === \'number\' ? position.coords.accuracy : NaN;');
range(service,'export function getBestGpsPosition(options = {}) {','function gpsFallbackPlace(lat, lng) {',`export { getBestGpsPosition } from './gpsPositionV110409.js';
import { getBestGpsPosition, gpsAbortError, validGpsCoordinates } from './gpsPositionV110409.js';

`);
patch(service,"  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid GPS coordinates');","  if (options.signal?.aborted) throw gpsAbortError();\n  if (!validGpsCoordinates(lat,lng)) throw new Error('Invalid GPS coordinates');");
patch(service,'  const lat = Number(position?.coords?.latitude ?? position?.lat);\n  const lng = Number(position?.coords?.longitude ?? position?.lng);','  const lat = position?.coords?.latitude ?? position?.lat;\n  const lng = position?.coords?.longitude ?? position?.lng;');
patch(service,'Number(options.timeoutMs || 5000)','Number(options.timeoutMs || 8000)');
patch(service,'    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;',`    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const cancel = () => controller?.abort();
    options.signal?.addEventListener('abort',cancel,{once:true});`);
patch(service,'      // Offline/timeout: the nearest known city fallback remains available.','      if(options.signal?.aborted) throw gpsAbortError();\n      // Offline/timeout: the nearest known city fallback remains available.');
patch(service,'      if (timer) clearTimeout(timer);\n    }\n  }\n\n  return {\n    ...resolved,','      if (timer) clearTimeout(timer);\n      options.signal?.removeEventListener(\'abort\',cancel);\n    }\n  }\n  if(options.signal?.aborted) throw gpsAbortError();\n\n  return {\n    ...resolved,');

const shared='source/src/shared/duty/DutyLocation.jsx';
patch(shared,"onGps,gpsStatus='',suggestions=[]","onGps,gpsStatus='',gpsPending=false,onCancelGps,suggestions=[]");
patch(shared,'aria-label="Use GPS location" onClick={onGps}','aria-label="Use GPS location" disabled={gpsPending || !onGps} onClick={onGps}');
patch(shared,'    {children}',`    {onGps?<div className="dd-gps-actions" style={{display:'flex',gap:8,marginTop:6}}>{gpsPending
      ? <button type="button" style={{minHeight:44}} onClick={onCancelGps}>Cancel GPS</button>
      : <button type="button" style={{minHeight:44}} onClick={onGps}>{gpsStatus?'Retry GPS':'Use current GPS'}</button>}</div>:null}
    <style>{${JSON.stringify('.dd-gps-actions button{min-height:44px;border:1px solid #cbd8e9;border-radius:9px;background:#f5f8ff;color:#214d9a;padding:8px 12px;font:inherit}')}}</style>
    {children}`);
const fields='source/src/modules/editor/components/EditorLocationFields.jsx';
patch(fields,"  gpsStatus = '',","  gpsStatus = '',\n  gpsPending = false,\n  onCancelGps = null,");
patch(fields,'    gpsStatus={draft&&!parseLocationText(draft,\'\').state?\'Add state, example: Gary, IN\':gpsStatus}',"    gpsPending={gpsPending} onCancelGps={onCancelGps}\n    gpsStatus={gpsPending?gpsStatus:draft&&!parseLocationText(draft,'').state?'Add state, example: Gary, IN':gpsStatus}");

for(const file of ['source/src/modules/status/StatusWorkflowSheet.jsx','source/src/modules/editor/EditEventSheet.jsx']) {
  patch(file,"import { getAccurateGpsLocation } from '../../core/gps/locationService.js';",`import useGpsRequest from '../../shared/duty/useGpsRequestV110409.js';
import {gpsHasPlace,gpsFixMessage,gpsErrorMessage} from '../../core/gps/gpsFeedbackV110409.js';`);
  patch(file,'  const [gpsPending, setGpsPending] = useState(false);','  const {run:requestGps,cancel:cancelGpsRequest,pending:gpsPending} = useGpsRequest();');
  write(file,read(file).replaceAll('setGpsPending(false);','cancelGpsRequest();').replaceAll('setGpsPending(true);','').replaceAll('await getAccurateGpsLocation({','await requestGps({'));
  const start="      if (error?.code === 'GPS_ACCURACY') {",end='    }\n  }';
  range(file,start,end,'      setGpsStatus(gpsErrorMessage(error));\n');
}
const status='source/src/modules/status/StatusWorkflowSheet.jsx';
patch(status,'  function applyFix(fix = {}) {',`  function applyFix(fix = {}) {
    if(!gpsHasPlace(fix)) { setGpsStatus(gpsFixMessage(fix)); return; }`);
patch(status,"    setGpsStatus(`GPS locked · ${nextCity}, ${nextState}${accuracy != null ? ` · ±${Math.round(accuracy)} m` : ''}`);",'    setGpsStatus(gpsFixMessage(fix));');
patch(status,'      if (gpsRequestId.current !== requestId) return;\n      // A slow automatic fix','      if (!fix || gpsRequestId.current !== requestId) return;\n      // A slow automatic fix');
patch(status,'suggestions={locationSuggestions} onSuggestion={chooseLocationSuggestion} gpsStatus={gpsStatus}',"suggestions={locationSuggestions} onSuggestion={chooseLocationSuggestion} gpsStatus={gpsStatus}\n      gpsPending={gpsPending} onCancelGps={()=>{gpsRequestId.current+=1;cancelGpsRequest();setGpsStatus('GPS cancelled. Enter City, ST or retry.');}}");
const edit='source/src/modules/editor/EditEventSheet.jsx';
patch(edit,'      if (gpsRequestId.current !== requestId || manualLocationDirty.current) return;','      if (!fix || gpsRequestId.current !== requestId || manualLocationDirty.current) return;\n      if (!gpsHasPlace(fix)) { setGpsStatus(gpsFixMessage(fix)); return; }');
patch(edit,"      setGpsStatus(`GPS locked · ${nextCity}, ${nextState}${fix.accuracy != null ? ` · ±${Math.round(fix.accuracy)} m` : ''}`);",'      setGpsStatus(gpsFixMessage(fix));');
patch(edit,'          gpsStatus={gpsStatus}',"          gpsStatus={gpsStatus} gpsPending={gpsPending} onCancelGps={()=>{gpsRequestId.current+=1;cancelGpsRequest();setGpsStatus('GPS cancelled. Enter City, ST or retry.');}}");

const insert='source/src/modules/editor/InsertEditEventSheet.jsx';
patch(insert,"import { detectState, guessGpsCity } from '../../core/gps/locationService.js';",`import useGpsRequest from '../../shared/duty/useGpsRequestV110409.js';
import {gpsHasPlace,gpsFixMessage,gpsErrorMessage} from '../../core/gps/gpsFeedbackV110409.js';`);
patch(insert,"  const [gpsStatus, setGpsStatus] = useState('');","  const [gpsStatus, setGpsStatus] = useState('');\n  const {run:requestGps,cancel:cancelGpsRequest,pending:gpsPending} = useGpsRequest();\n  useEffect(()=>{cancelGpsRequest();},[selectedEventId,mode,logbookContext.activeDay,cancelGpsRequest]);");
range(insert,'  function applyGps(auto = false) {','  function updateForm(patch) {',`  async function applyGps() {
    if(logbookContext.activeDay !== clockV110.day && !window.confirm('This is a recorded day. Current GPS is your position now. Use it for this event?')) return;
    setGpsStatus('Improving GPS accuracy…');
    try {
      const fix=await requestGps({durationMs:12000,targetAccuracy:40,maximumAge:0,minimumSamples:2,rejectCoarseFix:true,maximumAcceptedAccuracy:250});
      if(!fix) return;
      setGpsStatus(gpsFixMessage(fix));
      if(gpsHasPlace(fix)) updateForm({city:fix.city,state:fix.state,lat:fix.lat,lng:fix.lng,gpsAccuracy:fix.accuracy,locationSource:fix.source});
    } catch(error) { setGpsStatus(gpsErrorMessage(error)); }
  }

  function manualLocationDraft() { cancelGpsRequest(); setGpsStatus('Manual location'); }

`);
patch(insert,'  function save() {\n    if (editorRangeError','  function save() {\n    if (gpsPending) return;\n    if (editorRangeError');
patch(insert,"onLocationChange={(c, s) => updateForm({ city: c, state: s, lat: null, lng: null, gpsAccuracy: null, locationSource: 'manual' })}","onLocationDraftChange={manualLocationDraft}\n              onLocationChange={(c, s) => {manualLocationDraft();updateForm({ city: c, state: s, lat: null, lng: null, gpsAccuracy: null, locationSource: 'manual' });}}");
patch(insert,'              gpsStatus={gpsStatus}',"              gpsStatus={gpsStatus} gpsPending={gpsPending} onCancelGps={()=>{cancelGpsRequest();setGpsStatus('GPS cancelled. Enter City, ST or retry.');}}");
patch(insert,"onClear={() => updateForm({ city: '', state: '', lat: null, lng: null, gpsAccuracy: null, locationSource: 'manual' })}","onClear={()=>{manualLocationDraft();updateForm({ city:'',state:'',lat:null,lng:null,gpsAccuracy:null,locationSource:'manual' });}}");
patch(insert,'disabled={!!rangeErrorV110 || (mode === \'insert\' && !insertResultV11023.ok)}','disabled={gpsPending || !!rangeErrorV110 || (mode === \'insert\' && !insertResultV11023.ok)}');

const VERSION='110.4.9',BUILD='v110409-easier-edit-gps',stamp=new Date().toISOString();
for(const file of ['release-version.json','public/app-version.json']) {
  const value=JSON.parse(read(file));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.9 Easier event editing and GPS',releasedAt:stamp,updatedAt:stamp,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,notes:['Preview several selected events moving earlier or later in hours and minutes, then Apply once or Cancel.','Clear GPS retry/cancel, fresh accurate fixes in Insert and Edit, and protection for manually typed locations.']});
  write(file,JSON.stringify(value,null,2)+'\n');
}
for(const file of ['package.json','package-lock.json']) {
  const value=JSON.parse(read(file));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  write(file,JSON.stringify(value,null,2)+'\n');
}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let source=read(file);
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]]) source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);
  write(file,source);
}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']) write(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const file of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']) write(file,read(file).replaceAll("'110.4.8'","'"+VERSION+"'").replaceAll("'v110408-sleeper-midnight'","'"+BUILD+"'"));
locks.release=VERSION;locks.files[screen]=createHash('sha256').update(read(screen)).digest('hex');
write('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
// Register only these reviewed downstream outputs with the legacy idempotence
// checks. An unknown edit still fails before any legacy installer writes files.
const reviewed=JSON.parse(read('scripts/v110409/reviewed-runtime-hashes.json'));
for(const [file,hash] of Object.entries(reviewed)) assert.equal(createHash('sha256').update(read(file)).digest('hex'),hash,'Reviewed GPS/edit runtime: '+file);
patch('scripts/v110378/install.mjs','const prepared=[],seen=new Set();',`Object.assign(completedHashes,${JSON.stringify(reviewed)});\nconst prepared=[],seen=new Set();`);
patch('scripts/v110378/finish-mobile.mjs',' const source=fs.readFileSync(file,\'utf8\');',` const source=fs.readFileSync(file,'utf8');\n if(hash(source)===${JSON.stringify(reviewed)}[file])return;`);
console.log('PASS — v110.4.9 reviewed event preview/apply and cancellable GPS');
