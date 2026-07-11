import React, { useEffect, useMemo, useRef, useState } from 'react';
import EditorDutyStatusControls, { DUTY_SHORT_LABELS } from './components/EditorDutyStatusControls.jsx';
import EditorGraphPanel from './components/EditorGraphPanel.jsx';
import EditorTimeControls from './components/EditorTimeControls.jsx';
import EditorLocationFields from './components/EditorLocationFields.jsx';
import EditorNotesField from './components/EditorNotesField.jsx';
import { durLabel, fromInput, toInput, timeLabel } from '../../shared/utils/time.js';
import { label as statusLabel } from '../../shared/utils/status.js';
import { applyPatchWithNeighbors } from '../../core/timeline/timelineEngine.js';
import { getAccurateGpsLocation } from '../../core/gps/locationService.js';

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

function parseCityState(value = '', fallbackState = '') {
  const raw = String(value || '').trim();
  if (!raw) return { city:'', state:'' };
  const parts = raw.split(',');
  if (parts.length >= 2) {
    const state = parts.pop().trim().toUpperCase().slice(0, 2);
    return { city:parts.join(',').trim(), state };
  }
  const trailing = raw.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (trailing) return { city:trailing[1].trim(), state:trailing[2].toUpperCase() };
  return { city:raw, state:String(fallbackState || '').trim().toUpperCase().slice(0, 2) };
}

function cityStateText(city = '', state = '') {
  return [String(city || '').trim(), String(state || '').trim().toUpperCase().slice(0, 2)].filter(Boolean).join(', ');
}

function loadActivityKind(status = '', note = '', description = '') {
  if (status !== 'ON') return '';
  const text = `${note || ''} ${description || ''}`;
  if (/pickup|pick up|loading/i.test(text)) return 'pickup';
  if (/delivery|unloading/i.test(text)) return 'delivery';
  return '';
}

function formStateFromEvent(event = {}) {
  return {
    status:event.status,
    start:toInput(event.startMin),
    end:toInput(event.endMin),
    city:event.city || '',
    state:event.state || '',
    description:event.description || '',
    note:event.note || '',
    lat:event.lat ?? null,
    lng:event.lng ?? null,
    gpsAccuracy:event.gpsAccuracy ?? null,
    locationSource:event.locationSource || 'manual',
    shippingDocs:event.shippingDocs || event.loadNo || event.bol || '',
    destination:event.destination || cityStateText(event.destinationCity || '', event.destinationState || ''),
    destinationState:event.destinationState || '',
  };
}

function sameValue(a, b) {
  return String(a ?? '') === String(b ?? '');
}

export default function EditEventSheet({ event, events, onClose, onSave, onDelete, onSwitch }) {
  const initialForm = useMemo(() => formStateFromEvent(event), [event.id]);
  const [status, setStatus] = useState(initialForm.status);
  const [start, setStart] = useState(initialForm.start);
  const [end, setEnd] = useState(initialForm.end);
  const [city, setCity] = useState(initialForm.city);
  const [state, setState] = useState(initialForm.state);
  const [description, setDescription] = useState(initialForm.description);
  const [note, setNote] = useState(initialForm.note);
  const [lat, setLat] = useState(initialForm.lat);
  const [lng, setLng] = useState(initialForm.lng);
  const [gpsAccuracy, setGpsAccuracy] = useState(initialForm.gpsAccuracy);
  const [locationSource, setLocationSource] = useState(initialForm.locationSource);
  const [gpsStatus, setGpsStatus] = useState('');
  const [gpsPending, setGpsPending] = useState(false);
  const [shippingDocs, setShippingDocs] = useState(initialForm.shippingDocs);
  const [destination, setDestination] = useState(initialForm.destination);
  const gpsRequestId = useRef(0);
  const manualLocationDirty = useRef(false);

  useEffect(() => {
    const next = formStateFromEvent(event);
    setStatus(next.status);
    setStart(next.start);
    setEnd(next.end);
    setCity(next.city);
    setState(next.state);
    setDescription(next.description);
    setNote(next.note);
    setLat(next.lat);
    setLng(next.lng);
    setGpsAccuracy(next.gpsAccuracy);
    setLocationSource(next.locationSource);
    setShippingDocs(next.shippingDocs);
    setDestination(next.destination);
    gpsRequestId.current += 1;
    manualLocationDirty.current = false;
    setGpsPending(false);
    setGpsStatus('');
  }, [event.id]);

  const activityKind = loadActivityKind(status, note, description);
  const destinationParts = parseCityState(destination, initialForm.destinationState || '');
  const preview = {
    ...event,
    status,
    startMin:fromInput(start),
    endMin:Math.max(fromInput(start) + 5, fromInput(end)),
    city,
    state,
    description,
    note,
    lat,
    lng,
    gpsAccuracy,
    locationSource,
    shippingDocs:activityKind ? shippingDocs.trim() : '',
    loadNo:activityKind ? shippingDocs.trim() : '',
    destination:activityKind ? cityStateText(destinationParts.city, destinationParts.state) : '',
    destinationState:activityKind ? destinationParts.state : '',
  };
  const previewEvents = applyPatchWithNeighbors(events, event.id, preview);
  const durationMinutes = Math.max(0, preview.endMin - preview.startMin);
  const header = `${DUTY_SHORT_LABELS[status]} · ${timeLabel(fromInput(start))} - ${timeLabel(preview.endMin)}`;
  const dirty = status !== initialForm.status ||
    start !== initialForm.start ||
    end !== initialForm.end ||
    city !== initialForm.city ||
    state !== initialForm.state ||
    description !== initialForm.description ||
    note !== initialForm.note ||
    !sameValue(lat, initialForm.lat) ||
    !sameValue(lng, initialForm.lng) ||
    !sameValue(gpsAccuracy, initialForm.gpsAccuracy) ||
    locationSource !== initialForm.locationSource ||
    shippingDocs !== initialForm.shippingDocs ||
    destination !== initialForm.destination;

  function handleGraphSelect(nextId) {
    if (!nextId || nextId === event.id) return;
    if (dirty) {
      const ok = window.confirm?.('Switch to another event and discard unsaved changes?');
      if (!ok) return;
    }
    onSwitch?.(nextId);
  }

  async function applyGps() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('GPS unavailable. Type location manually.');
      return;
    }

    const requestId = gpsRequestId.current + 1;
    gpsRequestId.current = requestId;
    manualLocationDirty.current = false;
    setGpsPending(true);
    setGpsStatus('Improving GPS accuracy…');

    try {
      const fix = await getAccurateGpsLocation({
        durationMs:12000,
        targetAccuracy:40,
        maximumAge:0,
        minimumSamples:2,
        rejectCoarseFix:true,
        maximumAcceptedAccuracy:250,
      });
      if (gpsRequestId.current !== requestId || manualLocationDirty.current) return;
      const nextCity = fix.city || 'GPS';
      const nextState = fix.state || 'UNK';
      setCity(nextCity);
      setState(nextState);
      setLat(fix.lat ?? null);
      setLng(fix.lng ?? null);
      setGpsAccuracy(fix.accuracy ?? null);
      setLocationSource('gps');
      setGpsPending(false);
      setGpsStatus(`GPS locked · ${nextCity}, ${nextState}${fix.accuracy != null ? ` · ±${Math.round(fix.accuracy)} m` : ''}`);
    } catch (error) {
      if (gpsRequestId.current !== requestId) return;
      setGpsPending(false);
      if (manualLocationDirty.current) return;
      if (error?.code === 'GPS_ACCURACY') {
        setGpsStatus(`GPS signal too weak${Number.isFinite(error.accuracy) ? ` (±${Math.round(error.accuracy)} m)` : ''}. Tap GPS again or type City, ST.`);
      } else {
        setGpsStatus('GPS blocked/unavailable. Type location manually.');
      }
    }
  }

  function markManualLocationDraft() {
    manualLocationDirty.current = true;
    gpsRequestId.current += 1;
    setGpsPending(false);
    setGpsStatus('Manual location');
  }

  function manualLocation(c, s) {
    markManualLocationDraft();
    setCity(c);
    setState(s);
    setLat(null);
    setLng(null);
    setGpsAccuracy(null);
    setLocationSource('manual');
    setGpsStatus(c || s ? 'Manual location' : 'Location cleared');
  }

  function changeStatus(nextStatus) {
    const previousStatus = status;
    setStatus(nextStatus);
    if (previousStatus !== nextStatus || textLooksLikeStatusArtifact(note, nextStatus) || /^new event$/i.test(String(note || '').trim())) {
      setNote(statusLabel(nextStatus));
    }
    if (previousStatus !== nextStatus || textLooksLikeStatusArtifact(description, nextStatus) || /^new event$/i.test(String(description || '').trim())) {
      setDescription('');
    }
  }

  function save() {
    const cleanNote = textLooksLikeStatusArtifact(note, status) || /^new event$/i.test(String(note || '').trim()) ? statusLabel(status) : note;
    const cleanDescription = textLooksLikeStatusArtifact(description, status) || /^new event$/i.test(String(description || '').trim()) ? '' : description;
    const kind = loadActivityKind(status, cleanNote, cleanDescription);
    const goingTo = parseCityState(destination, initialForm.destinationState || '');
    onSave({
      status,
      startMin:preview.startMin,
      endMin:preview.endMin,
      city,
      state,
      description:cleanDescription,
      note:cleanNote,
      lat,
      lng,
      gpsAccuracy,
      locationSource,
      shippingDocs:kind ? shippingDocs.trim() : '',
      loadNo:kind ? shippingDocs.trim() : '',
      bol:kind ? shippingDocs.trim() : '',
      destination:kind ? cityStateText(goingTo.city, goingTo.state) : '',
      destinationState:kind ? goingTo.state : '',
      loadDetailsExplicit:!!kind,
      shippingDocsUpdatedAt:kind ? Date.now() : (event.shippingDocsUpdatedAt || null),
    });
    onClose();
  }

  return (
    <div className="sheet active editor-clean-v85">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>Edit Duty Status</div><button onClick={onDelete}>⋮</button></div>

      <EditorDutyStatusControls status={status} onChange={changeStatus} />

      <EditorGraphPanel
        events={previewEvents}
        selectedId={event.id}
        editId={event.id}
        onEditTime={(edge, m) => edge === 'start' ? setStart(toInput(m)) : setEnd(toInput(m))}
        onSelect={handleGraphSelect}
        onEmptyTap={() => {}}
        header={header}
      />

      <div className="form editor-form-v85">
        <div className="selected-duration-live">
          <span>Selected event time</span>
          <b>{durLabel(durationMinutes)}</b>
          <em>{timeLabel(preview.startMin, true)} – {timeLabel(preview.endMin, true)}</em>
        </div>

        <EditorTimeControls start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />

        <EditorLocationFields
          city={city}
          state={state}
          onLocationChange={manualLocation}
          onLocationDraftChange={markManualLocationDraft}
          description={description}
          onDescriptionChange={setDescription}
          onGps={applyGps}
          gpsStatus={gpsStatus}
          onClear={() => manualLocation('', '')}
          collapsedDescription
        />

        {activityKind && (
          <section className="form-section editor-pickup-details">
            <div className="form-label-row">
              <div className="form-label">{activityKind === 'pickup' ? 'Pickup details' : 'Delivery details'}</div>
              <span>saved on this event</span>
            </div>
            <div className="driver-load-grid">
              <label>
                <span>BOL / Shipping document #</span>
                <input
                  value={shippingDocs}
                  onChange={(e) => setShippingDocs(e.target.value)}
                  placeholder="BOL or load reference"
                  autoComplete="off"
                />
              </label>
              <label>
                <span>{activityKind === 'pickup' ? 'Going to' : 'Delivery location'}</span>
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="City, ST"
                  autoComplete="off"
                />
              </label>
            </div>
          </section>
        )}

        <div className="edit-sticky-save"><button className="save-main" onClick={save} disabled={gpsPending}>{gpsPending ? 'Locking GPS…' : 'Save'}</button></div>

        <EditorNotesField note={note} onNoteChange={setNote} />

        <button className="cancel-main" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
