// Read-only property-carrier split-sleeper review. A calendar boundary only
// clips the displayed ranges; it never completes or abandons a rest period.
// FMCSA 395.1(g), 2020 FAQ03 and the July 2026 FAQ07/FAQ22 guidance.
const DRIVE=660, SHIFT=840, TOTAL=600, SHORT=120, LONG=420;
const rest=event=>event.status==='OFF'||event.status==='SB';
const duty=event=>event.status==='ON'||event.status==='D';
const overlap=(a,b)=>a.startAbs<b.endAbs&&b.startAbs<a.endAbs;
const label=minutes=>`${Math.floor(minutes/60)}h${minutes%60?` ${minutes%60}m`:''}`;
const duration=period=>Math.max(0,period.endAbs-period.startAbs);
// UI consumers often request the identical observed minute several times.
// This bounded in-memory memo never persists records or survives a reload.
const reviewMemo=new Map();

export function observedHosTimeline(timeline=[],nowAbs=0) {
  const rows=timeline.filter(Boolean).map(event=>({...event,
    startAbs:Number(event.startAbs),endAbs:Math.min(Number(event.endAbs),nowAbs),
  })).filter(event=>Number.isFinite(event.startAbs)&&Number.isFinite(event.endAbs)
    &&event.startAbs<nowAbs&&event.endAbs>event.startAbs)
    .sort((a,b)=>a.startAbs-b.startAbs||a.endAbs-b.endAbs);
  // Match the established live-status clock carry on the first reopen after
  // midnight, before a new-day row exists. Manual rows and a saved End stay
  // bounded; missing days after a deliberately closed period are not rest.
  const tail=rows.at(-1);
  if(tail&&rest(tail)&&tail.endAbs<nowAbs
    &&!tail.manualEndLocked&&!tail.explicitEndLocked&&!tail.paperLogEndV110315
    &&!tail.syntheticCoverage
    &&(/live_status|current_status|status_workflow|driver_workflow/.test(String(tail.source||''))
      ||tail.liveStatus===true||tail.active===true)) {
    tail.endAbs=nowAbs;
    tail.derivedForSplitReview=true;
  }
  return rows;
}

function sumDriving(rows,start,end) {
  return rows.reduce((sum,event)=>sum+(event.status==='D'
    ?Math.max(0,Math.min(end,event.endAbs)-Math.max(start,event.startAbs)):0),0);
}

function restPeriods(rows) {
  const blocks=[];
  let block=null,sleeper=null;
  for(const event of rows) {
    const unknown=event.syntheticCoverage&&/timeline_continuity|display/.test(String(event.source||''));
    if(!rest(event)||unknown) {block=null;sleeper=null;continue;}
    // Never bridge even one recorded minute of work or a genuine gap.
    if(!block||event.startAbs>block.endAbs) {
      block={id:`rest_${event.startAbs}`,kind:'rest',startAbs:event.startAbs,
        endAbs:event.endAbs,events:[],statuses:new Set(),sleeperPeriods:[]};
      blocks.push(block);sleeper=null;
    }
    block.endAbs=Math.max(block.endAbs,event.endAbs);
    block.events.push(event);block.statuses.add(event.status);
    if(event.status==='SB') {
      if(!sleeper||event.startAbs>sleeper.endAbs) {
        sleeper={id:`sleeper_${event.startAbs}`,kind:'sleeper',startAbs:event.startAbs,
          endAbs:event.endAbs,events:[],statuses:new Set(['SB']),blockId:block.id};
        block.sleeperPeriods.push(sleeper);
      }
      sleeper.endAbs=Math.max(sleeper.endAbs,event.endAbs);sleeper.events.push(event);
    } else sleeper=null;
  }
  const clean=blocks.filter(b=>!rows.some(e=>duty(e)&&overlap(e,b)));
  const byBounds=new Map();
  function add(period,isLong=false) {
    const key=`${period.startAbs}:${period.endAbs}`,old=byBounds.get(key);
    if(old) {old.longEligible ||= isLong;return;}
    byBounds.set(key,{...period,id:key,duration:duration(period),longEligible:isLong,
      allSleeper:period.statuses.size===1&&period.statuses.has('SB')});
  }
  for(const b of clean) {
    b.duration=duration(b);
    if(b.duration>=SHORT)add(b);
    for(const sb of b.sleeperPeriods)if(duration(sb)>=LONG)add(sb,true);
    // FAQ22 explicitly permits a ten-hour rest containing seven continuous
    // hours in SB to be paired as well as used for a full reset.
    if(b.duration>=TOTAL&&b.sleeperPeriods.some(sb=>duration(sb)>=LONG))add(b,true);
  }
  return {blocks:clean,periods:[...byBounds.values()].sort((a,b)=>a.endAbs-b.endAbs||a.startAbs-b.startAbs)};
}

function usage(rows,pair,at) {
  const start=pair.first.endAbs,end=Math.max(start,at);
  const excluded=pair.second||pair.partnerBlock;
  const excludedMinutes=excluded?Math.max(0,Math.min(end,excluded.endAbs)-Math.max(start,excluded.startAbs)):0;
  const drive=sumDriving(rows,start,end)+(pair.pending?pair.driveBeforeFirst:0);
  const shift=Math.max(0,end-start-excludedMinutes)+(pair.pending?pair.shiftBeforeFirst:0);
  return {driveUsedMinutes:drive,shiftUsedMinutes:shift,
    driveRemainingMinutes:Math.max(0,DRIVE-drive),shiftRemainingMinutes:Math.max(0,SHIFT-shift),
    driveExpired:drive>DRIVE,shiftExpired:shift>SHIFT};
}

function standardLimitRanges(rows,blocks) {
  const ranges=[];
  for(const event of rows) {
    if(event.status!=='D')continue;
    const reset=blocks.filter(b=>b.duration>=TOTAL&&b.endAbs<=event.startAbs)
      .sort((a,b)=>b.endAbs-a.endAbs)[0];
    const floor=reset?.endAbs??rows[0]?.startAbs??event.startAbs;
    const firstWork=rows.find(e=>duty(e)&&e.endAbs>floor&&e.startAbs<=event.startAbs);
    const used=sumDriving(rows,floor,event.startAbs);
    const driveStart=event.startAbs+Math.max(0,DRIVE-used);
    if(driveStart<event.endAbs)ranges.push({type:'drive11',startAbs:driveStart,endAbs:event.endAbs});
    const shiftStart=Math.max(event.startAbs,Math.max(floor,firstWork?.startAbs??event.startAbs)+SHIFT);
    if(shiftStart<event.endAbs)ranges.push({type:'window14',startAbs:shiftStart,endAbs:event.endAbs});
  }
  return ranges;
}

function pathScore(path,context,at) {
  const key=`${at}|${path.map(p=>p.id+':'+p.driveBeforeFirst+':'+p.shiftBeforeFirst).join('|')}`;
  if(context.scores.has(key))return context.scores.get(key);
  const coverage=coverageForPairs(path,context.rows,at);
  const fragments={drive11:[],window14:[]};
  for(const range of context.standard) {
    if(range.startAbs>=at)continue;
    fragments[range.type].push(...uncovered(range.startAbs,Math.min(at,range.endAbs),coverage[range.type]));
  }
  const counts=[0,0,0];
  for(const type of ['drive11','window14'])for(const [s,e] of mergeIntervals(fragments[type])) {
    const minutes=e-s;
    counts[minutes>180?0:minutes>=15?1:2]++;
  }
  const tail=path.at(-1);
  const u=tail?usage(context.rows,tail,at):null;
  const reset=context.blocks.filter(b=>b.duration>=TOTAL&&b.startAbs+TOTAL<=at)
    .sort((a,b)=>b.endAbs-a.endAbs)[0];
  const floor=reset?.endAbs??context.rows[0]?.startAbs??at;
  const firstWork=context.rows.find(e=>duty(e)&&e.endAbs>floor&&e.startAbs<at);
  const standardDrive=Math.max(0,DRIVE-sumDriving(context.rows,floor,at));
  const standardShift=Math.max(0,SHIFT-(firstWork?at-Math.max(firstWork.startAbs,floor):0));
  const standardAvailable=Math.min(standardDrive,standardShift);
  const available=Math.max(standardAvailable,u?Math.min(u.driveRemainingMinutes,u.shiftRemainingMinutes):0);
  const score=[...counts,-available,tail?.pending?1:0,-(tail?.recalculationAbs??-Infinity)];
  context.scores.set(key,score);return score;
}

function comparePaths(a,b,context,at) {
  const aa=pathScore(a,context,at),bb=pathScore(b,context,at);
  for(let i=0;i<aa.length;i++)if(aa[i]!==bb[i])return aa[i]-bb[i];
  return a.length-b.length;
}

function choosePath(paths,context,at) {
  let best=[];
  for(const path of paths)if(comparePaths(path,best,context,at)<0)best=path;
  return best;
}

function nondominatedContexts(contexts,scoring,at) {
  const ranked=contexts.map(c=>({...c,rank:pathScore(c.lineage,scoring,at).slice(0,3)}))
    .sort((a,b)=>a.drive-b.drive||a.shift-b.shift);
  const noWorse=(a,b)=>{
    for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]<b[i];
    return true;
  };
  const frontier=[];
  for(const candidate of ranked) {
    if(frontier.some(c=>c.drive<=candidate.drive&&c.shift<=candidate.shift&&noWorse(c.rank,candidate.rank)))continue;
    for(let i=frontier.length-1;i>=0;i--) {
      const c=frontier[i];
      if(candidate.drive<=c.drive&&candidate.shift<=c.shift&&noWorse(candidate.rank,c.rank))frontier.splice(i,1);
    }
    frontier.push(candidate);
  }
  return frontier;
}

function contextsBefore(rows,blocks,pairs,first,scoring) {
  const reset=blocks.filter(b=>b.duration>=TOTAL&&b.endAbs<=first.startAbs)
    .sort((a,b)=>b.endAbs-a.endAbs)[0];
  const floor=reset?.endAbs??rows[0]?.startAbs??first.startAbs;
  const firstWork=rows.find(e=>duty(e)&&e.endAbs>floor&&e.startAbs<first.startAbs);
  // Reset-separated proof history is still part of the same chosen lineage.
  // A fresh shift must not make an older correctly reviewed day turn red.
  const prior=choosePath(pairs.filter(p=>p.second.endAbs<=floor).map(p=>p.lineage),scoring,floor);
  const contexts=[{drive:sumDriving(rows,floor,first.startAbs),lineage:prior,
    shift:firstWork?Math.max(0,first.startAbs-Math.max(firstWork.startAbs,floor)):0}];
  // A full reset remains an available interpretation. The proof starts after
  // this rest, so it cannot remove any violation that preceded the reset.
  if(first.duration>=TOTAL)contexts.push({drive:0,shift:0,
    lineage:choosePath(pairs.filter(p=>p.second.endAbs<=first.endAbs).map(p=>p.lineage),scoring,first.endAbs)});
  for(const pair of pairs) {
    const endsBefore=pair.second.endAbs<=first.startAbs;
    const sharedRest=pair.second.startAbs>=first.startAbs&&pair.second.endAbs<=first.endAbs;
    if(!endsBefore&&!sharedRest)continue;
    if(pair.first.endAbs>first.startAbs)continue;
    const u=usage(rows,pair,first.startAbs);
    contexts.push({drive:u.driveUsedMinutes,shift:u.shiftUsedMinutes,lineage:pair.lineage});
  }
  return nondominatedContexts(contexts,scoring,first.startAbs);
}

function pairRoles(first,second) {
  if(first.endAbs>second.startAbs||first.duration+second.duration<TOTAL)return null;
  if(first.longEligible&&second.duration>=SHORT)return {firstRole:'long',secondRole:'short'};
  if(second.longEligible&&first.duration>=SHORT)return {firstRole:'short',secondRole:'long'};
  return null;
}

function completedPairs(rows,blocks,periods,scoring) {
  const pairs=[],contextCache=new Map(),earliestPartnerEnd=new Map();
  for(const second of periods)for(const first of periods) {
    const roles=pairRoles(first,second);if(!roles)continue;
    // Once an earlier qualifying partner is complete, a later partner whose
    // intervening window already exceeds14h cannot authorize any additional
    // post-partner driving. The earlier pair also covers at least the same
    // pre-partner prefix. This is dominance, not a historical time cutoff.
    if(second.startAbs-first.endAbs>SHIFT
      &&(earliestPartnerEnd.get(first.id)??Infinity)<=second.startAbs)continue;
    const driveBetween=sumDriving(rows,first.endAbs,second.startAbs);
    const shiftBetween=second.startAbs-first.endAbs;
    if(!contextCache.has(first.id))contextCache.set(first.id,contextsBefore(rows,blocks,pairs,first,scoring));
    const contexts=contextCache.get(first.id);
    if(!contexts.length)continue;
    const a={...first,role:roles.firstRole},b={...second,role:roles.secondRole};
    let best=null;
    for(const context of contexts) {
      const pair={id:`complete_${first.id}_${second.id}`,mode:'complete',complete:true,pending:false,
      first:a,second:b,longPeriod:roles.firstRole==='long'?a:b,
      shortPeriod:roles.firstRole==='short'?a:b,totalMinutes:first.duration+second.duration,
      recalculationAbs:first.endAbs,pairEndAbs:second.endAbs,excludedPeriods:[b],
      driveBeforeFirst:context.drive,shiftBeforeFirst:context.shift,driveBetween,shiftBetween,
      partnerRemainingMinutes:0,
      summary:`${label((roles.firstRole==='long'?a:b).duration)} SB + ${label((roles.firstRole==='short'?a:b).duration)} OFF/SB`};
      const candidate={...pair,lineage:[...context.lineage,pair]};
      if(!best||comparePaths(candidate.lineage,best.lineage,scoring,second.endAbs)<0)best=candidate;
    }
    pairs.push(best);
    earliestPartnerEnd.set(first.id,Math.min(earliestPartnerEnd.get(first.id)??Infinity,second.endAbs));
  }
  return pairs;
}

function pendingPairs(rows,blocks,periods,pairs,nowAbs,scoring) {
  if(!rows.length||rows.at(-1).endAbs<nowAbs)return [];
  const pending=[];
  for(const first of periods) {
    // Long completed resets already provide standard clocks; do not show an
    // unnecessary provisional condition for a fresh, unrestricted shift.
    if(first.duration>=TOTAL||first.endAbs>=nowAbs)continue;
    const role=first.longEligible?'short':'long';
    const minimum=Math.max(role==='long'?LONG:SHORT,TOTAL-first.duration);
    const possible=role==='long'
      ?blocks.flatMap(b=>b.sleeperPeriods)
      :blocks;
    const partner=possible.filter(b=>b.startAbs>=first.endAbs&&b.endAbs===nowAbs)
      .sort((a,b)=>b.startAbs-a.startAbs)[0]||null;
    const progress=partner?duration(partner):0;
    if(progress>=minimum)continue;
    for(const context of contextsBefore(rows,blocks,pairs,first,scoring)) {
      const candidate={id:`pending_${first.id}`,mode:'pending',complete:false,pending:true,
        first:{...first,role:first.longEligible?'long':'short'},second:null,
        longPeriod:first.longEligible?first:null,shortPeriod:first.longEligible?null:first,
        totalMinutes:first.duration+progress,recalculationAbs:first.endAbs,
        excludedPeriods:partner?[partner]:[],partnerBlock:partner,
        driveBeforeFirst:context.drive,shiftBeforeFirst:context.shift,
        partnerRole:role,partnerStatusRequirement:role==='long'?'SB':'OFF or SB',
        partnerMinimumMinutes:minimum,partnerProgressMinutes:progress,
        partnerRemainingMinutes:minimum-progress,
        summary:`${label(first.duration)} ${first.longEligible?'SB':'OFF/SB'} · ${label(minimum-progress)} ${role==='long'?'SB':'OFF/SB'} still required`};
      const current=usage(rows,candidate,nowAbs);
      if(current.driveExpired||current.shiftExpired)continue;
      // A missing minute or ended short attempt cannot be assumed to be the
      // continuing partner. Its elapsed time remains on the shift clock.
      pending.push({...candidate,...current,lineage:[...context.lineage,candidate]});
    }
  }
  return pending;
}

function proofSet(timeline,nowAbs,allowPending=true) {
  const rows=observedHosTimeline(timeline,nowAbs);
  const key=JSON.stringify([nowAbs,allowPending,rows]);
  if(reviewMemo.has(key))return reviewMemo.get(key);
  const {blocks,periods}=restPeriods(rows);
  const scoring={rows,blocks,standard:standardLimitRanges(rows,blocks),scores:new Map()};
  const completed=completedPairs(rows,blocks,periods,scoring);
  const pending=allowPending?pendingPairs(rows,blocks,periods,completed,nowAbs,scoring):[];
  const selected=choosePath([...completed,...pending].map(pair=>pair.lineage),scoring,nowAbs);
  const result={rows,blocks,completed:selected.filter(p=>p.complete),pending:selected.filter(p=>p.pending),selected};
  reviewMemo.set(key,result);
  if(reviewMemo.size>4)reviewMemo.delete(reviewMemo.keys().next().value);
  return result;
}

function bestSplit(proofs,at,nowAbs,historical=false) {
  const {rows,blocks}=proofs;
  const reset=blocks.filter(b=>b.duration>=TOTAL&&b.startAbs+TOTAL<=at)
    .sort((a,b)=>b.endAbs-a.endAbs)[0];
  const candidates=[...proofs.completed,...proofs.pending]
    .filter(pair=>pair.first.endAbs<=at)
    .filter(pair=>historical||!reset||(pair.pending?pair.first.startAbs:pair.second.startAbs)>=reset.endAbs)
    .map(pair=>({...pair,...usage(rows,pair,at)}));
  candidates.sort((a,b)=>{
    const av=Number(a.driveExpired)+Number(a.shiftExpired),bv=Number(b.driveExpired)+Number(b.shiftExpired);
    return av-bv||Math.min(b.driveRemainingMinutes,b.shiftRemainingMinutes)-Math.min(a.driveRemainingMinutes,a.shiftRemainingMinutes)
      ||Number(b.complete)-Number(a.complete)||b.recalculationAbs-a.recalculationAbs;
  });
  const selected=candidates[0];
  return selected?{supported:true,available:true,active:true,...structuredClone(selected)}:
    {supported:true,available:false,active:false,mode:'none',complete:false,pending:false,
      reason:'Need qualifying rest periods: at least 7h continuous SB and at least 2h OFF/SB, totaling 10h.'};
}

/** Shared live and historical split assessment; later observed rest may finish
 * a historical pair, while historical usage stays at the selected-day cutoff. */
export function evaluateSplitSleeperReview(timeline=[],at=0,options={}) {
  const nowAbs=Number(options.observedUntilAbs??at);
  const proofs=proofSet(timeline,nowAbs,options.allowPending!==false);
  return bestSplit(proofs,Math.min(at,nowAbs),nowAbs,at<nowAbs);
}

function driveDeadline(rows,start,limit,end) {
  let remaining=limit;
  for(const event of rows) {
    if(event.status!=='D')continue;
    const s=Math.max(start,event.startAbs),e=Math.min(end,event.endAbs);
    if(e<=s)continue;
    if(e-s>remaining)return s+remaining;
    remaining-=e-s;
  }
  return end;
}

function mergeIntervals(intervals) {
  const merged=[];
  for(const [start,end] of intervals.filter(([s,e])=>e>s).sort((a,b)=>a[0]-b[0])) {
    const last=merged.at(-1);
    if(last&&start<=last[1])last[1]=Math.max(last[1],end);else merged.push([start,end]);
  }
  return merged;
}

function uncovered(start,end,covered) {
  let fragments=[[start,end]];
  for(const [s,e] of covered)fragments=fragments.flatMap(([a,b])=>{
    if(e<=a||s>=b)return [[a,b]];
    const out=[];if(a<s)out.push([a,s]);if(e<b)out.push([e,b]);return out;
  });
  return fragments;
}

function coverageForPairs(pairs,rows,nowAbs) {
  const driveCoverage=[],shiftCoverage=[];
  for(const pair of pairs) {
    const start=pair.first.endAbs;
    if(pair.complete) {
      // A duration-qualified pair can coexist with a real violation. Keep
      // the excess around the first period; completing the partner changes
      // the calculation point only for the work after that partner.
      const beforeEnd=pair.second.startAbs;
      const beforeDrive=driveDeadline(rows,start,Math.max(0,DRIVE-pair.driveBeforeFirst),beforeEnd);
      driveCoverage.push([start,Math.min(beforeEnd,beforeDrive)]);
      shiftCoverage.push([start,Math.min(beforeEnd,start+Math.max(0,SHIFT-pair.shiftBeforeFirst))]);
      const afterStart=pair.second.endAbs;
      const afterDrive=driveDeadline(rows,start,DRIVE,nowAbs);
      driveCoverage.push([afterStart,Math.min(nowAbs,afterDrive)]);
      shiftCoverage.push([afterStart,Math.min(nowAbs,start+SHIFT+duration(pair.second))]);
    } else {
      const excluded=pair.partnerBlock;
      const shiftLimit=start+SHIFT-pair.shiftBeforeFirst+(excluded?duration(excluded):0);
      const driveLimit=driveDeadline(rows,start,DRIVE-pair.driveBeforeFirst,nowAbs);
      driveCoverage.push([start,Math.min(nowAbs,driveLimit)]);
      shiftCoverage.push([start,Math.min(nowAbs,shiftLimit)]);
    }
  }
  return {drive11:mergeIntervals(driveCoverage),window14:mergeIntervals(shiftCoverage)};
}

/** Only subtract proven legal portions from one consistent pairing lineage.
 * Alternative partners are never unioned. Independent warnings stay exact. */
export function reviewSplitHosRanges(ranges=[],timeline=[],options={}) {
  const dayStart=Number(options.dayStartAbs||0),dayEnd=Number(options.dayEndAbs??dayStart+1440);
  const nowAbs=Number(options.nowAbs??dayEnd);
  const proofs=proofSet(timeline,nowAbs,options.allowPending!==false);
  const relevant=proofs.selected.filter(pair=>proofs.rows.some(e=>e.status==='D'
    &&e.startAbs<dayEnd&&e.endAbs>dayStart&&e.endAbs>pair.first.endAbs));
  const covered=coverageForPairs(proofs.selected,proofs.rows,nowAbs);
  const adjusted=ranges.flatMap(range=>{
    if(!covered[range.type])return [range];
    const start=dayStart+Number(range.startMin),end=dayStart+Number(range.endMin);
    const pieces=uncovered(start,end,covered[range.type]);
    if(pieces.length===1&&pieces[0][0]===start&&pieces[0][1]===end)return [range];
    return pieces.map(([s,e],i)=>({...range,id:`${range.id||range.type}_split_${i}_${s}`,
      startMin:s-dayStart,endMin:e-dayStart}));
  });
  const relevantProofs={...proofs,completed:relevant.filter(p=>p.complete),pending:relevant.filter(p=>p.pending)};
  return {ranges:adjusted,split:bestSplit(relevantProofs,Math.min(dayEnd,nowAbs),nowAbs,dayEnd<nowAbs),
    pending:structuredClone(relevant.filter(pair=>pair.pending)),completed:structuredClone(relevant.filter(pair=>pair.complete))};
}
