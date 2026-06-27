import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Header, Tabs } from '../../shared/ui/Chrome.jsx';
import LogGraph from '../graph/LogGraph.jsx';
import EventList from './EventList.jsx';
import LogCheckPanel from './LogCheckPanel.jsx';
import SelectedEventBar from './SelectedEventBar.jsx';
import { violationRangesForDay } from '../../core/hos/hosEngine.js';
import { normalizeLogEvents } from '../../core/timeline/timelineEngine.js';
import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';
import { isToday, localDayKey } from '../../shared/utils/date.js';
import { logSignState, signingWarnings } from './signing.js';

const DEFAULT_DRIVER_NAME = 'Arben Oruci';
const DEFAULT_CARRIER_NAME = 'Narta express llc';
const DEFAULT_MAIN_OFFICE = '92 201 lake drive , willowbrook, IL 60527';

function title(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const dow = d.toLocaleDateString(undefined, { weekday:'short' }).toUpperCase();
  const mon = d.toLocaleDateString(undefined, { month:'short' }).toUpperCase();
  return `${dow} | ${mon} ${String(d.getDate()).padStart(2,'0')}`;
}

function clampDelta(event, delta) {
  if (!event) return 0;
  const min = -Number(event.startMin || 0);
  const max = 1439 - Number(event.endMin || 0);
  return Math.max(min, Math.min(max, delta));
}

function shiftOneEvent(events, eventId, delta) {
  if (!eventId || !delta) return events;
  return normalizeLogEvents((events || []).map(event => (
    event.id === eventId
      ? { ...event, startMin:event.startMin + delta, endMin:event.endMin + delta }
      : event
  )));
}

function violationSignature(ranges) {
  return (ranges || [])
    .map(r => `${r.type || ''}:${r.severity || ''}:${r.status || ''}:${r.startMin}-${r.endMin}`)
    .join('|');
}

const INSPECTION_ITEMS = [
  ['brakes', 'Brakes'],
  ['lights', 'Lights'],
  ['tires', 'Tires'],
  ['mirrors', 'Mirrors'],
  ['coupling', 'Coupling / 5th wheel'],
  ['documents', 'Documents'],
];

function prettyStamp(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); }
  catch { return ''; }
}

function minutesLabel(minute) {
  if (!Number.isFinite(Number(minute))) return '';
  const total = Math.max(0, Math.min(1440, Number(minute)));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function isAutoInspection(saved = {}) {
  return String(saved.source || '').includes('auto_on_duty_pretrip');
}

function safeValue(value, fallback = 'None') {
  const text = value === 0 ? '0' : String(value || '').trim();
  return text ? text : fallback;
}

function formatDutyMinutes(mins) {
  const total = Math.max(0, Number(mins || 0));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function joinCityState(city, state) {
  const parts = [city, state].filter(Boolean);
  return parts.length ? parts.join(', ') : 'None';
}

function driverNameForState(state) {
  return state.signatureByDay?.[state.activeDay]?.driverName || state.driverProfile?.name || DEFAULT_DRIVER_NAME;
}

function formSummary(state, events) {
  const dutyTotals = ['OFF','SB','D','ON'].map(status => {
    const mins = (events || []).filter(e => e.status === status).reduce((sum, e) => sum + Math.max(0, e.endMin - e.startMin), 0);
    return [status, mins];
  });
  const dutyMap = Object.fromEntries(dutyTotals);
  const load = state.loadInfo || {};
  const equipment = state.equipment || {};
  const shippingDocs = [load.loadNo, equipment.container, equipment.chassis].filter(Boolean).join(' ');
  const trailers = state.currentTrailer && state.currentTrailer !== 'No trailer'
    ? state.currentTrailer
    : (equipment.trailer || state.driver?.trailer || 'None');
  const notes = [...new Set((events || []).map(e => e.description || e.note).filter(Boolean))].slice(0, 2).join(' · ');
  return {
    off: formatDutyMinutes(dutyMap.OFF || 0),
    sb: formatDutyMinutes(dutyMap.SB || 0),
    d: formatDutyMinutes(dutyMap.D || 0),
    on: formatDutyMinutes(dutyMap.ON || 0),
    vehicles: safeValue(state.driver?.truck),
    trailers: safeValue(trailers),
    distance: state.gpsTrip?.totalMiles ? `${Number(state.gpsTrip.totalMiles).toFixed(2)} mi` : 'None',
    odometers: 'No Vehicles',
    shippingDocs: safeValue(shippingDocs),
    driverName: driverNameForState(state),
    carrierName: safeValue(state.carrierName || DEFAULT_CARRIER_NAME),
    mainOffice: safeValue(state.mainOfficeAddress || DEFAULT_MAIN_OFFICE),
    homeTerminal: safeValue(state.homeTerminalAddress),
    coDrivers: safeValue(state.coDrivers),
    from: joinCityState(load.pickupCity, load.pickupState),
    to: joinCityState(load.deliveryCity, load.deliveryState),
    notes: safeValue(notes),
  };
}

function FormSectionTitle({ children }) {
  return <div className="motive-form-section-title">{children}</div>;
}

function FormRow({ label, value }) {
  return (
    <div className="motive-form-row">
      <div className="motive-form-label">{label}</div>
      <div className="motive-form-value">{value}</div>
    </div>
  );
}

function MiniFormPanel({ state, events }) {
  const form = formSummary(state, events);
  return (
    <div className="motive-paper-form">
      <div className="motive-form-totals">
        <div><b>OFF</b><span>{form.off}</span></div>
        <div><b>SB</b><span>{form.sb}</span></div>
        <div><b>D</b><span>{form.d}</span></div>
        <div><b>ON</b><span>{form.on}</span></div>
      </div>

      <FormSectionTitle>GENERAL</FormSectionTitle>
      <FormRow label="Vehicles" value={form.vehicles} />
      <FormRow label="Trailers" value={form.trailers} />
      <div className="motive-form-split-row">
        <div>
          <div className="motive-form-label">Distance</div>
          <div className="motive-form-value">{form.distance}</div>
        </div>
        <div>
          <div className="motive-form-label">Odometers</div>
          <div className="motive-form-value">{form.odometers}</div>
        </div>
      </div>
      <FormRow label="Shipping Documents" value={form.shippingDocs} />
      <FormRow label="Driver" value={form.driverName} />

      <FormSectionTitle>CARRIER</FormSectionTitle>
      <FormRow label="Carrier" value={form.carrierName} />
      <FormRow label="Main Office Address" value={form.mainOffice} />
      <FormRow label="Home Terminal Address" value={form.homeTerminal} />

      <FormSectionTitle>OTHER</FormSectionTitle>
      <FormRow label="Co-Drivers" value={form.coDrivers} />
      <FormRow label="From" value={form.from} />
      <FormRow label="To" value={form.to} />
      <FormRow label="Notes" value={form.notes} />
    </div>
  );
}

function InspectionPanel({ state, onSaveInspection }) {
  const day = state.activeDay;
  const saved = state.inspectionByDay?.[day] || {};
  const checked = new Set(saved.checked || []);
  const allChecked = INSPECTION_ITEMS.every(([id]) => checked.has(id));
  const autoDone = allChecked && isAutoInspection(saved);

  function saveChecked(ids) {
    onSaveInspection?.({
      type: 'pretrip',
      checked: ids,
      complete: INSPECTION_ITEMS.every(([id]) => ids.includes(id)),
      completedAt: INSPECTION_ITEMS.every(([id]) => ids.includes(id)) ? (saved.completedAt || Date.now()) : null,
      source: saved.source || 'manual_inspection_form',
    });
  }

  function toggle(id) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveChecked([...next]);
  }

  function selectAll() {
    saveChecked(INSPECTION_ITEMS.map(([id]) => id));
  }

  return (
    <div className={`inspection-panel ${allChecked ? 'complete' : ''} ${autoDone ? 'auto-complete' : ''}`}>
      <div className="inspection-headline">
        <div>
          <b>Pre-trip inspection</b>
          <span>
            {autoDone
              ? `Completed from ON DUTY Pre-trip${saved.sourceStartMin != null ? ` · ${minutesLabel(saved.sourceStartMin)}` : ''}${saved.city || saved.state ? ` · ${[saved.city, saved.state].filter(Boolean).join(', ')}` : ''}`
              : allChecked
                ? `Completed${saved.completedAt ? ` · ${prettyStamp(saved.completedAt)}` : ''}`
                : 'Will auto-complete when an ON DUTY Pre-trip Inspection event exists.'}
          </span>
        </div>
        {!autoDone && <button onClick={selectAll}>{allChecked ? 'All OK' : 'Select all'}</button>}
      </div>

      {autoDone ? (
        <div className="inspection-done-note">
          Linked to duty status event. If that ON DUTY Pre-trip time is edited, this inspection time updates with it.
        </div>
      ) : (
        <>
          <div className="inspection-check-grid">
            {INSPECTION_ITEMS.map(([id, text]) => (
              <button key={id} className={checked.has(id) ? 'picked' : ''} onClick={() => toggle(id)}>
                <span>{checked.has(id) ? '✓' : ''}</span>
                <b>{text}</b>
              </button>
            ))}
          </div>
          {allChecked && <div className="inspection-done-note">Saved. You do not need to select these again for this log day.</div>}
        </>
      )}
    </div>
  );
}

function SignaturePanel({ state, onSaveSignature }) {
  const day = state.activeDay;
  const saved = state.signatureByDay?.[day] || {};
  const savedDriverSignature = state.driverSignature || null;
  const existingDataUrl = savedDriverSignature?.dataUrl || saved.signatureDataUrl || '';
  const [name, setName] = useState(savedDriverSignature?.driverName || saved.driverName || driverNameForState(state));
  const [hasInk, setHasInk] = useState(!!existingDataUrl);
  const [changeSignature, setChangeSignature] = useState(!existingDataUrl);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const signState = logSignState(state, day);
  const warnings = signingWarnings(state, day);
  const todayActive = day >= localDayKey();

  useEffect(() => {
    setName(savedDriverSignature?.driverName || saved.driverName || driverNameForState(state));
    setChangeSignature(!existingDataUrl);
    setHasInk(!!existingDataUrl);
  }, [day, savedDriverSignature?.dataUrl, savedDriverSignature?.driverName, saved.signatureDataUrl, saved.driverName, existingDataUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !changeSignature) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 4;
  }, [changeSignature, day]);

  function pointFromEvent(e) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDraw(e) {
    if (!changeSignature) return;
    const point = pointFromEvent(e);
    if (!point) return;
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = point;
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 0.01, point.y + 0.01);
    ctx.stroke();
    setHasInk(true);
  }

  function moveDraw(e) {
    if (!drawingRef.current || !changeSignature) return;
    const point = pointFromEvent(e);
    if (!point) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const previous = lastPointRef.current || point;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  }

  function endDraw() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function signLog() {
    if (changeSignature) {
      const canvas = canvasRef.current;
      if (!canvas || !hasInk) return;
      onSaveSignature?.({
        driverName: name || driverNameForState(state),
        signatureDataUrl: canvas.toDataURL('image/png'),
      });
      return;
    }

    if (!existingDataUrl) {
      setChangeSignature(true);
      return;
    }

    onSaveSignature?.({
      driverName: name || savedDriverSignature?.driverName || driverNameForState(state),
      signatureDataUrl: existingDataUrl,
    });
  }

  const signButtonLabel = signState.status === 'Needs Recertification'
    ? 'Recertify Log'
    : saved.signed && signState.status === 'Certified'
      ? 'Sign Again'
      : existingDataUrl && !changeSignature
        ? 'Sign Log'
        : 'Save Signature + Sign';

  return (
    <div className={`signature-panel motive-sign-panel ${saved.signed ? 'signed' : ''}`}>
      <div className="sign-legal-copy">
        I hereby certify that my data entries and my record of duty status for this day are true and correct
      </div>

      <div className="sign-driver-row">
        <span>Driver</span>
        <b>{name}</b>
      </div>

      {existingDataUrl && !changeSignature ? (
        <div className="saved-signature-preview">
          <img src={existingDataUrl} alt="Saved driver signature" />
          <span>Saved driver signature. Signing this log only needs one tap.</span>
        </div>
      ) : (
        <>
          <div className="signature-canvas-wrap">
            <canvas
              ref={canvasRef}
              className="signature-canvas"
              width="720"
              height="220"
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              onPointerCancel={endDraw}
            />
          </div>
          <button className="clear-signature-link" onClick={clearSignature}>Clear Signature</button>
        </>
      )}

      <div className="sign-status-card">
        <b>{signState.label}</b>
        <span>{todayActive ? 'Today is active. It is not counted in Unsigned Logs yet.' : signState.reason}</span>
      </div>

      {warnings.length > 0 && (
        <div className="sign-warning-card">
          <b>Review before signing</b>
          {warnings.map(warning => <span key={warning}>• {warning}</span>)}
        </div>
      )}

      <div className="signature-actions-row">
        <button className="sign-save motive-sign-save" onClick={signLog} disabled={changeSignature && !hasInk}>
          {signButtonLabel}
        </button>
      </div>

      {existingDataUrl && !changeSignature && <button className="clear-signature-link" onClick={() => setChangeSignature(true)}>Change Signature</button>}

      <div className="signature-footnote">
        {saved.signed ? `Signed · ${prettyStamp(saved.signedAt)}` : existingDataUrl ? 'Tap Sign Log to use the saved signature.' : 'Use your finger to save your driver signature once.'}
      </div>
    </div>
  );
}

export default function DayDetail({
  state, liveCurrent, events, selectedEvent, onBack, onSelect, onOpenAdd, onOpenEdit, onDelete,
  onToggleSelectMode, onToggleSelectedId, onSelectAll, onClearSelection, onOpenShift, onMoveSelected,
  onCertify, onTools, onOpenStatus, onOpenTrailer, onDriverFlow, onSaveLoad, onToggleGps,
  onSaveInspection, onSaveSignature
}) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDelta, setMoveDelta] = useState(0);
  const [activeTab, setActiveTab] = useState('log');

  const rawDayEvents = state.eventsByDay?.[state.activeDay] || [];
  const selectedRawEvent = rawDayEvents.find(event => event.id === state.selectedEventId) || null;
  const boundedMoveDelta = selectedRawEvent ? clampDelta(selectedRawEvent, moveDelta) : 0;
  const moveWasClamped = selectedRawEvent && moveDelta !== boundedMoveDelta;
  const isMoving = !!selectedRawEvent && moveOpen && boundedMoveDelta !== 0;

  useEffect(() => {
    setMoveOpen(false);
    setMoveDelta(0);
  }, [state.selectedEventId, state.activeDay]);

  const baseViolationRanges = useMemo(
    () => violationRangesForDay(state.eventsByDay || {}, state.activeDay),
    [state.eventsByDay, state.activeDay]
  );

  const previewRawEvents = useMemo(
    () => (isMoving ? shiftOneEvent(rawDayEvents, state.selectedEventId, boundedMoveDelta) : rawDayEvents),
    [isMoving, rawDayEvents, state.selectedEventId, boundedMoveDelta]
  );

  const previewGraphEvents = useMemo(
    () => (isMoving ? displayEventsForDay(previewRawEvents, isToday(state.activeDay)) : events),
    [isMoving, previewRawEvents, state.activeDay, events]
  );

  const previewViolationRanges = useMemo(
    () => (isMoving
      ? violationRangesForDay({ ...(state.eventsByDay || {}), [state.activeDay]: previewRawEvents }, state.activeDay)
      : baseViolationRanges),
    [isMoving, state.eventsByDay, state.activeDay, previewRawEvents, baseViolationRanges]
  );

  const selectedPreviewEvent = previewGraphEvents.find(event => event.id === state.selectedEventId) || selectedEvent;
  const violationsChanged = isMoving && violationSignature(baseViolationRanges) !== violationSignature(previewViolationRanges);
  const moveHasWarning = violationsChanged && previewViolationRanges.length > 0;

  function adjustMove(delta) {
    if (!selectedRawEvent) return;
    setMoveOpen(true);
    setMoveDelta(current => clampDelta(selectedRawEvent, current + delta));
  }

  function applyMove() {
    if (!selectedRawEvent || !boundedMoveDelta) return;
    onMoveSelected?.(selectedRawEvent.id, boundedMoveDelta);
    setMoveOpen(false);
    setMoveDelta(0);
  }

  return (
    <section className={`screen active graph-first-screen ${selectedEvent ? "editing-graph" : ""} ${moveOpen ? "inline-moving" : ""}`}>
      <Header title={title(state.activeDay)} onBack={onBack} onRight={onTools} />
      <Tabs active={activeTab} onTab={setActiveTab} />

      <div className="graph-panel graph-first-panel">
        <LogGraph
          events={previewGraphEvents}
          selectedId={state.selectedEventId}
          violationRanges={previewViolationRanges}
          onSelect={onSelect}
          onEmptyTap={() => onSelect(null)}
        />
      </div>

      {activeTab === 'log' && (
        <SelectedEventBar
          event={selectedPreviewEvent}
          onEdit={onOpenEdit}
          onVoid={onDelete}
          onClear={() => onSelect(null)}
          moveOpen={moveOpen}
          moveDelta={boundedMoveDelta}
          moveWasClamped={!!moveWasClamped}
          moveHasWarning={moveHasWarning}
          onToggleMove={() => { setMoveOpen(value => !value); setMoveDelta(0); }}
          onAdjustMove={adjustMove}
          onApplyMove={applyMove}
          onResetMove={() => setMoveDelta(0)}
        />
      )}

      {activeTab === 'form' && <MiniFormPanel state={state} events={events} />}
      {activeTab === 'sign' && <SignaturePanel state={state} onSaveSignature={onSaveSignature} />}
      {activeTab === 'inspection' && <InspectionPanel state={state} onSaveInspection={onSaveInspection} />}

      {activeTab === 'log' && !selectedEvent && (
        <div className="graph-action-rail">
          <button onClick={() => onOpenAdd({ mode:'choice' })}>Insert</button>
          <button onClick={onToggleSelectMode}>{state.selectMode ? 'Done' : 'Move'}</button>
          <button onClick={onOpenStatus}>Status</button>
          <button onClick={onToggleGps}>Drive</button>
        </div>
      )}

      {activeTab === 'log' && state.selectMode && !selectedEvent && (
        <div className="bulk-strip graph-bulk-strip graph-bulk-compact">
          <button onClick={onSelectAll}>All</button>
          <button onClick={onClearSelection}>Clear</button>
          <button className="primary" onClick={onOpenShift}>Shift</button>
        </div>
      )}

      {activeTab === 'log' && (
        <>
          <EventList events={events} selectedId={state.selectedEventId} selectMode={state.selectMode} selectedIds={state.selectedIds} onSelect={onSelect} onToggleSelected={onToggleSelectedId} onOpenEdit={onOpenEdit} />

          <LogCheckPanel events={events} state={state} />

          <div className="cert-line">
            <b>{state.certifyStatus[state.activeDay]}</b>
            <button onClick={onCertify}>{state.certifyStatus[state.activeDay] === 'Needs Recertification' ? 'RECERTIFY' : 'CERTIFY'}</button>
          </div>
        </>
      )}
    </section>
  );
}
