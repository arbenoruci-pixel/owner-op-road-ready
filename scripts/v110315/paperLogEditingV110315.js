// Logbook UI contract. Stored minute values are home-terminal wall-clock values.
// Projection is read-only; editing never invokes continuity/repair normalizers.
import { getHomeTerminalTimeZone, homeTerminalDayKey, homeTerminalMinute } from '../../core/time/homeTerminalTime.js';
export function editorTimeInput(value) {const n=Number(value);if(!Number.isFinite(n))return '';const m=Math.max(0,Math.min(1440,Math.round(n)));return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
export function editorMinute(value){if(value==='24:00')return 1440;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)))return NaN;const[h,m]=value.split(':').map(Number);return h*60+m;}
export function editorRangeError(start,end,live=false){if(!Number.isInteger(start)||!Number.isInteger(end))return'Enter a valid Start and End time.';if(start<0||start>1439||end<0||end>1440)return'Times must stay within the selected log day.';if(end<start||(!live&&end===start))return'End must be after Start. For a midnight ending, select 24:00.';return'';}
export function logbookClock(state={},at=new Date()){const timeZone=getHomeTerminalTimeZone(state);return{timeZone,day:homeTerminalDayKey(at,timeZone),minute:homeTerminalMinute(at,timeZone),at};}
export function projectLogbookEvents(state={},day=state.activeDay,at=new Date()){const clock=logbookClock(state,at);const rows=(state.eventsByDay?.[day]||[]).filter(e=>e&&!e.voided&&!e.syntheticCoverage&&!e.displayOnly&&!e.carriedFromPreviousDay&&!e.synthetic&&!e.continuityGenerated&&!['timeline_continuity','carryover','display','display_timeline'].includes(e.source)).map(e=>({...e})).sort((a,b)=>a.startMin-b.startMin);const last=rows[rows.length-1];if(!last||day!==clock.day)return rows;const manual=state.manualDrivingSession,gps=state.gpsTrip;const ownedSession=(manual?.active===true&&manual.eventId===last.id&&(!manual.startDay||manual.startDay===day))||(gps?.status==='active'&&gps.eventId===last.id);const liveSource=['live_status','manual_drive_midnight_continuation'].includes(last.source);if(!last.paperLogEndV110315&&state.currentStatus===last.status&&(ownedSession||liveSource)&&Number(last.startMin)<=clock.minute)rows[rows.length-1]={...last,endMin:clock.minute,isLive:true,recordedEndMin:last.endMin};return rows;}
const EDIT_FIELDS=new Set(['status','startMin','endMin','city','state','description','note','reasons','lat','lng','gpsAccuracy','locationSource','shippingDocs','loadNo','bol','destination','destinationState','loadDetailsExplicit']);const equal=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);// This application is a manually editable paper log. Source tags do not lock a row.
export function isProtectedAutomaticDriving(){return false;}

const active=e=>e&&!e.voided&&!e.syntheticCoverage&&!e.displayOnly&&!e.carriedFromPreviousDay&&!e.synthetic&&!e.continuityGenerated&&!['timeline_continuity','carryover','display','display_timeline'].includes(e.source);const overlaps=(a,b)=>a.startMin<b.endMin&&a.endMin>b.startMin;const boundsChanged=(a,b)=>a.startMin!==b.startMin||a.endMin!==b.endMin||a.status!==b.status;
function changedSummary(before,after,targetId){const map=new Map(after.map(e=>[e.id,e]));const changedIds=before.filter(e=>!equal(e,map.get(e.id))).map(e=>e.id);const addedIds=after.filter(e=>!before.some(b=>b.id===e.id)).map(e=>e.id);return{changedIds:[...new Set([...changedIds,...addedIds])],removedIds:before.filter(e=>!map.has(e.id)).map(e=>e.id),addedIds,neighborIds:changedIds.filter(id=>id!==targetId)};}
function replaceInterval(rows,before,after){const real=rows.filter(active);if(new Set(real.map(e=>e.id)).size!==real.length)return{ok:false,error:'Duplicate event IDs require review before changing time.'};if(real.some(e=>typeof e.startMin!=='number'||typeof e.endMin!=='number'||editorRangeError(e.startMin,e.endMin)))return{ok:false,error:'An existing event has invalid times. Review it before replacing duty time.'};const work=real.filter(e=>e.id!==before?.id).map(e=>({...e}));if(before&&after.startMin>before.startMin){const candidates=work.filter(e=>e.endMin===before.startMin&&e.startMin<before.startMin),occupied=work.filter(e=>e.endMin>before.startMin&&e.startMin<Math.min(after.startMin,before.endMin));if(candidates.length===1){const previous=candidates[0],stop=Math.min(after.startMin,before.endMin,...occupied.map(e=>Math.max(before.startMin,e.startMin)));if(stop>previous.endMin)previous.endMin=stop;}}if(before&&after.endMin<before.endMin){const candidates=work.filter(e=>e.startMin===before.endMin&&e.endMin>before.endMin),occupied=work.filter(e=>e.startMin<before.endMin&&e.endMin>Math.max(after.endMin,before.startMin));if(candidates.length===1){const next=candidates[0],start=Math.max(after.endMin,before.startMin,...occupied.map(e=>Math.min(before.endMin,e.endMin)));if(start<next.startMin)next.startMin=start;}}const used=new Set(rows.map(e=>e?.id)),out=[];for(const row of work){if(!overlaps(row,after)){out.push(row);continue;}const left=row.startMin<after.startMin,right=row.endMin>after.endMin;if(left)out.push({...row,endMin:after.startMin});if(right){const fragment={...row,startMin:after.endMin};if(left){const key=`${row.id}__split_${after.id}_${after.endMin}`;let id=key,n=2;while(used.has(id))id=`${key}_${n++}`;used.add(id);fragment.id=id;fragment.splitFromEventId=row.id;if(Number(row.manualMiles)>0){fragment.manualMiles=0;fragment.manualMilesNeedsReview=true;}}out.push(fragment);}}out.push(after);out.sort((a,b)=>a.startMin-b.startMin||a.endMin-b.endMin||String(a.id).localeCompare(String(b.id)));const result=[...out,...rows.filter(e=>!active(e))],summary=changedSummary(real,out,after.id);return{ok:true,changed:true,events:result,...summary,timelineChanged:summary.neighborIds.length>0};}

function elapsedRows(state,day,at) {
  const projection=projectLogbookEvents(state,day,at);
  const live=projection.find(e=>e.isLive);
  const rows=state.eventsByDay?.[day]||[];
  return {live,rows:rows.map(e=>active(e)&&e.id===live?.id?{...e,endMin:Math.max(e.startMin+1,live.endMin)}:e)};
}
function withCurrentState(state,day,events,before,patch,at) {
  let next={...state,eventsByDay:{...state.eventsByDay,[day]:events}};
  const previousLive=projectLogbookEvents(state,day,at).find(e=>e.isLive);
  if(before&&previousLive?.id===before.id) {
    const after=events.find(e=>active(e)&&e.id===before.id);
    if(after&&Object.hasOwn(patch,'status'))next={...next,currentStatus:after.status,currentReason:after.note||'',currentLocation:{...state.currentLocation,city:after.city||'',state:after.state||''}};
  }
  for(const key of ['manualDrivingSession','gpsTrip']) {
    const session=state[key];
    if(!session||(session.active!==true&&session.status!=='active'))continue;
    const old=(state.eventsByDay?.[day]||[]).find(e=>active(e)&&e.id===session.eventId);
    if(!old)continue;
    const row=events.find(e=>active(e)&&e.id===session.eventId);
    if(!row||row.status!=='D'||row.paperLogEndV110315) {
      next={...next,[key]:{...session,active:false,status:'stopped',endedAt:at.toISOString(),endedBy:'paper_log_edit'}};
    }
  }
  return next;
}
function resultFor(state,command,result,at,before,patch={}) {
  if(!result.ok)return result;
  const live=projectLogbookEvents(state,command.day,at).find(e=>e.isLive);
  const rawLive=(state.eventsByDay?.[command.day]||[]).find(e=>active(e)&&e.id===live?.id);
  if(rawLive)result.events=result.events.map(e=>active(e)&&e.id===rawLive.id&&!e.paperLogEndV110315?{...e,endMin:Math.max(e.startMin+1,rawLive.endMin)}:e);
  const real=result.events.filter(active);
  const changes=changedSummary((state.eventsByDay?.[command.day]||[]).filter(active),real,command.id||command.event.id);
  return {...result,...changes,state:withCurrentState(state,command.day,result.events,before,patch,at),timelineChanged:changes.neighborIds.length>0};
}
export function previewLogbookEditorOverride(state,{day,id,patch={},expected,expectedRows},at=new Date()) {
  const command={day,id,patch}, rows=state.eventsByDay?.[day]||[], before=rows.find(e=>active(e)&&e.id===id);
  if(!before)return {ok:false,error:'This event is no longer available. Reopen the log.'};
  if(expected&&!equal(before,expected))return {ok:false,error:'This event changed while the editor was open. Reopen it before saving.'};
  const changes={};
  for(const [key,value] of Object.entries(patch)) {
    if(!EDIT_FIELDS.has(key))return {ok:false,error:`Unsupported log field: ${key}`};
    if(!equal(value,before[key])||(key==='endMin'&&projectLogbookEvents(state,day,at).some(e=>e.id===id&&e.isLive)))changes[key]=value;
  }
  if(!Object.keys(changes).length)return {ok:true,changed:false,events:rows,changedIds:[],neighborIds:[],state};
  const temporal=['status','startMin','endMin'].some(key=>Object.hasOwn(changes,key));
  let after={...before,...changes};
  if(!['OFF','SB','D','ON'].includes(after.status))return {ok:false,error:'Choose a valid duty status.'};
  if(!temporal)return resultFor(state,command,{ok:true,changed:true,events:rows.map(e=>e===before?after:e)},at,before,changes);
  if(expectedRows&&!equal(rows,expectedRows))return {ok:false,error:'Another event changed while Edit was open. Reopen the day before saving.'};
  const projected=elapsedRows(state,day,at), effectiveBefore=projected.rows.find(e=>active(e)&&e.id===id);
  after={...effectiveBefore,...changes};
  if(projected.live?.id===id&&Object.hasOwn(changes,'status')&&!Object.hasOwn(changes,'endMin'))after.source='live_status';
  if(projected.live?.id===id&&Object.hasOwn(changes,'endMin'))after.paperLogEndV110315=true;
  const error=editorRangeError(after.startMin,after.endMin);if(error)return {ok:false,error};
  const result=replaceInterval(projected.rows,effectiveBefore,after);
  return resultFor(state,command,result,at,before,changes);
}
export function previewLogbookInsertOverride(state,{day,event,expectedRows},at=new Date()) {
  const command={day,event}, rows=state.eventsByDay?.[day]||[];
  if(expectedRows&&!equal(rows,expectedRows))return {ok:false,error:'The day changed while Insert was open. Reopen it before saving.'};
  if(!event?.id||rows.some(e=>e?.id===event.id))return {ok:false,error:'The new event requires a unique ID. Reopen Insert.'};
  if(!['OFF','SB','D','ON'].includes(event.status))return {ok:false,error:'Choose a valid duty status.'};
  const error=editorRangeError(event.startMin,event.endMin);if(error)return {ok:false,error};
  const projected=elapsedRows(state,day,at), result=replaceInterval(projected.rows,null,{...event,source:'manual'});
  if(!result.ok)return result;
  const live=projected.live;
  if(live&&event.endMin>live.startMin) {
    const raw=rows.find(e=>active(e)&&e.id===live.id);
    const left=result.events.find(e=>active(e)&&e.id===live.id&&e.startMin<event.startMin);
    const right=result.events.find(e=>active(e)&&e.startMin===event.endMin&&(e.id===live.id||e.splitFromEventId===live.id));
    const used=new Set(result.events.map(e=>e?.id));
    let leftId=`${live.id}__before_${event.id}_${event.startMin}`,n=2;while(used.has(leftId))leftId=`${live.id}__before_${event.id}_${event.startMin}_${n++}`;
    result.events=result.events.map(e=>e===left?{...e,id:leftId,splitFromEventId:live.id}:e===right?{...e,id:live.id,source:raw.source}:e);
    if(!right)result.events.push({...raw,startMin:event.endMin,endMin:event.endMin+1,...(left&&Number(raw.manualMiles)>0?{manualMiles:0,manualMilesNeedsReview:true}:{})});
    // At 24:00 there is no remaining interval in this day to resume.
    result.events=result.events.filter(e=>!active(e)||e.startMin<1440).sort((a,b)=>(a?.startMin??1441)-(b?.startMin??1441));
  }
  return resultFor(state,command,result,at);
}
function commit(state,command,result,at,kind) {
  if(!result.ok||!result.changed)return result;
  let next=result.state;
  if(kind==='insert'||['status','startMin','endMin'].some(key=>Object.hasOwn(command.patch||{},key))) {
    const history=state.logbookEditHistoryByDay?.[command.day]||[];
    const entry={kind,targetId:command.id||command.event.id,editedAt:at.toISOString(),changedIds:result.changedIds,beforeEvents:structuredClone(state.eventsByDay?.[command.day]||[]),afterEvents:structuredClone(result.events)};
    next={...next,logbookEditHistoryByDay:{...state.logbookEditHistoryByDay,[command.day]:[...history,entry]}};
  }
  return {...result,state:next};
}
export function applyLogbookEditorEdit(state,command,at=new Date()){return commit(state,command,previewLogbookEditorOverride(state,command,at),at,'edit');}
export function applyLogbookEditorInsert(state,command,at=new Date()){return commit(state,command,previewLogbookInsertOverride(state,command,at),at,'insert');}
