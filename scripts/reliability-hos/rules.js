import {buildEvidenceTimeline,restBlocks,sumDuration,isDuty,isRest} from './timeline.js';
import {effectiveZone,zoneForLogDay,zonedParts,wallMinute,addDay,logDayBounds} from './timePolicy.js';
import {hosProfileAt} from './profile.js';
const H=60, DRIVE=11*H, SHIFT=14*H, BREAK=8*H;
const order = rows => rows.slice().sort((a,b) => a.startAbs-b.startAbs || a.endAbs-b.endAbs);
const span = (a,b) => Math.max(0,b-a);
const driveTime = (rows,a,b) => sumDuration(rows,a,b,row=>row.status==='D');
const restKey = b => `${b.startAbs}:${b.endAbs}`;

export function cyclePolicy(state = {}, options = {}) {
  let rule=null,ruleFrom=null,dayStartMinute=0,boundarySet=false;
  for (const bucket of [options,hosProfileAt(state,options.atAbs),state.carrierSettings,state.settings].filter(Boolean)) {
    if (!rule) {
      const raw = String(bucket.cycleRule || bucket.hosCycle || '');
      if (Number(bucket.cycleHours ?? bucket.hosCycleHours)===60 || Number(bucket.cycleDays ?? bucket.hosCycleDays)===7 || /60\s*\/?\s*7/.test(raw)) {rule={cycleHours:60,cycleDays:7};ruleFrom=bucket;}
      else if (Number(bucket.cycleHours ?? bucket.hosCycleHours)===70 || Number(bucket.cycleDays ?? bucket.hosCycleDays)===8 || /70\s*\/?\s*8/.test(raw)) {rule={cycleHours:70,cycleDays:8};ruleFrom=bucket;}
    }
    const boundary=Number(bucket.dutyDayStartMinute ?? bucket.logDayStartMinute);
    if (!boundarySet && Number.isInteger(boundary) && boundary>=0 && boundary<1440) {dayStartMinute=boundary;boundarySet=true;}
  }
  const profileConfirmed=!!rule&&ruleFrom.jurisdiction==='US_INTERSTATE_PROPERTY'&&!!ruleFrom.confirmedAt&&!!String(ruleFrom.source||'').trim()&&typeof ruleFrom.splitSleeperEnabled==='boolean';
  return {...(rule || {cycleHours:70,cycleDays:8}),dayStartMinute,profileConfirmed};
}
export function cycleAt(timeline,atAbs,state={},options={}) {
  const policy=cyclePolicy(state,{...options,atAbs}), zone=effectiveZone(state,new Date(atAbs*60000)), local=zonedParts(atAbs*60000,zone);
  const dutyDay=local.minute < policy.dayStartMinute ? addDay(local.day,-1) : local.day;
  const firstDay=addDay(dutyDay,1-policy.cycleDays), startZone=zoneForLogDay(state,firstDay);
  const boundary=wallMinute(firstDay,policy.dayStartMinute,startZone);
  const currentBoundary=wallMinute(dutyDay,policy.dayStartMinute,zone);
  const anchor=Date.parse(options.dutyDayAnchorAt || hosProfileAt(state,atAbs).dutyDayAnchorAt || state.carrierSettings?.dutyDayAnchorAt || '')/60000;
  if(Number.isFinite(anchor)) {
    const period=Math.floor((atAbs-anchor)/1440);
    boundary.value=anchor+(period+1-policy.cycleDays)*1440;
    currentBoundary.value=anchor+period*1440;
    boundary.issue=null;
  } else if(boundary.value!=null && currentBoundary.value!=null && currentBoundary.value-boundary.value!==(policy.cycleDays-1)*1440) boundary.issue='cycle_boundary_transition';
  const restart=restBlocks(timeline,atAbs).filter(b=>b.duration>=34*H).at(-1) || null;
  const windowStart=Math.max(boundary.value ?? -Infinity,restart ? restart.startAbs+34*H : -Infinity);
  const used=sumDuration(timeline,windowStart,atAbs,row=>isDuty(row.status));
  const historyComplete=!!restart || !!timeline.length && timeline[0].startAbs<=windowStart;
  return {...policy,historyComplete,usedMinutes:used,remainingMinutes:Math.max(0,policy.cycleHours*H-used),limitMinutes:policy.cycleHours*H,
    expired:used>policy.cycleHours*H,restartAbs:restart ? restart.startAbs+34*H : null,windowStartAbs:windowStart,dutyDay,dutyPeriodStartAbs:currentBoundary.value,usesFixedAnchor:Number.isFinite(anchor),boundaryIssue:boundary.issue};
}

function fullResetBefore(blocks,before=Infinity) {
  return blocks.filter(b=>b.duration>=10*H && b.startAbs+10*H<=before).at(-1) || null;
}
function standardContext(timeline,blocks,atAbs) {
  const reset=fullResetBefore(blocks,atAbs), resetAbs=reset ? reset.startAbs+10*H : -Infinity;
  const duty=timeline.find(row=>isDuty(row.status) && row.endAbs>resetAbs && row.startAbs<atAbs);
  const dutyStart=duty ? Math.max(duty.startAbs,resetAbs) : null;
  return {reset,resetAbs,dutyStart,driveUsed:driveTime(timeline,resetAbs,atAbs),shiftUsed:dutyStart==null?0:atAbs-dutyStart};
}
const longPeriod = b => b.longestSleeper>=7*H;
const qualifies = b => b.duration>=2*H;
function legalContext(before,betweenDrive,betweenShift) {
  return before.driveBefore+betweenDrive<=DRIVE && before.shiftBefore+betweenShift<=SHIFT;
}
function nondominated(contexts) {
  const ordered=contexts.slice().sort((a,b)=>a.driveBefore-b.driveBefore || a.shiftBefore-b.shiftBefore);
  return ordered.filter((x,i)=>!ordered.slice(0,i).some(y=>y.driveBefore<=x.driveBefore && y.shiftBefore<=x.shiftBefore));
}

// Candidate contexts propagate from a completed pair to its second period.
// This permits repeated 8/2 or 7/3 pairs without discarding the earlier lawful
// recalculation point. Full 10h periods remain available as both reset and pair.
export function splitPlans(timeline,throughAbs) {
  const blocks=restBlocks(timeline,throughAbs), eligible=blocks.filter(qualifies), contexts=new Map(), pairs=[];
  for (const b of eligible) {
    const base=standardContext(timeline,blocks,b.startAbs);
    contexts.set(restKey(b),[{driveBefore:base.driveUsed,shiftBefore:base.shiftUsed,anchor:base.resetAbs}]);
    if (b.duration>=10*H) contexts.get(restKey(b)).push({driveBefore:0,shiftBefore:0,anchor:b.endAbs,fullReset:true});
  }
  for (let j=0;j<eligible.length;j++) {
    const second=eligible[j];
    for (let i=0;i<j;i++) {
      const first=eligible[i];
      if (first.endAbs>second.startAbs || first.duration+second.duration<10*H || !(longPeriod(first)||longPeriod(second))) continue;
      const betweenDrive=driveTime(timeline,first.endAbs,second.startAbs),betweenShift=second.startAbs-first.endAbs;
      const admissible=nondominated(contexts.get(restKey(first))).filter(c=>legalContext(c,betweenDrive,betweenShift));
      if (!admissible.length) continue;
      pairs.push({first,second,contexts:admissible,driveBetween:betweenDrive,shiftBetween:betweenShift,totalMinutes:first.duration+second.duration});
      contexts.get(restKey(second)).push({driveBefore:betweenDrive,shiftBefore:betweenShift,anchor:first.endAbs,previousPair:{first,second}});
    }
    contexts.set(restKey(second),nondominated(contexts.get(restKey(second))));
  }
  return {blocks,eligible,pairs,contexts};
}

function requirement(first) {
  return longPeriod(first)
    ? {role:'short',minimumMinutes:Math.max(2*H,10*H-first.duration),statusRequirement:'OFF/SB'}
    : {role:'long',minimumMinutes:Math.max(7*H,10*H-first.duration),statusRequirement:'SB'};
}
function pendingCandidates(timeline,atAbs,plans) {
  const candidates=[];
  for (const first of plans.eligible.filter(b=>b.endAbs<=atAbs)) {
    const partner=requirement(first);
    const ongoing=plans.blocks.find(b=>b.startAbs>=first.endAbs && b.startAbs<atAbs && b.endAbs>=atAbs);
    // A short-first partner needs continuous SB. Other rest is still truthful
    // non-driving time, but cannot pause the pending 7h partner calculation.
    const usable=ongoing && (partner.role==='short' || ongoing.allSleeper) ? ongoing : null;
    const afterEnd=usable ? usable.startAbs : atAbs;
    const afterDrive=driveTime(timeline,first.endAbs,afterEnd),afterShift=afterEnd-first.endAbs;
    for (const context of plans.contexts.get(restKey(first)) || []) {
      if (!legalContext(context,afterDrive,afterShift)) continue;
      candidates.push({mode:'pending',available:true,pending:true,complete:false,first,second:null,context,
        driveUsed:context.driveBefore+afterDrive,shiftUsed:context.shiftBefore+afterShift,recalculationAbs:first.endAbs,
        partnerRole:partner.role,partnerMinimumMinutes:partner.minimumMinutes,partnerProgressMinutes:usable?atAbs-usable.startAbs:0,
        partnerRemainingMinutes:Math.max(0,partner.minimumMinutes-(usable?atAbs-usable.startAbs:0)),excludedPeriods:usable?[usable]:[],
        summary:`${labelMinutes(first.duration)} ${longPeriod(first)?'SB':'OFF/SB'} · need ${labelMinutes(partner.minimumMinutes)} ${partner.statusRequirement}`});
    }
  }
  return candidates;
}

function breakAt(timeline,atAbs) {
  let drive=0,nonDriveStart=null,previousEnd=null,lastBreakAbs=null;
  for (const row of timeline) {
    const s=row.startAbs,e=Math.min(atAbs,row.endAbs);if(e<=s)continue;
    if (previousEnd!=null && s!==previousEnd) nonDriveStart=null;
    if (row.status==='D') {drive+=e-s;nonDriveStart=null;}
    else {
      if(nonDriveStart==null)nonDriveStart=s;
      if(e-nonDriveStart>=30){drive=0;lastBreakAbs=nonDriveStart+30;}
    }
    previousEnd=e;
  }
  return {usedMinutes:drive,remainingMinutes:Math.max(0,BREAK-drive),limitMinutes:BREAK,requiresBreakBeforeDriving:drive>=BREAK,expired:drive>BREAK,lastBreakAbs};
}
function proposal(first,second,driveUsed,shiftUsed,extra={}) {
  return {mode:'complete',available:true,complete:true,pending:false,first,second,driveUsed,shiftUsed,recalculationAbs:first.endAbs,
    totalMinutes:first.duration+second.duration,excludedPeriods:[second],summary:`${labelMinutes(first.duration)} ${longPeriod(first)?'SB':'OFF/SB'} + ${labelMinutes(second.duration)} ${longPeriod(second)?'SB':'OFF/SB'}`,...extra};
}
function score(p) {
  const driveLeft=DRIVE-p.driveUsed,shiftLeft=SHIFT-p.shiftUsed;
  return {violations:Number(driveLeft<0)+Number(shiftLeft<0),available:Math.min(driveLeft,shiftLeft),total:driveLeft+shiftLeft};
}
function choose(proposals) {
  return proposals.slice().sort((a,b)=> {
    const x=score(a),y=score(b);
    return x.violations-y.violations || y.available-x.available || y.total-x.total || Number(a.pending)-Number(b.pending);
  })[0];
}

export function clocksAt(timeline,atAbs,state={},options={}) {
  const blocks=restBlocks(timeline,atAbs),standard=standardContext(timeline,blocks,atAbs);
  const baseline={mode:'standard',available:false,pending:false,complete:false,driveUsed:standard.driveUsed,shiftUsed:standard.shiftUsed,recalculationAbs:standard.resetAbs};
  const throughAbs=Math.max(atAbs,options.evidenceThroughAbs ?? atAbs),plans=options.plans || splitPlans(timeline,throughAbs),proposals=[baseline];
  if (options.splitSleeperEnabled !== false && hosProfileAt(state,atAbs).splitSleeperEnabled !== false) {
    for (const pair of plans.pairs) {
      const {first,second}=pair;
      if (first.endAbs>atAbs) continue;
      if (second.endAbs<=atAbs) proposals.push(proposal(first,second,pair.driveBetween+driveTime(timeline,second.endAbs,atAbs),pair.shiftBetween+span(second.endAbs,atAbs)));
      else {
        const afterEnd=Math.min(atAbs,second.startAbs),d=driveTime(timeline,first.endAbs,afterEnd),s=span(first.endAbs,afterEnd);
        for (const context of pair.contexts) if(legalContext(context,d,s)) proposals.push(proposal(first,second,context.driveBefore+d,context.shiftBefore+s,{mode:'validated-partner',validatedAfterDay:true,context}));
      }
    }
    if (options.allowPendingSplitSleeper !== false) {
      const futurePending=pendingCandidates(timeline,throughAbs,plans);
      const validKeys=new Set(futurePending.map(p=>restKey(p.first)));
      const localPlans=throughAbs===atAbs?plans:splitPlans(timeline,atAbs);
      for (const p of pendingCandidates(timeline,atAbs,localPlans)) if(validKeys.has(restKey(p.first)))proposals.push(p);
    }
  }
  const selected=choose(proposals),cycle=cycleAt(timeline,atAbs,state,options),breakClock=breakAt(timeline,atAbs);
  const drive={label:'DRIVE',usedMinutes:selected.driveUsed,remainingMinutes:Math.max(0,DRIVE-selected.driveUsed),limitMinutes:DRIVE,expired:selected.driveUsed>DRIVE,resetAbs:Number.isFinite(selected.recalculationAbs)?selected.recalculationAbs:null};
  const shift={label:'SHIFT',usedMinutes:selected.shiftUsed,remainingMinutes:Math.max(0,SHIFT-selected.shiftUsed),limitMinutes:SHIFT,expired:selected.shiftUsed>SHIFT,shiftStartAbs:standard.dutyStart};
  cycle.label='CYCLE';breakClock.label='BREAK';
  for(const clock of [drive,shift,cycle,breakClock])clock.tone=clock.remainingMinutes<=0?'red':clock.remainingMinutes<=60?'yellow':'green';
  const limits=[['drive',drive],['shift',shift],['break',breakClock],['cycle',cycle]];
  const [limiting]=limits.slice().sort((a,b)=>a[1].remainingMinutes-b[1].remainingMinutes);
  const effectiveDrive={...drive,kind:'effectiveDrive',rawRemainingMinutes:drive.remainingMinutes,rawUsedMinutes:drive.usedMinutes,
    remainingMinutes:Math.min(...limits.map(([,c])=>c.remainingMinutes)),limitedBy:limiting[0],limitedByLabel:{drive:'11-hour drive clock',shift:'14-hour shift window',break:'30-minute break clock',cycle:'cycle clock'}[limiting[0]],
    blockers:limits.filter(([,c])=>c.remainingMinutes<=0).map(([key])=>key),blockerLabels:limits.filter(([,c])=>c.remainingMinutes<=0).map(([key])=>({drive:'11-hour drive clock',shift:'14-hour shift window',break:'30-minute break clock',cycle:'cycle clock'})[key])};
  effectiveDrive.expired=effectiveDrive.remainingMinutes<=0;effectiveDrive.tone=effectiveDrive.expired?'red':effectiveDrive.remainingMinutes<=60?'yellow':'green';effectiveDrive.effectiveRemainingMinutes=effectiveDrive.remainingMinutes;
  const currentRest=blocks.find(b=>b.startAbs<atAbs && b.endAbs>=atAbs) || null;
  const split=selected.available?{...selected,supported:true,enabled:true,active:true,driveUsedMinutes:selected.driveUsed,shiftUsedMinutes:selected.shiftUsed,driveRemainingMinutes:drive.remainingMinutes,shiftRemainingMinutes:shift.remainingMinutes,driveExpired:drive.expired,shiftExpired:shift.expired,pairEndAbs:selected.second?.endAbs,partnerRemainingMinutes:selected.partnerRemainingMinutes || 0}:{supported:true,enabled:false,available:false,mode:'none'};
  return {drive,shift,cycle,break:breakClock,effectiveDrive,splitSleeper:split,standard,proposals,
    reset:{last10HourResetAbs:standard.reset ? standard.reset.startAbs+10*H:null,fullReset:standard.reset,currentRest:currentRest?{...currentRest,durationMinutes:currentRest.duration,minutesTo10HourReset:Math.max(0,600-currentRest.duration),minutesTo34HourRestart:Math.max(0,2040-currentRest.duration),restartAtAbs:currentRest.startAbs+2040,restartComplete:currentRest.duration>=2040,status:currentRest.allSleeper?'SB':'OFF'}:null}};
}

export function labelMinutes(value=0) {const n=Math.max(0,Math.round(value)),h=Math.floor(n/60),m=n%60;return h&&m?`${h}h ${m}m`:h?`${h}h`:`${m}m`;}
function rangeFor(event,startAbs,endAbs,type,text,severity='high') {
  if(endAbs<=startAbs)return null;
  const s=zonedParts(startAbs*60000,event.logTimeZone),e=zonedParts(endAbs*60000,event.logTimeZone);
  return {id:`${type}_${event.id}_${startAbs}`,eventId:event.id,status:event.status,day:event.dayKey,startMin:s.day===event.dayKey?s.minute:0,endMin:endAbs===event.logDayEndAbs?1440:e.day===event.dayKey?e.minute:1440,startAbs,endAbs,type,text,severity};
}

export function violationRanges(context,day,options={}) {
  const ranges=[],plans=splitPlans(context.timeline,context.nowAbs);
  for(const row of context.timeline.filter(e=>e.status==='D' && e.dayKey===day)) {
    // Segment at a non-midnight duty-day boundary so recapture takes effect once.
    const policy=cyclePolicy(context.state,{...options,atAbs:row.startAbs}),boundary=wallMinute(day,policy.dayStartMinute,row.logTimeZone).value;
    const profileBoundaries=(context.state.hosProfileHistory||[]).map(p=>Date.parse(p.effectiveAt)/60000).filter(m=>m>row.startAbs&&m<row.endAbs);
    const policyPoints=[row.startAbs,...profileBoundaries,row.endAbs].sort((a,b)=>a-b),cycleBoundaries=[];
    for(let i=0;i<policyPoints.length-1;i++){
      const cycle=cycleAt(context.timeline,policyPoints[i],context.state,options);
      if(cycle.usesFixedAnchor)for(let next=cycle.dutyPeriodStartAbs+1440;next<policyPoints[i+1];next+=1440)cycleBoundaries.push(next);
      else if(boundary>policyPoints[i]&&boundary<policyPoints[i+1])cycleBoundaries.push(boundary);
    }
    const points=[...new Set([...policyPoints,...cycleBoundaries])].sort((a,b)=>a-b);
    for(let i=0;i<points.length-1;i++) {
      const s=points[i],en=points[i+1],hos=clocksAt(context.timeline,s,context.state,{...options,evidenceThroughAbs:context.nowAbs,plans});
      for(const [type,clock,label] of [['drive11',hos.drive,'11-hour driving limit'],['window14',hos.shift,'14-hour driving window'],['break8',hos.break,'30-minute interruption required'],[`cycle${hos.cycle.cycleHours}`,hos.cycle,`${hos.cycle.cycleHours}/${hos.cycle.cycleDays} cycle driving limit`]]) {
        const start=s+clock.remainingMinutes;
        if(en>start) {
          const dependencyStart=type.startsWith('cycle')?hos.cycle.windowStartAbs:type==='break8'?(hos.break.lastBreakAbs??context.timeline[0]?.startAbs):(hos.drive.resetAbs??context.timeline[0]?.startAbs);
          const ruleUncertain=!hos.cycle.profileConfirmed || type.startsWith('cycle')&&(!hos.cycle.historyComplete || !!hos.cycle.boundaryIssue);
          const uncertainty=ruleUncertain || context.issues.some(issue => issue.endAbs==null || issue.endAbs>dependencyStart && issue.startAbs<en);
          const range=rangeFor(row,Math.max(s,start),en,type,label,uncertainty?'medium':'high');
          if(range && uncertainty)Object.assign(range,{potentialType:type,type:`review_${type}`,reviewRequired:true,text:`Potential ${label.toLowerCase()}; ${ruleUncertain?'the carrier profile or cycle boundary':'recorded time'} requires review.`});
          ranges.push(range);
        }
      }
    }
  }
  for(const issue of context.issues.filter(i=>i.day===day))ranges.push({id:`review_${issue.code}_${issue.eventId || issue.startAbs}`,eventId:issue.eventId,status:'UNKNOWN',startMin:issue.startMin??0,endMin:issue.endMin??1440,type:issue.code,text:issue.text,severity:'medium',reviewRequired:true});
  return ranges.filter(Boolean);
}

function qualityFor(context,computed) {
  const issues=context.issues.slice();
  if(!context.timeline.length)issues.push({code:'no_recorded_events',day:context.nowDay,text:'Recorded duty events are required to calculate available hours.'});
  else if(!computed.cycle.historyComplete)issues.push({code:'cycle_history_incomplete',day:context.nowDay,text:`The ${computed.cycle.cycleDays}-day cycle history is incomplete. Review prior duty days or a supported 34-hour restart.`});
  if(computed.cycle.boundaryIssue)issues.push({code:computed.cycle.boundaryIssue,day:context.nowDay,text:'A clock or terminal change affects the cycle boundary. Confirm the carrier’s consecutive 24-hour duty periods before relying on cycle hours.'});
  if(!computed.cycle.profileConfirmed)issues.push({code:'cycle_profile_unconfirmed',day:context.nowDay,text:'70/8 is the existing default. Confirm the carrier cycle profile before relying on cycle availability.'});
  return {confirmed:issues.length===0,issues};
}

export function calculateReliableHos(state={},at=new Date(),options={}) {
  const context=buildEvidenceTimeline(state,at,options),computed=clocksAt(context.timeline,context.nowAbs,state,options),warnings=[];
  const quality=qualityFor(context,computed),qualityIssues=quality.issues;
  for(const issue of qualityIssues)warnings.push({type:issue.code,severity:'high',text:issue.text,reviewRequired:true});
  if(computed.splitSleeper.pending)warnings.push({type:'splitPending',severity:'medium',text:`Conditional split hours. Still need ${labelMinutes(computed.splitSleeper.partnerRemainingMinutes)} ${computed.splitSleeper.partnerRole==='long'?'Sleeper Berth':'OFF/SB'} to complete the pair.`});
  if(computed.effectiveDrive.remainingMinutes<=0)warnings.push({type:'legalDrive',severity:'high',text:`Driving availability reached zero: ${computed.effectiveDrive.limitedByLabel}.`});
  const effectiveDrive={...computed.effectiveDrive,requiresReview:qualityIssues.length>0};
  for(const clock of [computed.break,computed.drive,computed.shift,computed.cycle])clock.requiresReview=qualityIssues.length>0;
  computed.drive.conditional=computed.shift.conditional=effectiveDrive.conditional=!!computed.splitSleeper.pending;
  const clocks=[computed.break,effectiveDrive,computed.shift,computed.cycle];
  return {...computed,effectiveDrive,clocks,displayClocks:clocks,warnings,advisory:true,source:'recorded-duty-events',currentStatus:context.currentStatus,
    nowAbs:context.nowAbs,nowMinute:context.nowMinute,nowDay:context.nowDay,timeZone:context.timeZone,generatedAt:new Date(at).toISOString(),timeline:context.timeline,
    quality,context};
}

export function reviewReliableHos(eventsByDay,day,certifyStatus={},options={}) {
  const state={...(options.state || {}),eventsByDay,certifyStatus},at=options.now || new Date(),context=buildEvidenceTimeline(state,at,{...options,reviewDay:day});
  const bounds=logDayBounds(state,day),cutoff=Math.min(bounds.endAbs,context.nowAbs),h=clocksAt(context.timeline,cutoff,state,{...options,evidenceThroughAbs:context.nowAbs});
  const violations=violationRanges(context,day,options),quality=qualityFor(context,h),high=violations.filter(r=>r.severity==='high'),warnings=violations.map(r=>({severity:r.severity,text:r.text,eventId:r.eventId,type:r.type}));
  for(const issue of quality.issues)if(!warnings.some(w=>w.type===issue.code))warnings.push({severity:'medium',type:issue.code,text:issue.text,reviewRequired:true});
  const shiftViolation=high.some(r=>r.type==='window14'),cycleViolation=high.some(r=>/^cycle/.test(r.type));
  if(certifyStatus[day]!=='Certified')warnings.push({severity:'low',text:'Day is not certified.'});
  return {cards:[
    {label:'Reset',value:h.splitSleeper.complete?'Split OK':h.splitSleeper.pending?'Split pending':h.reset.fullReset?'10h OK':'Review',sub:h.splitSleeper.summary || '',ok:!!h.reset.fullReset || h.splitSleeper.complete},
    {label:'11h Drive',value:`${labelMinutes(h.drive.usedMinutes)} used`,sub:`${labelMinutes(h.drive.remainingMinutes)} left`,ok:!high.some(r=>r.type==='drive11')},
    {label:'14h Window',value:shiftViolation?'Violation':h.shift.remainingMinutes===0?'Expired':`${labelMinutes(h.shift.usedMinutes)} used`,sub:shiftViolation?'Driving after limit':h.shift.remainingMinutes===0?'No driving after limit':`${labelMinutes(h.shift.remainingMinutes)} left`,ok:!shiftViolation},
    {label:'Break',value:h.break.requiresBreakBeforeDriving?'Needed':'OK',sub:`${labelMinutes(h.break.remainingMinutes)} to break`,ok:!high.some(r=>r.type==='break8')},
    {label:'Cycle',value:`${labelMinutes(h.cycle.usedMinutes)} / ${h.cycle.cycleHours}h`,sub:`${labelMinutes(h.cycle.remainingMinutes)} left`,ok:!cycleViolation},
    {label:'Split',value:h.splitSleeper.complete?'Complete':h.splitSleeper.pending?'Pending':'Available',sub:h.splitSleeper.summary || '7+ SB and 2+ OFF/SB, total 10h',ok:!!h.splitSleeper.complete || !!h.reset.fullReset}
  ],warnings,violationRanges:violations,split:h.splitSleeper.available?h.splitSleeper:null,fullReset:h.reset.fullReset,restProgress:h.reset.currentRest?{duration:h.reset.currentRest.durationMinutes,block:h.reset.currentRest}:null,cycle:{...h.cycle,used:h.cycle.usedMinutes,left:h.cycle.remainingMinutes,exceeded:h.cycle.expired},hos:h,quality};
}

export function previewHosImpact(before,after,day,at=new Date()) {
  const a=reviewReliableHos(before.eventsByDay || {},day,before.certifyStatus || {},{state:before,now:at}),b=reviewReliableHos(after.eventsByDay || {},day,after.certifyStatus || {},{state:after,now:at});
  const aRanges=a.violationRanges.filter(r=>r.severity==='high'),bRanges=b.violationRanges.filter(r=>r.severity==='high');
  return {day,timeZone:zoneForLogDay(before,day),before:a,after:b,
    clocks:['drive','shift','break','cycle'].map(key=>({key,before:a.hos[key].remainingMinutes,after:b.hos[key].remainingMinutes,delta:b.hos[key].remainingMinutes-a.hos[key].remainingMinutes})),
    violationMinutesBefore:aRanges.reduce((n,r)=>n+r.endMin-r.startMin,0),violationMinutesAfter:bRanges.reduce((n,r)=>n+r.endMin-r.startMin,0),
    requiresReview:!a.quality.confirmed || !b.quality.confirmed};
}
