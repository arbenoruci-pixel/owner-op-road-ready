import React from 'react';
import {COMMON_LOG_TIME_ZONES,getHomeTerminalTimeZone,timeZoneSettingSummary} from '../../core/time/homeTerminalTime.js';
import {previewTimeZoneChange} from '../../core/hos/reliability/timePolicy.js';

export default function TimeZoneSheet({state,onClose,onSave}) {
  const active=getHomeTerminalTimeZone(state),pending=state.homeTerminalTimeZoneChangeProposal;
  const [selected,setSelected]=React.useState(pending?.timeZone||active);
  const [effectiveDay,setEffectiveDay]=React.useState('');
  const [review,setReview]=React.useState(false);
  const plan=previewTimeZoneChange(state,selected,new Date(),effectiveDay?{effectiveLogDay:effectiveDay}:{});
  function choose(zone){setSelected(zone);setEffectiveDay('');setReview(false);}
  return <div className="sheet active timezone-sheet">
    <div className="sheet-head"><button onClick={onClose} aria-label="Close">‹</button><div>Home-terminal time zone</div><span /></div>
    <div className="choice-body">
      <div className="timezone-current-card"><span>Current log zone</span><b>{timeZoneSettingSummary(active)}</b><small>Existing log days retain their recorded time zone and event times.</small></div>
      {pending?<div className="hos-timezone-proposal"><b>Pending: {pending.timeZone}</b><p>Proposed start {pending.effectiveLogDay} · {pending.proposedEffectiveAt}. Activation is waiting for review of the actual event boundaries.</p></div>:null}
      <div className="timezone-list">{COMMON_LOG_TIME_ZONES.map(zone=><button type="button" key={zone.value} className={`timezone-option ${selected===zone.value?'active':''}`} aria-pressed={selected===zone.value} onClick={()=>choose(zone.value)}><b>{zone.label}</b><span>{zone.value}</span><em>{zone.example}</em></button>)}</div>
      <div className="timezone-custom-card"><label htmlFor="home-zone-proposal">IANA time zone</label><input id="home-zone-proposal" value={selected} onChange={event=>choose(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false}/></div>
      {selected!==active?<div className="hos-timezone-proposal">
        <label htmlFor="home-zone-day">Proposed first log day</label><input id="home-zone-day" type="date" value={effectiveDay||plan.effectiveLogDay||''} onChange={event=>{setEffectiveDay(event.target.value);setReview(false);}}/>
        {plan.ok?<><p>{plan.explanation}</p><p>Proposed instant: <b>{plan.effectiveAt}</b>.</p>{plan.transitionReview?<p>{Math.abs(plan.transitionMinutes)} minutes of {plan.transitionMinutes>0?'gap':'overlap'} between the two log-day boundaries require actual event evidence. No rest is added by this proposal.</p>:null}
          <p><b>This saves a pending proposal.</b> The active zone remains {active} until the rollover and event boundaries have been verified in the test version.</p>
          <button type="button" className="save-main" onClick={()=>setReview(true)}>Review proposal</button>
          {review?<button type="button" className="save-main" onClick={()=>onSave?.({timeZone:selected,plan})}>Save pending {selected} proposal</button>:null}
        </>:<p role="alert">{plan.error}</p>}
      </div>:null}
      {state.sheet?.error?<p role="alert">{state.sheet.error}</p>:null}
    </div>
  </div>;
}
