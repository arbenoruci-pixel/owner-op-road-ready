import React from 'react';
import {hosProfileAt,previewHosProfile} from '../../core/hos/reliability/profile.js';

export default function HosProfileSheet({state,onClose,onSave}) {
  const current=hosProfileAt(state),pending=state.hosProfileProposal;
  const [draft,setDraft]=React.useState(()=>({jurisdiction:current.jurisdiction||'',carrierOperatesEveryDay:current.carrierOperatesEveryDay,dayStartMinute:current.dutyDayStartMinute??0,anchorDay:'',splitSleeperEnabled:current.splitSleeperEnabled,source:'',...(pending||{})}));
  const [verified,setVerified]=React.useState(false);
  const plan=previewHosProfile(state,draft,new Date());
  const set=(key,value)=>{setDraft(s=>({...s,[key]:value}));setVerified(false);};
  const start=`${String(Math.floor(draft.dayStartMinute/60)).padStart(2,'0')}:${String(draft.dayStartMinute%60).padStart(2,'0')}`;
  return <div className="sheet active timezone-sheet">
    <div className="sheet-head"><button onClick={onClose} aria-label="Close">‹</button><div>HOS rule profile</div><span /></div>
    <div className="choice-body"><div className="hos-timezone-proposal">
      <p>Confirm the rules that apply to this carrier. A saved proposal keeps hours marked for review. A confirmed profile applies prospectively from the date below and preserves prior profile history.</p>
      <label>Jurisdiction and operation<select value={draft.jurisdiction} onChange={event=>set('jurisdiction',event.target.value)}><option value="">Needs verification</option><option value="US_INTERSTATE_PROPERTY">U.S. interstate · property-carrying</option><option value="OTHER">Other / exception requiring review</option></select></label>
      <label>Carrier operates commercial vehicles every day<select value={draft.carrierOperatesEveryDay===true?'yes':draft.carrierOperatesEveryDay===false?'no':''} onChange={event=>set('carrierOperatesEveryDay',event.target.value==='yes'?true:event.target.value==='no'?false:undefined)}><option value="">Needs verification</option><option value="yes">Yes · 70 hours / 8 days</option><option value="no">No · 60 hours / 7 days</option></select></label>
      <small>This concerns the carrier’s operation, not how many days this driver works.</small>
      <label>Carrier duty-day start ({plan.timeZone})<input type="time" value={start} onChange={event=>{const [h,m]=event.target.value.split(':').map(Number);set('dayStartMinute',h*60+m);}}/></label>
      <label>Confirmed anchor date for consecutive 24-hour periods<input type="date" value={draft.anchorDay||''} onChange={event=>set('anchorDay',event.target.value)}/></label>
      {plan.profile.dutyDayAnchorAt?<small>Anchor instant: {plan.profile.dutyDayAnchorAt}. Verify this with the carrier when DST or terminal changes affect the duty-day boundary.</small>:null}
      <label>Sleeper-berth split rule applies<select value={draft.splitSleeperEnabled===true?'yes':draft.splitSleeperEnabled===false?'no':''} onChange={event=>set('splitSleeperEnabled',event.target.value==='yes'?true:event.target.value==='no'?false:undefined)}><option value="">Needs verification</option><option value="yes">Yes · qualifying 7+ SB and 2+ OFF/SB, total 10h</option><option value="no">No · use the standard reset</option></select></label>
      <label>Verification source<textarea value={draft.source||''} onChange={event=>set('source',event.target.value)} placeholder="Carrier policy, person who confirmed it, and date"/></label>
      <label>First log day using this profile<input type="date" value={draft.effectiveLogDay||plan.effectiveLogDay||''} onChange={event=>set('effectiveLogDay',event.target.value)}/></label>
      {plan.errors.length?<ul>{plan.errors.map(error=><li key={error}>{error}</li>)}</ul>:<p>{plan.profile.cycleRule} · begins {plan.effectiveAt}. Earlier days retain their existing or unconfirmed profile.</p>}
      <button type="button" onClick={()=>onSave?.({draft,confirmed:false})}>Save as proposal</button>
      <label className="hos-history-approval"><input type="checkbox" checked={verified} onChange={event=>setVerified(event.target.checked)}/><span>I verified these carrier settings against the source recorded above.</span></label>
      <button type="button" className="save-main" disabled={!plan.ok||!verified} onClick={()=>onSave?.({draft,confirmed:true})}>Save confirmed prospective profile</button>
      {state.sheet?.error?<p role="alert">{state.sheet.error}</p>:null}
    </div></div>
  </div>;
}
