import React, { useEffect, useMemo, useState } from 'react';
import EditorDutyStatusControls, { DUTY_SHORT_LABELS } from './components/EditorDutyStatusControls.jsx';
import EditorGraphPanel from './components/EditorGraphPanel.jsx';
import EditorTimeControls from './components/EditorTimeControls.jsx';
import EditorLocationFields from './components/EditorLocationFields.jsx';
import EditorNotesField from './components/EditorNotesField.jsx';
import { durLabel, fromInput, toInput, timeLabel } from '../../shared/utils/time.js';
import { label as statusLabel } from '../../shared/utils/status.js';
import { applyPatchWithNeighbors } from '../../core/timeline/timelineEngine.js';
import { detectState, guessGpsCity } from '../../core/gps/locationService.js';

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
    setGpsStatus('');
  }, [event.id]);

  const preview = { ...event, status, startMin: fromInput(start), endMin: Math.max(fromInput(start) + 5, fromInput(end)), city, state, description, note, lat, lng, gpsAccuracy, locationSource };
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
    locationSource !== initialForm.locationSource;

  function handleGraphSelect(nextId) {
    if (!nextId || nextId === event.id) return;
    if (dirty) {
      const ok = window.confirm?.('Switch to another event and discard unsaved changes?');
      if (!ok) return;
    }
    onSwitch?.(nextId);
  }

  function applyGps() {
    if (!navigator.geolocation) {
      setGpsStatus('GPS unavailable. Type location manually.');
      return;
    }

    setGpsStatus('Getting GPS location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLat = pos.coords.latitude;
        const nextLng = pos.coords.longitude;
        const guessed = guessGpsCity(nextLat, nextLng);
        const nextCity = guessed.city || 'GPS';
        const nextState = guessed.state || detectState(nextLat, nextLng);
        setCity(nextCity);
        setState(nextState);
        setLat(nextLat);
        setLng(nextLng);
        setGpsAccuracy(pos.coords.accuracy || null);
        setLocationSource('gps');
        setGpsStatus(`GPS locked · ${nextCity}, ${nextState}`);
      },
      () => setGpsStatus('GPS blocked/unavailable. Type location manually.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  function manualLocation(c, s) {
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
    onSave({ status, startMin: preview.startMin, endMin: preview.endMin, city, state, description: cleanDescription, note: cleanNote, lat, lng, gpsAccuracy, locationSource });
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
          description={description}
          onDescriptionChange={setDescription}
          onGps={applyGps}
          gpsStatus={gpsStatus}
          onClear={() => manualLocation('', '')}
          collapsedDescription
        />

        <div className="edit-sticky-save"><button className="save-main" onClick={save}>Save</button></div>

        <EditorNotesField note={note} onNoteChange={setNote} />

        <button className="cancel-main" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
