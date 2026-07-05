import React, { useEffect, useMemo, useState } from 'react';
import EditorDutyStatusControls from './components/EditorDutyStatusControls.jsx';
import EditorGraphPanel from './components/EditorGraphPanel.jsx';
import EditorTimeControls from './components/EditorTimeControls.jsx';
import EditorLocationFields from './components/EditorLocationFields.jsx';
import EditorNotesField from './components/EditorNotesField.jsx';
import { fromInput, nowMin, timeLabel, toInput } from '../../shared/utils/time.js';
import { label as statusLabel } from '../../shared/utils/status.js';
import { previewInsertOverride, applyEditOverride } from '../../core/timeline/timelineEngine.js';
import { detectState, guessGpsCity } from '../../core/gps/locationService.js';

const onReasons = ['Pre-trip inspection', 'Pickup / Loading', 'Delivery / Unloading', 'Fuel', 'Waiting', 'Drop Trailer', 'Drop & Hook'];
const offReasons = ['Off Duty', 'Break', 'Parking', 'Personal Conveyance'];
const sbReasons = ['Sleeper Berth', 'Rest'];
const dReasons = ['Driving', 'Yard Move'];

function reasonListForStatus(status) {
  if (status === 'ON') return onReasons;
  if (status === 'OFF') return offReasons;
  if (status === 'SB') return sbReasons;
  return dReasons;
}

function actionHeadingForStatus(status) {
  if (status === 'ON') return 'What are you doing on duty?';
  if (status === 'OFF') return 'Why are you off duty?';
  if (status === 'SB') return 'Sleeper status';
  return 'Driving status';
}

function reasonNeedsLoadLink(status, reason) {
  return status === 'ON' && /pickup|loading|delivery|unloading/i.test(String(reason || ''));
}

function selectedReasonsForStatus(status, note = '') {
  const reasons = reasonListForStatus(status);
  const value = String(note || '').toLowerCase();
  const picked = reasons.filter(reason => value.includes(reason.toLowerCase()));
  return picked.length ? picked : [reasons[0]].filter(Boolean);
}

function joinReasons(reasons = []) {
  return reasons.filter(Boolean).join(' / ');
}

function parseLocationTextLocal(value, fallbackState = '') {
  const raw = String(value || '');
  if (!raw.trim()) return { city: '', state: '' };
  const parts = raw.split(',');
  if (parts.length >= 2) {
    const state = parts.pop().trim().toUpperCase().slice(0, 2);
    return { city: parts.join(',').trim(), state };
  }
  const trailingState = raw.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (trailingState) return { city: trailingState[1].trim(), state: trailingState[2].toUpperCase() };
  return { city: raw.trim(), state: fallbackState || '' };
}

function locationString(city = '', state = '') {
  return [city, state].filter(Boolean).join(', ');
}

function textLooksLikeStatusArtifact(text = '', status = 'OFF') {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return false;
  if (status !== 'ON' && /(pre[- ]?trip|inspection|on duty|pickup|loading|delivery|unloading)/i.test(value)) return true;
  if (status !== 'D' && /driving started|manual driving|\bdriving\b/i.test(value)) return true;
  if (status !== 'SB' && /sleeper/i.test(value)) return true;
  if (status !== 'OFF' && /off duty|parked|parking/i.test(value)) return true;
  if (/\s\/\s/.test(value) && /(pre[- ]?trip|inspection|on duty|driving|new event)/i.test(value)) return true;
  return false;
}

function defaultNoteForStatus(status) {
  return reasonListForStatus(status)[0] || statusLabel(status);
}

function clampMin(v) {
  return Math.max(0, Math.min(1439, Number(v || 0)));
}

function cleanEnd(start, end) {
  return Math.max(start + 5, Math.min(1439, Number(end || start + 15)));
}

function draftEvent({ id='insert_draft', status='ON', startMin, endMin, city='GPS', state='UNK', description='', note='', shippingDocs='', loadNo='', destination='', destinationState='', lat=null, lng=null, gpsAccuracy=null, locationSource='manual' }) {
  const s = clampMin(startMin);
  return {
    id,
    status,
    startMin: s,
    endMin: cleanEnd(s, endMin),
    city,
    state,
    description,
    note,
    shippingDocs,
    loadNo,
    destination,
    destinationState,
    lat,
    lng,
    gpsAccuracy,
    locationSource,
    source: 'manual',
    isDraft: id === 'insert_draft',
  };
}

function eventToForm(e) {
  return {
    status: e?.status || 'ON',
    start: toInput(e?.startMin ?? Math.max(0, nowMin() - 15)),
    end: toInput(e?.endMin ?? Math.min(1439, nowMin())),
    city: e?.city || 'GPS',
    state: e?.state || 'UNK',
    description: e?.description || '',
    note: e?.note || defaultNoteForStatus(e?.status || 'ON'),
    shippingDocs: e?.shippingDocs || e?.loadNo || '',
    loadNo: e?.loadNo || e?.shippingDocs || '',
    destination: e?.destination || '',
    destinationState: e?.destinationState || '',
    lat: e?.lat ?? null,
    lng: e?.lng ?? null,
    gpsAccuracy: e?.gpsAccuracy ?? null,
    locationSource: e?.locationSource || 'manual',
  };
}

// v95.54: the old default (always "15 minutes ago") silently backdated a new
// event on top of a status change the driver just made — e.g. a Driving insert
// defaulted right over a fresh ON DUTY Pre-trip and deleted it. If any existing
// event overlaps the backdate window, default the new event to start now.
function safeDefaultStart(events = []) {
  const now = Math.max(0, Math.min(1439, nowMin()));
  const backdated = Math.max(0, now - 15);
  const overlapsBackdateWindow = (events || []).some(e => {
    const start = Number(e?.startMin ?? -1);
    const end = Number(e?.endMin ?? start);
    return Number.isFinite(start) && Number.isFinite(end) && end > backdated && start < now;
  });
  if (overlapsBackdateWindow) return now;
  return backdated;
}

export default function AddStatusSheet({ defaults = {}, events, onClose, onSave, onCreate, onUpdate }) {
  const defaultStart = defaults.startMin ?? safeDefaultStart(events);
  const createFn = onCreate || onSave;
  const initialMode = defaults.selectedEventId ? 'edit' : (defaults.mode === 'select' ? 'select' : 'insert');

  const [mode, setMode] = useState(initialMode);
  const [selectedEventId, setSelectedEventId] = useState(defaults.selectedEventId || null);
  const [cursorMin, setCursorMin] = useState(defaultStart);
  const [gpsStatus, setGpsStatus] = useState('');

  const [insertDraftEvent, setInsertDraftEvent] = useState(() => draftEvent({
    status: defaults.status || 'ON',
    startMin: defaultStart,
    endMin: Math.min(1439, defaultStart + 15),
    city: defaults.city || 'GPS',
    state: defaults.state || 'UNK',
    note: defaultNoteForStatus(defaults.status || 'ON'),
    shippingDocs: defaults.shippingDocs || defaults.loadNo || '',
    loadNo: defaults.loadNo || defaults.shippingDocs || '',
    destination: defaults.destination || '',
    destinationState: defaults.destinationState || '',
  }));

  const selectedExisting = useMemo(
    () => events.find(e => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const activeEvent = mode === 'insert' ? insertDraftEvent : selectedExisting;
  const [form, setForm] = useState(() => eventToForm(activeEvent || insertDraftEvent));

  useEffect(() => {
    if ((mode === 'select' || mode === 'edit') && selectedExisting) {
      setMode('edit');
      setForm(eventToForm(selectedExisting));
    }
  }, [selectedEventId]);

  useEffect(() => {
    if (mode === 'insert') {
      setForm(eventToForm(insertDraftEvent));
    }
  }, [insertDraftEvent.id, insertDraftEvent.status, insertDraftEvent.startMin, insertDraftEvent.endMin]);

  function applyGps(auto = false) {
    if (!navigator.geolocation) {
      setGpsStatus('GPS unavailable. Type location manually.');
      return;
    }
    setGpsStatus(auto ? 'Getting GPS…' : 'Getting GPS location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const guessed = guessGpsCity(lat, lng);
        const gpsPatch = {
          city: guessed.city || 'GPS',
          state: guessed.state || detectState(lat, lng),
          lat,
          lng,
          gpsAccuracy: pos.coords.accuracy || null,
          locationSource: 'gps',
        };
        setGpsStatus(`GPS: ${gpsPatch.city}, ${gpsPatch.state}`);
        updateForm(gpsPatch);
      },
      () => setGpsStatus('GPS blocked. Type location manually.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function updateForm(patch) {
    setForm(prev => {
      let next = { ...prev, ...patch };
      if (patch.status && patch.status !== prev.status) {
        next = {
          ...next,
          note: defaultNoteForStatus(patch.status),
          description: textLooksLikeStatusArtifact(prev.description, patch.status) ? '' : '',
        };
      } else if (patch.status && (textLooksLikeStatusArtifact(next.note, patch.status) || /^new event$/i.test(String(next.note || '').trim()))) {
        next = { ...next, note: defaultNoteForStatus(patch.status), description: textLooksLikeStatusArtifact(next.description, patch.status) ? '' : next.description };
      }
      if (mode === 'insert') {
        const s = fromInput(next.start);
        const e = fromInput(next.end);
        setInsertDraftEvent(d => ({
          ...d,
          status: next.status,
          startMin: s,
          endMin: cleanEnd(s, e),
          city: next.city,
          state: next.state,
          description: next.description,
          note: next.note,
          shippingDocs: next.shippingDocs,
          loadNo: next.loadNo,
          destination: next.destination,
          destinationState: next.destinationState,
          lat: next.lat,
          lng: next.lng,
          gpsAccuracy: next.gpsAccuracy,
          locationSource: next.locationSource,
        }));
      }
      return next;
    });
  }

  function selectEvent(id) {
    const existing = events.find(e => e.id === id);
    if (!existing) return;
    setSelectedEventId(id);
    setMode('edit');
    setForm(eventToForm(existing));
  }

  function startInsert() {
    const start = clampMin(cursorMin || nowMin());
    const lastStatus = selectedExisting?.status || insertDraftEvent.status || 'ON';
    const next = draftEvent({
      status: lastStatus,
      startMin: start,
      endMin: Math.min(1439, start + 15),
      city: form.city || 'GPS',
      state: form.state || 'UNK',
      note: defaultNoteForStatus(lastStatus),
      lat: form.lat,
      lng: form.lng,
      gpsAccuracy: form.gpsAccuracy,
      locationSource: form.locationSource,
    });
    setSelectedEventId(null);
    setInsertDraftEvent(next);
    setForm(eventToForm(next));
    setMode('insert');
  }

  function graphEmptyTap(status, startMin) {
    setCursorMin(startMin);
    const next = draftEvent({
      ...insertDraftEvent,
      status: form.status || status || insertDraftEvent.status || 'ON',
      startMin,
      endMin: Math.min(1439, startMin + 15),
      city: form.city || insertDraftEvent.city || 'GPS',
      state: form.state || insertDraftEvent.state || 'UNK',
      description: form.description || insertDraftEvent.description || '',
      note: form.note || insertDraftEvent.note || '',
      shippingDocs: form.shippingDocs || insertDraftEvent.shippingDocs || '',
      loadNo: form.loadNo || form.shippingDocs || insertDraftEvent.loadNo || '',
      destination: form.destination || insertDraftEvent.destination || '',
      destinationState: form.destinationState || insertDraftEvent.destinationState || '',
      lat: form.lat,
      lng: form.lng,
      gpsAccuracy: form.gpsAccuracy,
      locationSource: form.locationSource || insertDraftEvent.locationSource || 'manual',
    });
    setSelectedEventId(null);
    setInsertDraftEvent(next);
    setForm(eventToForm(next));
    setMode('insert');
  }

  function onEditTime(edge, minute) {
    const current = mode === 'insert' ? insertDraftEvent : selectedExisting;
    if (!current) return;

    let s = mode === 'insert' ? current.startMin : fromInput(form.start);
    let e = mode === 'insert' ? current.endMin : fromInput(form.end);
    if (edge === 'start') s = Math.min(minute, e - 5);
    if (edge === 'end') e = Math.max(minute, s + 5);

    if (mode === 'insert') {
      const next = { ...insertDraftEvent, startMin: s, endMin: e };
      setInsertDraftEvent(next);
      setForm(eventToForm(next));
      return;
    }

    setForm(prev => ({ ...prev, start: toInput(s), end: toInput(e) }));
  }

  function quick(minAgo) {
    const s = Math.max(0, nowMin() - minAgo);
    const e = Math.min(1439, s + 15);
    updateForm({ start: toInput(s), end: toInput(e) });
    if (mode === 'insert') {
      setInsertDraftEvent(d => ({ ...d, startMin: s, endMin: e }));
    }
  }

  function setFullDay(status='OFF') {
    updateForm({
      status,
      start: toInput(0),
      end: toInput(1439),
      note: status === 'OFF' ? 'Off Duty' : form.note,
    });
    if (mode === 'insert') {
      setInsertDraftEvent(d => ({ ...d, status, startMin: 0, endMin: 1439, note: status === 'OFF' ? 'Off Duty' : d.note }));
    }
  }

  function graphEvents() {
    if (mode === 'insert') {
      const d = draftEvent({
        ...insertDraftEvent,
        status: form.status,
        startMin: fromInput(form.start),
        endMin: fromInput(form.end),
        city: form.city,
        state: form.state,
        description: form.description,
        note: form.note,
        shippingDocs: form.shippingDocs,
        loadNo: form.loadNo || form.shippingDocs,
        destination: form.destination,
        destinationState: form.destinationState,
        lat: form.lat,
        lng: form.lng,
        gpsAccuracy: form.gpsAccuracy,
        locationSource: form.locationSource,
      });
      return previewInsertOverride(events, d);
    }

    if (mode === 'edit' && selectedExisting) {
      const patch = {
        status: form.status,
        startMin: fromInput(form.start),
        endMin: fromInput(form.end),
        city: form.city,
        state: form.state,
        description: form.description,
        note: form.note,
        shippingDocs: form.shippingDocs,
        loadNo: form.loadNo || form.shippingDocs,
        destination: form.destination,
        destinationState: form.destinationState,
        lat: form.lat,
        lng: form.lng,
        gpsAccuracy: form.gpsAccuracy,
        locationSource: form.locationSource,
      };
      return applyEditOverride(events, selectedExisting.id, patch);
    }

    return events;
  }

  function save() {
    const s = fromInput(form.start);
    const payload = {
      status: form.status,
      startMin: s,
      endMin: cleanEnd(s, fromInput(form.end)),
      city: form.city || 'GPS',
      state: form.state || 'UNK',
      description: textLooksLikeStatusArtifact(form.description, form.status) ? '' : form.description,
      note: (textLooksLikeStatusArtifact(form.note, form.status) || /^new event$/i.test(String(form.note || '').trim())) ? defaultNoteForStatus(form.status) : (form.note || defaultNoteForStatus(form.status)),
      shippingDocs: String(form.shippingDocs || form.loadNo || '').trim(),
      loadNo: String(form.loadNo || form.shippingDocs || '').trim(),
      destination: String(form.destination || '').trim(),
      destinationState: String(form.destinationState || '').trim(),
      lat: form.lat,
      lng: form.lng,
      gpsAccuracy: form.gpsAccuracy,
      locationSource: form.locationSource || 'manual',
      source: mode === 'insert' ? 'manual' : (selectedExisting?.source || 'manual'),
    };

    if (mode === 'edit' && selectedExisting) {
      if (onUpdate) onUpdate(selectedExisting.id, payload);
      else if (createFn) createFn({ id: selectedExisting.id, ...payload });
      return;
    }

    if (mode === 'insert') {
      createFn?.(payload);
      return;
    }
  }

  function setReason(reason) {
    updateForm({ note: reason, description: textLooksLikeStatusArtifact(form.description, form.status) ? '' : form.description });
  }

  function setDuration(minutes) {
    const start = fromInput(form.start);
    const end = Math.min(1439, start + minutes);
    updateForm({ end: toInput(end) });
    if (mode === 'insert') setInsertDraftEvent(d => ({ ...d, startMin:start, endMin:end }));
  }

  function splitPreviewText() {
    if (mode !== 'insert') return '';
    const s = fromInput(form.start);
    const e = cleanEnd(s, fromInput(form.end));
    const covering = events.find(ev => Number(ev.startMin || 0) < e && Number(ev.endMin || 0) > s);
    if (!covering) return `Adds ${statusLabel(form.status)} from ${timeLabel(s)} to ${timeLabel(e)}.`;
    return `Will split ${statusLabel(covering.status)} at ${timeLabel(s)} and resume after ${timeLabel(e)}.`;
  }

  const selectedReasons = selectedReasonsForStatus(form.status, form.note);

  function toggleReason(reason) {
    const current = selectedReasonsForStatus(form.status, form.note);
    const exists = current.includes(reason);
    const next = exists
      ? (current.length > 1 ? current.filter(item => item !== reason) : current)
      : [...current, reason];

    updateForm({
      note: joinReasons(next),
      description: textLooksLikeStatusArtifact(form.description, form.status) ? '' : form.description,
    });
  }

  const previewEvents = graphEvents();
  const activeId = mode === 'insert' ? insertDraftEvent.id : selectedEventId;
  const graphHeader = activeEvent
    ? `${statusLabel(form.status)} · ${timeLabel(fromInput(form.start))} - ${timeLabel(fromInput(form.end))}`
    : 'Tap event to edit';

  return (
    <div className="sheet active v30-insert editor-clean-v85">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>Insert Events</div><span></span></div>

      <EditorDutyStatusControls
        status={form.status}
        onChange={(st) => updateForm({ status: st })}
      />

      <div className="insert-driver-block">
        <div className="insert-section-title">{actionHeadingForStatus(form.status)} <span className="multi-pick-hint">Pick one or more</span></div>
        <div className="insert-reason-grid">
          {reasonListForStatus(form.status).map(reason => (
            <button
              key={reason}
              type="button"
              className={selectedReasons.includes(reason) ? 'picked' : ''}
              onClick={() => toggleReason(reason)}
            >
              {reason}
            </button>
          ))}
        </div>
      </div>

      <EditorGraphPanel
        events={previewEvents}
        selectedId={activeId}
        editId={activeId}
        onEditTime={activeId ? onEditTime : undefined}
        onSelect={selectEvent}
        onEmptyTap={graphEmptyTap}
        header={graphHeader}
      />

      <div className="form editor-form-v85">
        {mode === 'select' && !selectedExisting ? (
          <div className="v79-select-empty"><b>Select an event on the graph</b><span>Tap an empty graph row to create a new line.</span></div>
        ) : (
          <>
            <EditorTimeControls
              start={form.start}
              end={form.end}
              onStartChange={(v) => updateForm({ start: v })}
              onEndChange={(v) => updateForm({ end: v })}
              quickRow={mode === 'insert' ? (
                <div className="quick-row insert-quick-v85">
                  <button onClick={() => quick(0)}>NOW</button>
                  <button onClick={() => quick(10)}>10 MIN AGO</button>
                  <button onClick={() => quick(15)}>15 MIN AGO</button>
                  <button onClick={() => quick(30)}>30 MIN AGO</button>
                </div>
              ) : null}
            />

            {mode === 'insert' && (
              <div className="insert-duration-panel">
                <div className="insert-section-title">Duration</div>
                <div className="insert-duration-grid">
                  {[1, 5, 15, 30].map(min => (
                    <button key={min} type="button" onClick={() => setDuration(min)}>{min}m</button>
                  ))}
                  <button type="button" onClick={() => setDuration(Math.max(1, nowMin() - fromInput(form.start)))}>Until now</button>
                </div>
                <div className="insert-split-preview">{splitPreviewText()}</div>
              </div>
            )}

            {reasonNeedsLoadLink(form.status, form.note) && (
              <div className="insert-load-link">
                <div className="insert-section-title">Linked load</div>
                <div className="insert-load-grid">
                  <label>
                    <span>BOL / Shipping #</span>
                    <input value={form.shippingDocs || ''} onChange={e => updateForm({ shippingDocs:e.target.value, loadNo:e.target.value })} placeholder="Load or BOL #" />
                  </label>
                  <label>
                    <span>{/delivery|unloading/i.test(form.note || '') ? 'Delivery location' : 'Going to'}</span>
                    <input
                      value={form.destination || ''}
                      onChange={e => {
                        const parsed = parseLocationTextLocal(e.target.value, form.destinationState || '');
                        updateForm({ destination:e.target.value, destinationState: parsed.state || form.destinationState || '' });
                      }}
                      onBlur={e => {
                        const parsed = parseLocationTextLocal(e.target.value, form.destinationState || '');
                        updateForm({ destination: locationString(parsed.city, parsed.state), destinationState: parsed.state });
                      }}
                      placeholder="City, ST"
                    />
                  </label>
                </div>
              </div>
            )}

            <EditorLocationFields
              city={form.city}
              state={form.state}
              onLocationChange={(c, s) => updateForm({ city: c, state: s, lat: null, lng: null, gpsAccuracy: null, locationSource: 'manual' })}
              description={form.description}
              onDescriptionChange={(v) => updateForm({ description: v })}
              onGps={() => applyGps(false)}
              gpsStatus={gpsStatus}
              suggestions={['Gary, IN', 'Gurnee, IL', 'Romeoville, IL', 'Joliet, IL', 'Bolingbrook, IL', 'Chicago, IL', 'Toledo, OH']}
              collapsedDescription
              onClear={() => updateForm({ city: '', state: '', lat: null, lng: null, gpsAccuracy: null, locationSource: 'manual' })}
            />

            <div className="edit-sticky-save"><button className="save-main" onClick={save}>{mode === 'insert' ? `Save ${form.status} · ${Math.max(1, fromInput(form.end) - fromInput(form.start))}m` : 'Save changes'}</button></div>

            <details className="insert-notes-details">
              <summary>+ Add note optional</summary>
              <EditorNotesField note={form.note} onNoteChange={(v) => updateForm({ note: v })} />
            </details>
          </>
        )}
        <button className="cancel-main" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
