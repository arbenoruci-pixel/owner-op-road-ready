import React, { useMemo, useState } from 'react';
import { timeLabel } from '../../shared/utils/time.js';

function labelDelta(delta) {
  const sign = delta < 0 ? '-' : '+';
  const abs = Math.abs(delta);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h && m) return `${sign}${h}h ${m}m`;
  if (h) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

export default function ShiftSheet({ events, selectedIds = [], onApply, onClose }) {
  const [direction, setDirection] = useState('back');
  const [preset, setPreset] = useState(60);
  const [custom, setCustom] = useState(false);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(15);
  const amount = custom ? (Number(hours || 0) * 60 + Number(minutes || 0)) : Number(preset || 0);
  const requestedDelta = (direction === 'back' ? -1 : 1) * amount;
  const selected = events.filter(e => selectedIds.includes(e.id));
  const allSelected = !!events.length && selected.length === events.length;
  const minStart = selected.length ? Math.min(...selected.map(e => Number(e.startMin || 0))) : 0;
  const maxEnd = selected.length ? Math.max(...selected.map(e => Number(e.endMin || 0))) : 1440;
  const delta = Math.max(-minStart, Math.min(1440 - maxEnd, requestedDelta));
  const wasClamped = delta !== requestedDelta;
  const crosses = selected.some(e => e.startMin + requestedDelta < 0 || e.endMin + requestedDelta > 1440);

  const preview = useMemo(() => selected.map(e => ({ ...e, ns:e.startMin+delta, ne:e.endMin+delta })), [selectedIds.join(','), delta, events]);

  return (
    <div className="sheet active">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>{allSelected ? 'Shift Day Events' : 'Move Selected Events'}</div><span></span></div>
      <div className="form">
        <div className="edit-summary">{allSelected ? 'All day events' : `${selected.length} selected`} · {labelDelta(delta)}{wasClamped ? ' · limited to stay in day' : ''}</div>
        <Section title="Direction">
          <div className="two-inputs"><button className={direction==='back'?'active choice':''} onClick={()=>setDirection('back')}>BACKWARD</button><button className={direction==='forward'?'active choice':''} onClick={()=>setDirection('forward')}>FORWARD</button></div>
        </Section>
        <Section title="Amount">
          <div className="quick-row">{[15,30,60,120].map(v => <button key={v} className={!custom && preset===v?'active':''} onClick={()=>{setCustom(false);setPreset(v)}}>{v<60?`${v}m`:`${v/60}h`}</button>)}</div>
        </Section>
        <Section title="Custom">
          <div className="two-inputs"><input type="number" value={hours} onChange={e=>{setCustom(true);setHours(e.target.value)}} placeholder="Hours" /><input type="number" value={minutes} onChange={e=>{setCustom(true);setMinutes(e.target.value)}} placeholder="Minutes" /></div>
        </Section>
        <Section title="Preview">
          <div className="shift-preview">{preview.map(e => <div key={e.id}><b>{e.status}</b><span>{timeLabel(e.startMin)} - {timeLabel(e.endMin)}</span><em>→ {`${timeLabel(e.ns)} - ${timeLabel(e.ne)}`}</em></div>)}</div>
        </Section>
        <div className="warning">This shifts real stored events only. It will not move synthetic carry-forward/display rows.{wasClamped && <><br/><br/>Shift was limited so selected events stay inside this log day.</>}</div>
        <button className="save-main" disabled={!selected.length || amount<=0 || !delta} onClick={()=>onApply(delta)}>Apply shift</button>
        <button className="cancel-main" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
function Section({ title, children }) { return <div className="form-section"><div className="form-label">{title}</div>{children}</div>; }
