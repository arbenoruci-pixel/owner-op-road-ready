import React from 'react';
import {calculateHosClocks,formatHosClockMinutes} from '../../core/hos/hosEngine.js';
import {useHosNow} from '../../shared/utils/useHosNow.js';

function tone(clock={}) {
  if(clock.requiresReview)return 'warn';
  if(clock.expired||clock.tone==='red')return 'bad';
  if(clock.conditional||clock.tone==='yellow')return 'warn';
  return 'ok';
}
export default function HosCompactClocks({state}) {
  const at=useHosNow();
  const hos=React.useMemo(()=>calculateHosClocks(state,at),[state,at]);
  const items=[hos.break,hos.effectiveDrive||hos.drive,hos.shift,hos.cycle].filter(Boolean);
  const rest=hos.reset?.currentRest,split=hos.splitSleeper;
  const issues=hos.quality?.issues||[];
  return <div className="hos-compact-card" aria-label="HOS clocks from recorded events">
    <div className="hos-compact-head"><b>HOS clocks</b><span>{hos.timeZone}</span></div>
    <div className="hos-compact-grid">{items.map(clock=><div key={clock.label} className={`hos-compact-item ${tone(clock)}`}>
      <span>{clock.label}</span><b>{clock.requiresReview?'Review':formatHosClockMinutes(clock.remainingMinutes)}</b>
      {clock.conditional&&!clock.requiresReview?<small>Conditional</small>:null}
    </div>)}</div>
    {issues.length?<details className="hos-evidence-review"><summary>Review {issues.length} HOS {issues.length===1?'item':'items'} before relying on available hours</summary>
      <ul>{issues.map((issue,i)=><li key={`${issue.code}-${i}`}>{issue.text}{issue.day?` (${issue.day})`:''}</li>)}</ul>
    </details>:null}
    {split?.pending?<div className="hos-restart-strip-v988 soon"><span><b>Split sleeper · conditional</b><em>Still need {formatHosClockMinutes(split.partnerRemainingMinutes)} {split.partnerRole==='long'?'continuous SB':'OFF/SB'} to complete the pair.</em></span></div>:split?.complete?<div className="hos-restart-strip-v988 complete"><span><b>Split sleeper complete</b><em>{split.summary}</em></span></div>:null}
    <div className={`hos-restart-strip-v988 ${!hos.quality?.confirmed?'soon':rest?.restartComplete?'complete':rest?'active':'idle'}`}>
      <span><b>34h restart</b><em>{rest?`Recorded continuous rest ${formatHosClockMinutes(rest.durationMinutes)}`:'Starts with recorded OFF / SB.'}</em></span>
      <strong>{!hos.quality?.confirmed?'Review':rest?.restartComplete?'Complete':rest?`In ${formatHosClockMinutes(rest.minutesTo34HourRestart)}`:'Waiting'}</strong>
    </div>
  </div>;
}
