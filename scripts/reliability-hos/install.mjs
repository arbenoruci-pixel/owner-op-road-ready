import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Run after every historical materializer/finalizer, in an isolated checkout.
// Fail before writing if the expected current source contract is unavailable.
const assets=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(process.argv[2]||process.cwd());
const files=new Map();
const read=name=>files.get(name)??fs.readFileSync(path.join(root,name),'utf8');
const write=(name,value)=>files.set(name,value);
function one(source,from,to,label) {
  if(!source.includes(from))throw new Error(`HOS install: missing ${label||from.slice(0,90)}`);
  if(source.indexOf(from)!==source.lastIndexOf(from))throw new Error(`HOS install: ambiguous ${label||from.slice(0,90)}`);
  return source.replace(from,to);
}
function edit(name,change){write(name,change(read(name)));}
function withImports(text,imports){
  const directive=text.match(/^(\s*['"]use (?:client|server)['"];)/);
  return directive ? directive[1]+'\n'+imports+'\n'+text.slice(directive[1].length) : imports+'\n'+text;
}
function prepend(name,imports){edit(name,text=>withImports(text,imports));}
const marker='RELIABILITY_HOS_INSTALL_V1';
const installed=read('source/src/core/hos/hosEngine.js').includes(marker);

for(const name of ['timePolicy.js','timeline.js','profile.js','rules.js'])write(`source/src/core/hos/reliability/${name}`,fs.readFileSync(path.join(assets,name),'utf8'));
for(const [name,target] of [
  ['useHosNow.js','source/src/shared/utils/useHosNow.js'],
  ['HosCompactClocks.jsx','source/src/modules/drive/HosCompactClocks.jsx'],
  ['HosImpactPreview.jsx','source/src/modules/editor/HosImpactPreview.jsx'],
  ['TimeZoneSheet.jsx','source/src/shared/ui/TimeZoneSheet.jsx'],
  ['HosProfileSheet.jsx','source/src/shared/ui/HosProfileSheet.jsx'],
])write(target,fs.readFileSync(path.join(assets,name),'utf8'));

if(!installed) {
  edit('source/src/core/hos/hosEngine.js',text=>{
    for(const name of ['calculateHosClocks','analyzeLinkedHos','violationRangesForDay'])text=one(text,`export function ${name}(`,`function legacy_${name}(`,name);
    return `import {calculateReliableHos,reviewReliableHos} from './reliability/rules.js';\n${text}\n// ${marker}: live clocks, graph ranges, review and export use the same rules.\nfunction reliabilityState(eventsByDay,options={}) {\n  const state=options.state||{};\n  return {...state,homeTerminalTimeZone:state.homeTerminalTimeZone||options.timeZone||getHomeTerminalTimeZone(options.state||null),eventsByDay};\n}\nexport function calculateHosClocks(stateLike={},nowInput=new Date(),options={}) {\n  return calculateReliableHos({...stateLike,homeTerminalTimeZone:stateLike.homeTerminalTimeZone||options.timeZone||getHomeTerminalTimeZone(stateLike)},nowInput,options);\n}\nexport function analyzeLinkedHos(eventsByDay={},activeDay,certifyStatus={},options={}) {\n  const state=reliabilityState(eventsByDay,options);\n  return reviewReliableHos(eventsByDay,activeDay,certifyStatus,{...options,state});\n}\nexport function violationRangesForDay(eventsByDay={},activeDay,options={}) {\n  return analyzeLinkedHos(eventsByDay,activeDay,options.state?.certifyStatus||{},{...options}).violationRanges;\n}\n`;
  });

  edit('source/src/core/time/homeTerminalTime.js',text=>{
    text=`import {effectiveZone,zoneForLogDay} from '../hos/reliability/timePolicy.js';\n${text}`;
    text=one(text,"      return normalizeTimeZone(window.localStorage.getItem(HOME_TERMINAL_TIMEZONE_STORAGE_KEY));",`      const stored=normalizeTimeZone(window.localStorage.getItem(HOME_TERMINAL_TIMEZONE_STORAGE_KEY));
      const raw=window.localStorage.getItem(HOME_TERMINAL_TIMEZONE_STORAGE_KEY+'-policy');
      if(raw){try{return effectiveZone({...JSON.parse(raw),homeTerminalTimeZone:stored},new Date());}catch{}}
      return stored;`,'stored current time policy');
    const start=text.indexOf('export function getHomeTerminalTimeZone('),end=text.indexOf('\nexport function timeZoneDisplayName',start);
    if(start<0||end<0)throw new Error('HOS install: home-terminal getter boundary');
    text=text.slice(0,start)+`export function getHomeTerminalTimeZone(stateLike=null,at=new Date()) {
  if(!stateLike)return getStoredHomeTerminalTimeZone();
  const zone=stateLike.homeTerminalTimeZone||stateLike.settings?.homeTerminalTimeZone||stateLike.carrierSettings?.homeTerminalTimeZone||stateLike.driverProfile?.homeTerminalTimeZone||getStoredHomeTerminalTimeZone();
  return effectiveZone({...stateLike,homeTerminalTimeZone:zone},at);
}
export function getLogDayTimeZone(stateLike={},day=stateLike.activeDay) { return zoneForLogDay(stateLike,day); }
export function persistHomeTerminalTimePolicy(stateLike={}) {
  const policy={homeTerminalTimeZone:getHomeTerminalTimeZone(stateLike),homeTerminalOriginalTimeZone:stateLike.homeTerminalOriginalTimeZone,homeTerminalTimeZoneHistory:stateLike.homeTerminalTimeZoneHistory||[]};
  try{if(typeof window!=='undefined'&&window.localStorage)window.localStorage.setItem(HOME_TERMINAL_TIMEZONE_STORAGE_KEY+'-policy',JSON.stringify(policy));}catch{}
  return policy.homeTerminalTimeZone;
}
`+text.slice(end);
    text=one(text,'export function homeTerminalConfigFromState(stateLike = {}) {\n  const zone = getHomeTerminalTimeZone(stateLike);','export function homeTerminalConfigFromState(stateLike = {},day = null) {\n  const zone = day ? getLogDayTimeZone(stateLike,day) : getHomeTerminalTimeZone(stateLike);','day-specific zone label');
    return text;
  });

  edit('source/src/shared/utils/useLogbookClockV110.js',text=>{
    text=one(text,'getHomeTerminalTimeZone, homeTerminalDayKey, homeTerminalMinute','getHomeTerminalTimeZone, getLogDayTimeZone, homeTerminalDayKey, homeTerminalMinute');
    text=one(text,'const timeZone = getHomeTerminalTimeZone(state);','const timeZone = getHomeTerminalTimeZone(state,at);');
    return one(text,'return { at,timeZone,day:homeTerminalDayKey(at,timeZone),minute:homeTerminalMinute(at,timeZone) };','return { at,timeZone:getLogDayTimeZone(state,state.activeDay || homeTerminalDayKey(at,timeZone)),day:homeTerminalDayKey(at,timeZone),minute:homeTerminalMinute(at,timeZone) };');
  });
  edit('source/src/modules/logbook/eventEditingV110.js',text=>one(text,'getHomeTerminalTimeZone(state);return{timeZone','getHomeTerminalTimeZone(state,at);return{timeZone','editor effective instant'));

  edit('source/src/modules/logbook/public-api.js',text=>one(text,"'homeTerminalTimeZone','homeTerminalAddress'","'homeTerminalTimeZone','homeTerminalOriginalTimeZone','homeTerminalTimeZoneHistory','homeTerminalTimeZoneChangeProposal','homeTerminalTimeZoneProposalHistory','logTimeZoneByDay','hosSettings','hosProfileHistory','hosProfileProposal','carrierSettings','homeTerminalAddress'",'protected policy keys'));

  edit('source/src/modules/logbook/DayLogScreen.jsx',text=>{
    text=one(text,'violationRangesForDay(state.eventsByDay || {}, state.activeDay)','violationRangesForDay(state.eventsByDay || {}, state.activeDay,{state,now:clockV110.at})');
    text=one(text,'[state.eventsByDay, state.activeDay]\n  );\n\n  const previewRawEvents','[state, Math.floor(clockV110.at.getTime()/60000)]\n  );\n\n  const previewRawEvents');
    text=one(text,'violationRangesForDay({ ...(state.eventsByDay || {}), [state.activeDay]: previewRawEvents }, state.activeDay)','violationRangesForDay({ ...(state.eventsByDay || {}), [state.activeDay]: previewRawEvents }, state.activeDay,{state,now:clockV110.at})');
    text=one(text,'[isMoving, state.eventsByDay, state.activeDay, previewRawEvents, baseViolationRanges]','[isMoving, state, previewRawEvents, baseViolationRanges, Math.floor(clockV110.at.getTime()/60000)]');
    text=one(text,'homeTerminalConfigFromState(state);','homeTerminalConfigFromState(state,state.activeDay);');
    return text;
  });
  edit('source/src/modules/logbook/signing.js',text=>{
    const from='violationRangesForDay(rawEventsByDayForReview, day)';
    if(text.split(from).length!==3)throw new Error('HOS install: expected two signing review calls');
    return text.replaceAll(from,'violationRangesForDay(rawEventsByDayForReview, day,{state})');
  });
  edit('source/src/core/dot/dotOfficerCheckEngine.js',text=>{
    text=one(text,'analyzeLinkedHos(rawEventsByDay, day, state.certifyStatus || {})','analyzeLinkedHos(rawEventsByDay, day, state.certifyStatus || {},{state})');
    return one(text,'violationRangesForDay(rawEventsByDay, day)','violationRangesForDay(rawEventsByDay, day,{state})');
  });
  for(const name of ['source/src/modules/logbook/LogCheckPanel.jsx','source/src/modules/gps/DrivingFocusScreen.jsx'])edit(name,text=>one(text,'analyzeLinkedHos(state.eventsByDay || {}, state.activeDay, state.certifyStatus || {})','analyzeLinkedHos(state.eventsByDay || {}, state.activeDay, state.certifyStatus || {},{state})'));

  edit('source/src/modules/drive/DriveModeScreen.jsx',text=>{
    text=`import {useHosNow} from '../../shared/utils/useHosNow.js';\n${text}`;
    text=one(text,'function statusToneClass(clock = {}) {','function statusToneClass(clock = {}) {\n  if(clock.requiresReview)return \'grey\';');
    text=one(text,"const rawDriveText = clock.kind === 'effectiveDrive'","const rawDriveText = !clock.requiresReview && clock.kind === 'effectiveDrive'");
    text=one(text,'aria-label={`${clock.label} ${formatHosClockMinutes(clock.remainingMinutes)} remaining`}','aria-label={`${clock.label} ${clock.requiresReview ? "requires review" : formatHosClockMinutes(clock.remainingMinutes)+" remaining"}`}');
    text=one(text,'<b>{formatHosClockMinutes(clock.remainingMinutes)}</b>','<b>{clock.requiresReview ? "Review" : formatHosClockMinutes(clock.remainingMinutes)}</b>');
    text=one(text,'<span>{clock.label}</span>','<span>{clock.label}{clock.conditional && !clock.requiresReview ? " · Conditional" : ""}</span>');
    text=one(text,'const [tick, setTick] = React.useState(0);','const at=useHosNow();');
    const timer='  React.useEffect(() => {\n    const timer = window.setInterval(() => setTick(value => value + 1), 60000);\n    return () => window.clearInterval(timer);\n  }, []);';
    text=one(text,timer,'');
    text=one(text,'() => calculateHosClocks(state, new Date(), { splitSleeperEnabled:showSplitClocks }),\n    [state, tick, showSplitClocks]','() => calculateHosClocks(state, at),\n    [state, at]');
    text=one(text,'const splitEnabled = !!(split.available && split.enabled && showSplitClocks);','const splitEnabled = !!(split.available && split.enabled);');
    text=one(text,"(splitEnabled ? 'Using Split SB Clocks' : 'Show Split SB Clocks')","(showSplitClocks ? 'Hide split explanation' : 'Show split explanation')");
    text=one(text,'<SplitSleeperSummary split={split} enabled={splitEnabled} />','{showSplitClocks ? <SplitSleeperSummary split={split} enabled={splitEnabled} /> : null}');
    return text;
  });
  edit('source/src/modules/logbook/LogbookHomeScreen.jsx',text=>{
    text=`import {useHosNow} from '../../shared/utils/useHosNow.js';\nimport {getHomeTerminalTimeZone,homeTerminalDayKey} from '../../core/time/homeTerminalTime.js';\n${text}`;
    text=one(text,'const today = localDayKey();','const at=useHosNow();\n  const today = homeTerminalDayKey(at,getHomeTerminalTimeZone(state,at));');
    text=one(text,'const hos = useMemo(() => calculateHosClocks(state, new Date()), [state]);','const hos = useMemo(() => calculateHosClocks(state, at), [state,at]);');
    text=one(text,'const restartTitle = restActive && rest','const restartTitle = !hos.quality?.confirmed ? \'HOS history needs review\' : restActive && rest');
    return text;
  });

  edit('source/src/modules/editor/EditEventSheet.jsx',text=>{
    text=`import HosImpactPreview from './HosImpactPreview.jsx';\nimport {applyLogbookEditorEdit as previewCommittedHosEdit} from '../logbook/public-api.js';\n${text}`;
    text=one(text,'const dayV110 = logbookContext.activeDay;','const dayV110 = logbookContext.activeDay;\n  const [approvedHosChange,setApprovedHosChange]=useState(\'\');');
    const saveStart=text.indexOf('  function save() {'),patchStart=text.indexOf('    const patch = {};',saveStart),patchEnd=text.indexOf('    const accepted = onSave(',patchStart);
    if(saveStart<0||patchStart<0||patchEnd<0)throw new Error('HOS install: editor save patch boundary');
    const patchBody=text.slice(patchStart,patchEnd);
    text=text.slice(0,patchStart)+'    if(needsHistoricalHosApproval && approvedHosChange!==hosApprovalToken)return;\n    const patch=buildDraftHosPatch();\n'+text.slice(patchEnd);
    text=one(text,'  // MOTIVE_PREVIEW_V11023: graph previews the same override that Save commits.',`  function buildDraftHosPatch() {\n${patchBody}    return patch;\n  }\n  // MOTIVE_PREVIEW_V11023: graph previews the same override that Save commits.`);
    const oldPatch='  const previewPatchV11023 = {};\n  if(status!==initialForm.status)previewPatchV11023.status=status;\n  if(start!==initialForm.start)previewPatchV11023.startMin=preview.startMin;\n  if(end!==initialForm.end)previewPatchV11023.endMin=fromInput(end);';
    text=one(text,oldPatch,'  const previewPatchV11023 = buildDraftHosPatch();');
    text=one(text,'previewLogbookEditorOverride(logbookContext,{day:dayV110,id:event.id,patch:previewPatchV11023','previewCommittedHosEdit(logbookContext,{day:dayV110,id:event.id,patch:previewPatchV11023');
    text=one(text,'  function handleGraphSelect(nextId) {',`  const hosApprovalToken=JSON.stringify({day:dayV110,patch:previewPatchV11023,rows:initialRowsV11023});\n  const needsHistoricalHosApproval=dayV110<clockV110.day&&dirty;\n\n  function handleGraphSelect(nextId) {`);
    const notes='notes={<EditorNotesField note={note} onNoteChange={setNote}/>}';
    text=one(text,notes,`notes={<><EditorNotesField note={note} onNoteChange={setNote}/>\n        {dirty && previewResultV11023.ok ? <HosImpactPreview before={logbookContext} after={previewStateV11023} day={dayV110} at={clockV110.at}/> : null}\n        {needsHistoricalHosApproval ? <label className="hos-history-approval"><input type="checkbox" checked={approvedHosChange===hosApprovalToken} onChange={e=>setApprovedHosChange(e.target.checked?hosApprovalToken:'')}/><span>I approve the changes shown for {dayV110}. Keep the previous version in edit history.</span></label> : null}</>}`);
    return one(text,'previewResultV11023?.ok === false || !dirty}','previewResultV11023?.ok === false || !dirty || (needsHistoricalHosApproval && approvedHosChange!==hosApprovalToken)}');
  });

  edit('source/src/modules/editor/InsertEditEventSheet.jsx',text=>{
    text=`import HosImpactPreview from './HosImpactPreview.jsx';\nimport {applyLogbookEditorInsert as previewCommittedHosInsert} from '../logbook/public-api.js';\n${text}`;
    text=one(text,'const [mode, setMode] = useState(initialMode);','const [mode, setMode] = useState(initialMode);\n  const [approvedHosInsert,setApprovedHosInsert]=useState(\'\');');
    const saveStart=text.indexOf('  function save() {'),payloadStart=text.indexOf('    const s = fromInput(form.start);',saveStart),payloadEnd=text.indexOf("\n    if (mode === 'edit'",payloadStart);
    if(saveStart<0||payloadStart<0||payloadEnd<0)throw new Error('HOS install: insert payload boundary');
    const body=text.slice(payloadStart,payloadEnd).replace('Date.now()','clockV110.at.getTime()');
    text=text.slice(0,payloadStart)+"    if(needsHistoricalHosInsert && approvedHosInsert!==hosInsertToken)return;\n    const payload=buildHosInsertPayload();\n"+text.slice(payloadEnd);
    text=one(text,'  function save() {',`  function buildHosInsertPayload(){\n${body}\n    return payload;\n  }\n  function save() {`);
    text=one(text,"const insertEventV11023 = {...insertDraftEvent,id:insertDraftEvent.id,status:form.status,startMin:fromInput(form.start),endMin:fromInput(form.end),city:form.city,state:form.state,note:form.note,reasons:selectedReasons,description:form.description,lat:form.lat,lng:form.lng,gpsAccuracy:form.gpsAccuracy,locationSource:form.locationSource};","const insertEventV11023 = {...buildHosInsertPayload(),id:insertDraftEvent.id,note:form.note || statusLabel(form.status),reasons:selectedReasons};");
    text=one(text,'previewLogbookInsertOverride(logbookContext,{day:logbookContext.activeDay,event:insertEventV11023','previewCommittedHosInsert(logbookContext,{day:logbookContext.activeDay,event:insertEventV11023');
    text=one(text,'  const continuityPreviewEvents =',`  const hosInsertState=insertResultV11023.state||logbookContext;\n  const needsHistoricalHosInsert=mode==='insert' && logbookContext.activeDay<clockV110.day;\n  const {shippingDocsUpdatedAt:ignoredHosStamp,...hosReviewedInsert}=insertEventV11023;\n  const hosInsertToken=JSON.stringify({day:logbookContext.activeDay,event:hosReviewedInsert,rows:originalRowsV11023});\n  const continuityPreviewEvents =`);
    text=one(text,'<div className="form editor-form-v85">','<div className="form editor-form-v85"><div className="hos-edit-day"><b>{logbookContext.activeDay}</b> · {clockV110.timeZone}</div>');
    text=one(text,'            </details>\n          </>','            </details>\n            {mode===\'insert\' && insertResultV11023.ok ? <HosImpactPreview before={logbookContext} after={hosInsertState} day={logbookContext.activeDay} at={clockV110.at}/> : null}\n            {needsHistoricalHosInsert ? <label className="hos-history-approval"><input type="checkbox" checked={approvedHosInsert===hosInsertToken} onChange={e=>setApprovedHosInsert(e.target.checked?hosInsertToken:\'\')}/><span>I approve these changes to {logbookContext.activeDay}, including the surrounding events shown above.</span></label> : null}\n          </>');
    return one(text,"(mode === 'insert' && !insertResultV11023.ok)}>","(mode === 'insert' && !insertResultV11023.ok) || (needsHistoricalHosInsert && approvedHosInsert!==hosInsertToken)}>");
  });

  edit('source/src/core/backup/dayTransfer.js',text=>{
    text=one(text,"import { getHomeTerminalTimeZone }","import { getHomeTerminalTimeZone, getLogDayTimeZone, isValidTimeZone }");
    text=one(text,"  ['manualMilesByDay', 'manualMiles'],","  ['manualMilesByDay', 'manualMiles'],\n  ['logbookEditHistoryByDay','editHistory'],\n  ['logTimeZoneByDay','logTimeZone'],");
    text=one(text,'homeTerminalTimeZone: getHomeTerminalTimeZone(state),','homeTerminalTimeZone: getLogDayTimeZone(state,day),');
    text=one(text,"function importedEventsForTarget(events = [], sourceDay = '', targetDay = '') {","function importedEventsForTarget(events = [], sourceDay = '', targetDay = '') {\n  // An exact-day restore preserves the exported source facts, including unknown fields.\n  if(sourceDay===targetDay)return events.map(event=>clone(event));");
    text=one(text,"    dayImportBackupByDay: backupByDay,","    logbookEditHistoryByDay: {...state.logbookEditHistoryByDay,[targetDay]:restoredEditHistory(state,targetDay,dayData,sourceDay,importedEvents)},\n    logTimeZoneByDay:{...(state.logTimeZoneByDay||{}),[targetDay]:isValidTimeZone(typeof dayData.logTimeZone==='string' ? dayData.logTimeZone : dayData.logTimeZone?.timeZone || payload.homeTerminalTimeZone) ? (typeof dayData.logTimeZone==='string' ? dayData.logTimeZone : dayData.logTimeZone?.timeZone || payload.homeTerminalTimeZone) : getLogDayTimeZone(state,targetDay)},\n    dayImportBackupByDay: backupByDay,");
    return text+`\nfunction restoredEditHistory(state,day,dayData,sourceDay,importedEvents) {\n  const entries=[...(state.logbookEditHistoryByDay?.[day]||[]),...(sourceDay===day?(dayData.editHistory||[]):[])];\n  const seen=new Set(),history=entries.filter(entry=>{const key=JSON.stringify(entry);if(seen.has(key))return false;seen.add(key);return true;}).map(clone);\n  history.push({kind:'day_restore',editedAt:new Date().toISOString(),sourceDay,beforeEvents:clone(state.eventsByDay?.[day]||[]),afterEvents:clone(importedEvents)});\n  return history;\n}\n`;
  });
  edit('source/src/modules/logbook/certificationV110.js',text=>{
    text=one(text,"import { getHomeTerminalTimeZone }","import { getLogDayTimeZone }");
    return one(text,'homeTimezone:getHomeTerminalTimeZone(state)','homeTimezone:getLogDayTimeZone(state,day)');
  });

  edit('lib/owner-op-cloud/accountCoreV110455.js',text=>{
    text=one(text,"export const LOG_FIELDS=['eventsByDay'","export const LOG_FIELDS=['logbookEditHistoryByDay','logTimeZoneByDay','hosProfileByDay','eventsByDay'",'atomic day evidence fields');
    return one(text," const [kind,field]=JSON.parse(k);\n return kind!=='table'"," const [kind,field]=JSON.parse(k);\n if(kind==='state'&&['homeTerminalTimeZoneHistory','homeTerminalTimeZoneProposalHistory','hosProfileHistory'].includes(field))return true;\n return kind!=='table'",'working policy histories');
  });

  edit('source/src/shared/ui/ToolsSheet.jsx',text=>{
    text=one(text,'onDayTransfer, onTimeZone,','onDayTransfer, onTimeZone, onHosProfile,');
    const target='<button className="choice-card" onClick={onTimeZone}>';
    return one(text,target,'<button className="choice-card" onClick={onHosProfile}><b>HOS rule profile</b><span>Carrier cycle, 24-hour duty-day boundary and sleeper-berth applicability. Unverified settings stay marked for review.</span></button>\n        '+target);
  });
  edit('source/src/app/App.jsx',text=>{
    text=withImports(text,`import HosProfileSheet from '../shared/ui/HosProfileSheet.jsx';\nimport {applyTimeZoneChange} from '../core/hos/reliability/timePolicy.js';\nimport {saveHosProfile} from '../core/hos/reliability/profile.js';\nimport {persistHomeTerminalTimePolicy} from '../core/time/homeTerminalTime.js';`);
    text=one(text,'  const [state, setState] = useState(defaultInitialState);','  const [state, setState] = useState(defaultInitialState);\n  React.useEffect(()=>{persistHomeTerminalTimePolicy(state);},[state.homeTerminalTimeZone,state.homeTerminalOriginalTimeZone,state.homeTerminalTimeZoneHistory]);');
    const start=text.indexOf('  function saveHomeTerminalTimeZone(payload = {}) {'),end=text.indexOf('\n  async function buildManualBackup',start);
    if(start<0||end<0)throw new Error('HOS install: timezone-save boundary');
    text=text.slice(0,start)+`  function saveHomeTerminalTimeZone(payload = {}) {
    setState(s=>{
      const result=applyTimeZoneChange(s,payload.plan,new Date());
      return result.ok ? {...result.state,sheet:null} : {...s,sheet:{...s.sheet,error:result.error||'Review the time-zone proposal again.'}};
    });
  }
  function saveHosRuleProfile(payload={}) {
    setState(s=>{
      const result=saveHosProfile(s,payload.draft,new Date(),payload.confirmed===true);
      return result.ok ? {...result.state,sheet:null} : {...s,sheet:{...s.sheet,error:result.error}};
    });
  }
`+text.slice(end);
    text=one(text,"onTimeZone={()=>setState(s=>({ ...s, sheet:{ type:'timezone' } }))}","onTimeZone={()=>setState(s=>({ ...s, sheet:{ type:'timezone' } }))} onHosProfile={()=>setState(s=>({...s,sheet:{type:'hos_profile'}}))}");
    const zoneSheet="      {state.sheet?.type === 'timezone' && <TimeZoneSheet state={state} onClose={()=>setState(s=>({ ...s, sheet:null }))} onSave={saveHomeTerminalTimeZone} />}";
    text=one(text,zoneSheet,zoneSheet+"\n      {state.sheet?.type === 'hos_profile' && <HosProfileSheet state={state} onClose={()=>setState(s=>({...s,sheet:null}))} onSave={saveHosRuleProfile}/>}");
    return text;
  });
}

// Repair the initial isolated candidate's import placement as well as fresh
// installations: Next requires the client directive before every import.
const appPath='source/src/app/App.jsx';
if(!read(appPath).trimStart().startsWith("'use client';"))edit(appPath,text=>
  "'use client';\n"+one(text,"'use client';",'', 'App client directive')
);

if(read(appPath).includes('  useEffect(()=>{persistHomeTerminalTimePolicy(state);}'))edit(appPath,text=>one(text,'  useEffect(()=>{persistHomeTerminalTimePolicy(state);}','  React.useEffect(()=>{persistHomeTerminalTimePolicy(state);}','policy effect React import'));

// These day facts must follow the selected driver as well as the cloud record.
// Keep this incremental so an already installed isolated candidate can refresh.
const teamPath='source/src/core/team/teamLogbook.js';
if(!read(teamPath).includes("  'logbookEditHistoryByDay',"))edit(teamPath,text=>{
  text=one(text,"const DRIVER_LOG_FIELDS = [","const DRIVER_LOG_FIELDS = [\n  'logbookEditHistoryByDay',\n  'logTimeZoneByDay',\n  'hosProfileByDay',",'driver-scoped day evidence');
  return one(text,"    inspectionByDay:{},","    inspectionByDay:{},\n    logbookEditHistoryByDay:{},\n    logTimeZoneByDay:{},\n    hosProfileByDay:{},",'empty driver day evidence');
});
const contractPath='source/src/modules/logbook/public-api.js';
if(!read(contractPath).includes("['logTimeZoneByDay','hosProfileByDay','eventsByDay'"))edit(contractPath,text=>one(text,"Object.freeze(['eventsByDay'","Object.freeze(['logTimeZoneByDay','hosProfileByDay','eventsByDay'",'preserved historical policy day maps'));

const dayPath='source/src/modules/logbook/DayLogScreen.jsx';
if(!read(dayPath).includes('reliabilityBulkHosState'))edit(dayPath,text=>{
  text=`import HosImpactPreview from '../editor/HosImpactPreview.jsx';\n${text}`;
  text=one(text,'  const eventListEvents = useMemo(',`  const reliabilityBulkHosState=useMemo(()=>({...state,eventsByDay:{...state.eventsByDay,[state.activeDay]:bulkShiftResult.events}}),[state,bulkShiftResult.events]);\n  const reliabilityBulkRanges=useMemo(()=>state.selectMode && selectedCount && bulkMoveDelta ? violationRangesForDay(reliabilityBulkHosState.eventsByDay,state.activeDay,{state:reliabilityBulkHosState,now:clockV110.at}) : previewViolationRanges,[state.selectMode,selectedCount,bulkMoveDelta,reliabilityBulkHosState,state.activeDay,Math.floor(clockV110.at.getTime()/60000),previewViolationRanges]);\n  const eventListEvents = useMemo(`);
  text=one(text,'            violationRanges={previewViolationRanges}','            violationRanges={reliabilityBulkRanges}');
  return one(text,'          delta={bulkMoveDelta} onDelta={previewSelectedEvents} result={bulkShiftResult}',`          delta={bulkMoveDelta} onDelta={previewSelectedEvents} result={bulkShiftResult}\n          requiresHistoricalApproval={state.activeDay<clockV110.day} logDay={state.activeDay}\n          hosPreview={bulkShiftResult.appliedDeltaMin ? <HosImpactPreview before={state} after={reliabilityBulkHosState} day={state.activeDay} at={clockV110.at}/> : null}`);
});
const bulkPath='source/src/modules/logbook/BulkMovePanelV110409.jsx';
if(!read(bulkPath).includes('requiresHistoricalApproval'))edit(bulkPath,text=>{
  text=one(text,'onAll, onClear, onCancel, onApply})','onAll, onClear, onCancel, onApply, hosPreview, requiresHistoricalApproval=false, logDay})');
  text=one(text,'  const [expanded,setExpanded] = useState(false);',"  const [expanded,setExpanded] = useState(false);\n  const [approved,setApproved]=useState('');\n  const approvalToken=JSON.stringify({events,selectedIds,delta,logDay});\n  const approvalMissing=requiresHistoricalApproval&&approved!==approvalToken;");
  const actions='<div className="bulk-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" disabled={!delta}';
  text=one(text,actions,`{available ? hosPreview : null}\n    {available && requiresHistoricalApproval ? <label className="hos-history-approval"><input type="checkbox" checked={!approvalMissing} onChange={e=>setApproved(e.target.checked?approvalToken:'')}/><span>I approve the changes shown for {logDay}, including neighboring event boundaries.</span></label> : null}\n    `+actions);
  return one(text,'disabled={!available || !!result.blockedReason} onClick={()=>onApply(available)}','disabled={!available || !!result.blockedReason || approvalMissing} onClick={()=>{if(!approvalMissing)onApply(available);}}');
});

const cssPath='source/src/styles.css',cssMarker='/* RELIABILITY_HOS_CSS_V1 */',cssEnd='/* END_RELIABILITY_HOS_CSS_V1 */';
let css=read(cssPath),cssStart=css.indexOf(cssMarker);
if(cssStart>=0){
  let end=css.indexOf(cssEnd,cssStart);
  if(end>=0)end+=cssEnd.length;
  else {
    // Upgrade the first candidate's known final CSS line, retaining any other
    // finalizer's rules that were subsequently appended to the shared file.
    const finalLine=css.indexOf('@media(min-width:768px){.hos-edit-preview',cssStart);
    if(finalLine<0)throw new Error('HOS install: cannot identify the end of prior HOS styles');
    end=css.indexOf('\n',finalLine);if(end<0)end=css.length;
  }
  css=css.slice(0,cssStart)+css.slice(end);
}
write(cssPath,css.trimEnd()+'\n\n'+cssMarker+'\n'+fs.readFileSync(path.join(assets,'reliability-hos.css'),'utf8')+'\n'+cssEnd+'\n');
for(const [name,contents] of files){const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,contents);}
console.log(`HOS reliability candidate installed: ${files.size} files; ${installed?'existing integration refreshed':'shared rules, explicit edit review, clock refresh, prospective profile and pending timezone proposal'}.`);
