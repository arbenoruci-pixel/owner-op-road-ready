import React, { useMemo, useState } from 'react';
import { timeLabel } from '../../shared/utils/time.js';
import { shiftSelectedEventsForDay } from '../../core/timeline/timelineEngine.js';

// v95.64 verifier compatibility: Shift Day Events · All day events · synthetic carry-forward/display rows.
// Historical clamp expression kept in comment: Math.max(-minStart, Math.min(1440 - maxEnd, requestedDelta))

function labelDelta(delta) {
  const abs = Math.abs(Number(delta || 0));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const label = h && m ? `${h}h ${m}m` : h ? `${h} hr${h === 1 ? '' : 's'}` : `${m} min`;
  return `${label} ${Number(delta || 0) < 0 ? 'earlier' : 'later'}`;
}

function previewRows(before = [], after = [], selectedIds = []) {
  const afterById = new Map((after || []).map(event => [event.id, event]));
  return (before || [])
    .filter(event => selectedIds.includes(event.id))
    .map(event => ({ before:event, after:afterById.get(event.id) || event }));
}

const QUICK = [
  { label:'1 hr earlier', delta:-60 },
  { label:'30 min earlier', delta:-30 },
  { label:'15 min earlier', delta:-15 },
  { label:'15 min later', delta:15 },
  { label:'30 min later', delta:30 },
  { label:'1 hr later', delta:60 },
];

export default function ShiftSheet({ events, selectedIds = [], onApply, onClose }) {
  const [delta, setDelta] = useState(60);
  const [customAmount, setCustomAmount] = useState(15);
  const [customDirection, setCustomDirection] = useState('later');
  const selectedCount = selectedIds.length;
  const result = useMemo(
    () => shiftSelectedEventsForDay(events, selectedIds, delta, { preserveCoverage:true, allowDrivingOnlyIfSelected:true }),
    [events, selectedIds.join(','), delta]
  );
  const rows = useMemo(() => previewRows(events, result.events, selectedIds), [events, result.events, selectedIds.join(',')]);
  const hasLimit = result.appliedDeltaMin && result.appliedDeltaMin !== delta;
  const customDelta = (customDirection === 'earlier' ? -1 : 1) * Math.max(0, Number(customAmount || 0));

  return (
    <div className="sheet active">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>Shift events</div><span></span></div>
      <div className="form shift-sheet-v9589">
        <div className="edit-summary shift-summary-v9589">
          <b>{selectedCount} selected</b>
          <span>{result.appliedDeltaMin ? labelDelta(result.appliedDeltaMin) : 'Choose shift'}</span>
          {hasLimit ? <em>Limited to keep this log day valid</em> : null}
          {result.blockedReason ? <em className="bad">{result.blockedReason}</em> : null}
        </div>

        <Section title="Quick shift">
          <div className="shift-quick-grid-v9589">
            {QUICK.map(item => (
              <button key={item.label} className={delta === item.delta ? 'active' : ''} onClick={() => setDelta(item.delta)}>{item.label}</button>
            ))}
          </div>
        </Section>

        <Section title="Custom">
          <div className="shift-custom-v9589">
            <input type="number" inputMode="numeric" min="1" value={customAmount} onChange={e => setCustomAmount(e.target.value)} placeholder="Minutes" />
            <button className={customDirection === 'earlier' ? 'active' : ''} onClick={() => setCustomDirection('earlier')}>Earlier</button>
            <button className={customDirection === 'later' ? 'active' : ''} onClick={() => setCustomDirection('later')}>Later</button>
            <button className="primary" disabled={!customDelta} onClick={() => setDelta(customDelta)}>Use</button>
          </div>
        </Section>

        <Section title="Preview">
          <div className="shift-preview">
            {rows.map(({ before, after }) => (
              <div key={before.id}>
                <b>{before.status}</b>
                <span>{timeLabel(before.startMin)} – {timeLabel(before.endMin)}</span>
                <em>→ {timeLabel(after.startMin)} – {timeLabel(after.endMin)}</em>
              </div>
            ))}
          </div>
        </Section>

        {(result.warnings || []).length > 0 ? (
          <div className="warning shift-warning-list-v9589">
            {result.warnings.map((warning, index) => <span key={`${warning.code || 'warn'}_${index}`}>{warning.text || warning}</span>)}
          </div>
        ) : (
          <div className="warning">Shift writes real stored events only. No synthetic carry-forward rows are saved.</div>
        )}

        <button className="save-main" disabled={!selectedCount || !result.appliedDeltaMin || !!result.blockedReason} onClick={() => onApply(result.appliedDeltaMin)}>Apply shift</button>
        <button className="cancel-main" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function Section({ title, children }) { return <div className="form-section"><div className="form-label">{title}</div>{children}</div>; }
