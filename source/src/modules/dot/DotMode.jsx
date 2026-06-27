import React, { useMemo, useState } from 'react';
import { Header } from '../../shared/ui/Chrome.jsx';
import LogGraph from '../graph/LogGraph.jsx';
import { durLabel, timeLabel } from '../../shared/utils/time.js';
import { addDays, localDayKey } from '../../shared/utils/date.js';
import { color, label } from '../../shared/utils/status.js';
import { validateLogForSigning } from '../logbook/signing.js';

const DEFAULT_DRIVER_NAME = 'Arben Oruci';
const DEFAULT_CARRIER_NAME = 'Narta Express LLC';
const DEFAULT_MAIN_OFFICE = '92 201 Lake Drive, Willowbrook, IL 60527';

function dayTitle(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const weekday = d.toLocaleDateString(undefined, { weekday:'short' }).toUpperCase();
  const mon = d.toLocaleDateString(undefined, { month:'short' }).toUpperCase();
  return `${weekday} ${mon} ${String(d.getDate()).padStart(2, '0')}`;
}

function sortEvents(events = []) {
  return [...events].filter(Boolean).sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0));
}

function dayRange(activeDay) {
  return Array.from({ length: 8 }).map((_, index) => addDays(activeDay, -index));
}

function dutyTotals(events = []) {
  return ['OFF','SB','D','ON'].map(status => {
    const mins = events.filter(e => e.status === status).reduce((sum, e) => sum + Math.max(0, Number(e.endMin || 0) - Number(e.startMin || 0)), 0);
    return [status, mins];
  });
}

function inspectionLabel(inspection = {}) {
  if (!inspection.complete) return 'Missing / not completed';
  const where = [inspection.city, inspection.state].filter(Boolean).join(', ');
  const when = inspection.sourceStartMin != null ? timeLabel(inspection.sourceStartMin, true) : '';
  return `Completed${when ? ` · ${when}` : ''}${where ? ` · ${where}` : ''}`;
}

function signatureLabel(state, day) {
  const sig = state.signatureByDay?.[day] || {};
  if (!sig.signed) return 'Not signed';
  try { return `Signed · ${new Date(sig.signedAt).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}`; }
  catch { return 'Signed'; }
}

function driverName(state) {
  return state.driverProfile?.name || state.driverSignature?.driverName || DEFAULT_DRIVER_NAME;
}

function publicDaySummary(state, day) {
  const events = sortEvents(state.eventsByDay?.[day] || []);
  const inspection = state.inspectionByDay?.[day] || {};
  const issues = validateLogForSigning(state, day).filter(issue => issue.code !== 'active_day');
  const totals = dutyTotals(events).map(([status, mins]) => `${status}: ${durLabel(mins)}`).join(' | ');
  return [
    `${dayTitle(day)} (${day})`,
    `Totals: ${totals}`,
    `Certification: ${signatureLabel(state, day)}`,
    `Inspection: ${inspectionLabel(inspection)}`,
    issues.length ? `Review items: ${issues.map(issue => `${issue.where}: ${issue.title}`).join('; ')}` : 'Review items: none shown',
    'Events:',
    ...(events.length ? events.map(e => `- ${timeLabel(e.startMin, true)} to ${timeLabel(e.endMin, true)} | ${e.status} ${label(e.status)} | ${[e.city, e.state].filter(Boolean).join(', ') || 'Location missing'} | ${e.note || ''}`) : ['- No events recorded']),
  ].join('\n');
}

function inspectionPackageText(state, days) {
  const driver = state.driver || {};
  const equipment = state.equipment || {};
  const header = [
    'Owner-Op Road Ready DOT Inspection Summary',
    'Manual RODS / ELD-exempt driver record view',
    `Generated: ${new Date().toLocaleString()}`,
    `Driver: ${driverName(state)}`,
    `Carrier: ${state.carrierName || DEFAULT_CARRIER_NAME}`,
    `Main office: ${state.mainOfficeAddress || DEFAULT_MAIN_OFFICE}`,
    `Truck/unit: ${driver.truck || 'Missing'}`,
    `Trailer/equipment: ${state.currentTrailer || equipment.trailer || equipment.chassis || 'No trailer / not set'}`,
    '',
    'Includes current 24-hour period and previous 7 consecutive days shown in the app.',
    'Private billing, rate, factoring, profit, and internal notes are hidden from DOT Mode.',
  ].join('\n');
  return `${header}\n\n${days.map(day => publicDaySummary(state, day)).join('\n\n---\n\n')}`;
}

export default function DotMode({ state, onBack }) {
  const [selectedDay, setSelectedDay] = useState(state.activeDay || localDayKey());
  const [officerEmail, setOfficerEmail] = useState('');
  const [routingCode, setRoutingCode] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const days = useMemo(() => dayRange(state.activeDay || localDayKey()), [state.activeDay]);
  const selectedEvents = sortEvents(state.eventsByDay?.[selectedDay] || []);
  const packageText = useMemo(() => inspectionPackageText(state, days), [state, days]);
  const selectedInspection = state.inspectionByDay?.[selectedDay] || {};
  const selectedIssues = validateLogForSigning(state, selectedDay).filter(issue => issue.code !== 'active_day');

  function copySummary() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(packageText).then(
        () => setCopyStatus('Inspection summary copied.'),
        () => setCopyStatus('Copy failed. Use Email Officer Report instead.')
      );
    } else {
      setCopyStatus('Copy not available on this device/browser.');
    }
  }

  function emailOfficer() {
    const to = officerEmail.trim();
    const subject = encodeURIComponent(`DOT inspection logs${routingCode ? ` - ${routingCode}` : ''}`);
    const body = encodeURIComponent(`${routingCode ? `Routing / reference code: ${routingCode}\n\n` : ''}${packageText}`);
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
  }

  return (
    <section className="screen active dot-mode dot-inspection-mode">
      <Header title="DOT INSPECTION" onBack={onBack} right="" />

      <div className="dot-hero-card">
        <b>Official inspection-safe view</b>
        <span>Show this screen to the officer on this phone/device, or email/copy the inspection summary below.</span>
      </div>

      <div className="dot-action-card">
        <button className="dot-primary-action" onClick={() => window.scrollTo({ top: 0, behavior:'smooth' })}>Open DOT Mode on this device</button>
        <input value={officerEmail} onChange={e => setOfficerEmail(e.target.value)} placeholder="Officer email (optional)" />
        <input value={routingCode} onChange={e => setRoutingCode(e.target.value)} placeholder="Routing/reference code (if officer gives one)" />
        <div className="dot-action-row">
          <button onClick={emailOfficer}>Email officer report</button>
          <button onClick={copySummary}>Copy summary</button>
        </div>
        {copyStatus && <span className="dot-copy-status">{copyStatus}</span>}
      </div>

      <div className="dot-header-card">
        <div><span>Driver</span><b>{driverName(state)}</b></div>
        <div><span>Carrier</span><b>{state.carrierName || DEFAULT_CARRIER_NAME}</b></div>
        <div><span>Truck</span><b>{state.driver?.truck || 'Missing'}</b></div>
        <div><span>Mode</span><b>Manual RODS / ELD-exempt</b></div>
      </div>

      <div className="dot-days-strip">
        {days.map(day => (
          <button key={day} className={day === selectedDay ? 'active' : ''} onClick={() => setSelectedDay(day)}>
            <b>{dayTitle(day)}</b>
            <span>{day}</span>
          </button>
        ))}
      </div>

      <div className="graph-panel"><LogGraph events={selectedEvents} /></div>

      <div className="dot-day-status-card">
        <b>{dayTitle(selectedDay)} inspection status</b>
        <span>Certification: {signatureLabel(state, selectedDay)}</span>
        <span>Inspection: {inspectionLabel(selectedInspection)}</span>
        <span>Review: {selectedIssues.length ? `${selectedIssues.length} item(s) need review` : 'No blocking review items shown'}</span>
      </div>

      <div className="events dot-events">
        {selectedEvents.map(e => (
          <div className="event-row" key={e.id}>
            <div className="event-badge" style={{ background:color(e.status) }}>{e.status}</div>
            <div className="event-content">
              <div className="event-time">{timeLabel(e.startMin, true)} <span>|</span> {durLabel(e.endMin-e.startMin)}</div>
              <div className="event-loc">{[e.city, e.state].filter(Boolean).join(', ') || 'Location missing'}</div>
              <div className="event-note">{e.note || label(e.status)}</div>
            </div>
          </div>
        ))}
        {!selectedEvents.length && <div className="dot-empty-day">No events recorded for this day.</div>}
      </div>

      <div className="dot-note">DOT Mode hides billing, rate confirmation, factoring, private notes, open tasks, and IFTA draft data. It is an inspection-safe manual RODS view, not a certified ELD transfer file.</div>
    </section>
  );
}
