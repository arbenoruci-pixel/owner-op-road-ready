import React from 'react';
import {DUTY_LABELS,dutyActivities} from './dutyModelV110378.js';

export function DutyStatusField({status,onChange}) {
  return <section className="rr-duty-card" data-duty-field="status"><div className="rr-duty-field-head"><span>Status</span><strong>{DUTY_LABELS[status]}</strong></div>
    <div className="rr-duty-status-grid duty-grid editor-duty-grid driver-duty-grid" role="group" aria-label="Duty status">
      {Object.keys(DUTY_LABELS).map(s=><button type="button" key={s} data-status={s} aria-label={s} aria-pressed={status===s} className={status===s?'active picked':''} onClick={()=>onChange(s)}><b>{s}</b><small>{DUTY_LABELS[s]}</small></button>)}
    </div></section>;
}
export function DutyActivityField({status,intermodal=false,selected=[],onToggle,editor=false,children}) {
  const options=[...new Set([...dutyActivities(status,intermodal),...selected])];
  return <section className="rr-duty-card quick-activities-v11023" data-duty-field="activity" aria-label="Duty activities"><div className="rr-duty-field-head"><span>{status==='ON'?'What are you doing on duty?':'Activity'}</span><small>Select one or more</small></div>
    <div className="rr-duty-activity-grid reason-pills insert-reason-grid driver-reason-grid multi-reason-grid">
      {options.map(reason=><button type="button" key={reason} title={reason} aria-pressed={selected.includes(reason)} className={selected.includes(reason)?'picked':''} onClick={()=>onToggle(reason)}><span aria-hidden="true">{selected.includes(reason)?'✓ ':''}</span>{reason}</button>)}
    </div>{children}</section>;
}
export function DutyLocationField({value,onChange,onBlur,onGps,onClear,gpsStatus='',suggestions=[],onSuggestion,label='Location',historical=false}) {
  return <section className="rr-duty-card" data-duty-field="location"><div className="rr-duty-field-head"><span>{label}</span><button type="button" className="rr-duty-link" onClick={onGps}>Use current GPS</button></div>
    <div className="rr-duty-location location-one-v85 location-editable-v91 driver-location-row"><button type="button" className="gps-locate-btn" aria-label="Use GPS location" onClick={onGps}>⌖</button>
      <input aria-label="Location" value={value} onChange={e=>onChange(e.target.value)} onBlur={onBlur} onFocus={e=>e.currentTarget.select()} placeholder="City, ST" autoComplete="off"/>
      <button type="button" className="location-clear-btn" aria-label="Clear location" onClick={onClear}>×</button></div>
    {historical?<p className="rr-duty-help">This is the location of the recorded event. Current GPS is used only when you choose it.</p>:null}
    {suggestions.length?<div className="rr-duty-suggestions driver-location-suggestions">{suggestions.map(v=><button type="button" key={v} onClick={()=>onSuggestion?.(v)}>{v}</button>)}</div>:null}
    {gpsStatus?<p className="rr-duty-help gps-hint gps-msg" role="status">{gpsStatus}</p>:null}
  </section>;
}
export function DutyNoteField({value,onChange,label='Note',id,children}) {
  return <section className="rr-duty-card" data-duty-field="notes"><label htmlFor={id} className="rr-duty-field-head note-toggle-v90">{label} <small>Optional</small></label><textarea className="note-v85" id={id} aria-label={label} value={value} onChange={e=>onChange(e.target.value)} rows={3} placeholder="Optional note"/>{children}</section>;
}
