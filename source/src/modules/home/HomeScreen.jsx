import React, { useMemo, useState } from 'react';
import LogGraph from '../graph/LogGraph.jsx';
import { label } from '../../shared/utils/status.js';
import { addDays, localDayKey } from '../../shared/utils/date.js';
import { signableLogDays, validateLogForSigning } from '../logbook/signing.js';
import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';
import { nowMin } from '../../shared/utils/time.js';

// v95.52 Roadside 8-day home list
// Home always anchors to the real local calendar day, then the previous 7 days.
// Opening older logs never moves the Home screen away from today.

function dayParts(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { weekday: day, date: '' };
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    date: `${d.toLocaleDateString(undefined, { month: 'short' })} ${d.getDate()}`,
  };
}

function duration(events = []) {
  return events.reduce((sum, e) => sum + Math.max(0, (e.endMin || 0) - (e.startMin || 0)), 0);
}

function hLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}

const SHORT = { OFF: 'OFF', SB: 'SB', D: 'DRV', ON: 'ON' };

function statusSummary(state) {
  const day = localDayKey();
  const events = state.eventsByDay?.[day] || [];
  const last = [...events].sort((a, b) => a.startMin - b.startMin).at(-1);
  const status = state.currentStatus || last?.status || 'OFF';
  const loc = state.currentLocation || {};
  const source = loc.locationSource || state.homeGpsStatus || 'default';
  const hasRealLocation = source === 'gps' || source === 'manual' || (loc.city && loc.state && !(loc.city === 'Chicago' && loc.state === 'IL' && source === 'default'));
  let location = 'Set location';
  if (hasRealLocation) location = `${loc.city || 'GPS'}, ${loc.state || 'UNK'}`;
  else if (state.homeGpsStatus === 'blocked') location = 'GPS blocked';
  else if (state.homeGpsStatus === 'unavailable') location = 'GPS unavailable';

  return {
    status,
    label: label(status),
    location,
    vehicle: state.currentTrailer && state.currentTrailer !== 'No trailer' ? state.currentTrailer : 'No vehicle',
  };
}

function inspectionDone(state, day) {
  const insp = state.inspectionByDay?.[day];
  return !!(insp && (insp.complete || (Array.isArray(insp.checked) && insp.checked.length >= 6)));
}

function isDayKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key || ''));
}

function savedDayKeys(state) {
  const out = new Set();
  [
    state.eventsByDay,
    state.certifyStatus,
    state.signatureByDay,
    state.inspectionByDay,
    state.formByDay,
    state.routeByDay,
  ].forEach(bucket => {
    Object.keys(bucket || {}).forEach(day => {
      if (isDayKey(day)) out.add(day);
    });
  });
  return out;
}

function hasRealLog(state, day) {
  return Array.isArray(state.eventsByDay?.[day]) && state.eventsByDay[day].length > 0;
}

function homeCurrentEvents(state, day) {
  const raw = state.eventsByDay?.[day] || [];
  if (raw.length) return displayEventsForDay(raw, true);

  const status = state.currentStatus || 'OFF';
  const loc = state.currentLocation || {};
  const endMin = Math.max(1, Math.min(1440, nowMin()));
  return [{
    id: `home_live_${day}`,
    status,
    startMin: 0,
    endMin,
    city: loc.city || '',
    state: loc.state || '',
    note: state.currentReason || (status === 'OFF' ? 'Off Duty' : ''),
    source: 'home_display_only',
    displayOnly: true,
  }];
}

function certLabelForDay(state, day, anchorDay) {
  const cert = state.certifyStatus?.[day];
  if (cert) return cert;
  if (day === anchorDay) return 'Active day / Not certified yet';
  if (!hasRealLog(state, day)) return 'Missing log';
  return 'Needs signature';
}

function DayRow({ state, day, anchorDay, onOpenDay }) {
  const { weekday, date } = dayParts(day);
  const raw = state.eventsByDay?.[day] || [];
  const evs = displayEventsForDay(raw, day === anchorDay);
  const cert = certLabelForDay(state, day, anchorDay);
  const status = raw.slice(-1)[0]?.status || 'OFF';
  const certified = cert === 'Certified';
  const missing = day !== anchorDay && raw.length === 0;
  const issues = day < anchorDay ? validateLogForSigning(state, day).length : 0;
  const insp = inspectionDone(state, day);
  return (
    <button type="button" className={`rr-row ${status}${missing ? ' rr-missing-day' : ''}`} onClick={() => onOpenDay(day)}>
      <span className="rr-rail" aria-hidden="true" />
      <span className="rr-body">
        <span className="rr-top">
          <span className="rr-date">{weekday} <em>{date}</em></span>
          <span className={`rr-chip ${status}`}>{SHORT[status] || status}</span>
        </span>
        <span className="rr-sub">
          <span>{hLabel(duration(evs))}</span>
          <span className="rr-sep" aria-hidden="true">•</span>
          <span>{cert}</span>
          {insp ? <span className="rr-insp">Insp ✓</span> : null}
        </span>
      </span>
      {issues > 0 ? <span className="rr-warn" title={`${issues} to review`}>{issues}</span>
        : certified ? <span className="rr-ok" title="Certified">✓</span> : null}
    </button>
  );
}

export default function LogsList({ state, onOpenDay, onOpenStatus, onOpenTrailer, onOpenUnsigned, onOpenDot }) {
  const [showOlder, setShowOlder] = useState(false);
  const today = localDayKey();
  const anchorDay = today;
  const anchorEvents = homeCurrentEvents(state, anchorDay);
  const unsigned = signableLogDays(state).length;
  const s = statusSummary(state);
  const anchorCert = certLabelForDay(state, anchorDay, anchorDay);

  const roadsideDays = useMemo(() => Array.from({ length: 8 }, (_, i) => addDays(anchorDay, -i)), [anchorDay]);
  const roadsideSet = useMemo(() => new Set(roadsideDays), [roadsideDays]);
  const previousSevenDays = roadsideDays.slice(1);
  const olderSavedDays = useMemo(() => {
    return [...savedDayKeys(state)]
      .filter(day => !roadsideSet.has(day))
      .sort()
      .reverse();
  }, [state, roadsideSet]);

  return (
    <section className="screen rr-screen">
      <header className="rr-head">
        <div className="rr-brand">
          <span className="rr-mark" aria-hidden="true" />
          <span className="rr-brand-text">Road Ready<em>Logs</em></span>
        </div>
        <button type="button" className="rr-dot-btn" onClick={onOpenDot}>DOT Mode</button>
      </header>

      <div className="rr-strip">
        <button type="button" className="rr-strip-cell" onClick={onOpenStatus}>
          <span className={`rr-chip lg ${s.status}`}>{s.label}</span>
          <span className="rr-loc">{s.location}</span>
        </button>
        <button type="button" className="rr-strip-cell right" onClick={onOpenTrailer}>
          <span className="rr-veh">{s.vehicle}</span>
          <span className="rr-veh-sub">Vehicle</span>
        </button>
      </div>

      {unsigned > 0 && (
        <button type="button" className="rr-attention" onClick={() => onOpenUnsigned?.()}>
          <span className="rr-attention-badge">{unsigned}</span>
          <span>{unsigned === 1 ? 'log needs signing' : 'logs need signing'}</span>
          <span className="rr-attention-go" aria-hidden="true">Review</span>
        </button>
      )}

      <div className="rr-sec">Today</div>
      <button type="button" className={`rr-row rr-today ${s.status}`} onClick={() => onOpenDay(anchorDay)}>
        <span className="rr-rail" aria-hidden="true" />
        <span className="rr-body">
          <span className="rr-top">
            <span className="rr-date">{dayParts(anchorDay).weekday} <em>{dayParts(anchorDay).date}</em></span>
            <span className={`rr-chip ${s.status}`}>{SHORT[s.status] || s.status}</span>
          </span>
          <span className="rr-sub">
            <span>{hLabel(duration(anchorEvents))}</span>
            <span className="rr-sep" aria-hidden="true">•</span>
            <span>{anchorCert}</span>
            {inspectionDone(state, anchorDay) ? <span className="rr-insp">Insp ✓</span> : null}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="rr-today-graph-btn"
        onClick={() => onOpenDay(anchorDay)}
        aria-label="Open today log"
      >
        <span className="rr-today-graph-go" aria-hidden="true">Open</span>
        <div className="rr-today-graph">
          <LogGraph events={anchorEvents} selectedId={null} className="rr-home-graph-svg" />
        </div>
      </button>

      <div className="rr-sec">Previous 7 days</div>
      {previousSevenDays.map(day => (
        <DayRow key={day} state={state} day={day} anchorDay={anchorDay} onOpenDay={onOpenDay} />
      ))}

      {olderSavedDays.length > 0 ? (
        <>
          <button type="button" className="rr-older-toggle" onClick={() => setShowOlder(v => !v)}>
            <span>Older saved logs</span>
            <em>{olderSavedDays.length} saved</em>
            <b>{showOlder ? 'Hide' : 'Show'}</b>
          </button>
          {showOlder ? olderSavedDays.map(day => (
            <DayRow key={day} state={state} day={day} anchorDay={anchorDay} onOpenDay={onOpenDay} />
          )) : null}
        </>
      ) : null}

      <button type="button" className="rr-dotmode" onClick={onOpenDot}>
        <span className="rr-dotmode-mark" aria-hidden="true" />
        <span>
          <b>DOT Inspection Mode</b>
          <em>Today + previous 7 days</em>
        </span>
        <span className="rr-dotmode-go" aria-hidden="true">Open</span>
      </button>
      <div className="rr-pad" />
    </section>
  );
}
