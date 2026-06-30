import React, { useState } from 'react';
import EditorDutyStatusControls, { DUTY_SHORT_LABELS } from './components/EditorDutyStatusControls.jsx';
import EditorGraphPanel from './components/EditorGraphPanel.jsx';
import EditorTimeControls from './components/EditorTimeControls.jsx';
import EditorLocationFields from './components/EditorLocationFields.jsx';
import EditorNotesField from './components/EditorNotesField.jsx';
import { durLabel, fromInput, toInput, timeLabel } from '../../shared/utils/time.js';
import { label as statusLabel } from '../../shared/utils/status.js';
import { applyEditOverride } from '../../core/timeline/timelineEngine.js';
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

export default function EditEventSheet({ event, events, onClose, onSave, onDelete }) {
  const [status, setStatus] = useState(event.status);
  const [start, setStart] = useState(toInput(event.startMin));
  const [end, setEnd] = useState(toInput(event.endMin));
  const [city, setCity] = useState(event.city || '');
  const [state, setState] = useState(event.state || '');
  const [description, setDescription] = useState(event.description || '');
  const [note, setNote] = useState(event.note || '');
  const [lat, setLat] = useState(event.lat ?? null);
  const [lng, setLng] = useState(event.lng ?? null);
  const [gpsAccuracy, setGpsAccuracy] = useState(event.gpsAccuracy ?? null);
  const [locationSource, setLocationSource] = useState(event.locationSource || 'manual');
  const [gpsStatus, setGpsStatus] = useState('');

  const preview = { ...event, status, startMin: fromInput(start), endMin: Math.max(fromInput(start) + 5, fromInput(end)), city, state, description, note, lat, lng, gpsAccuracy, locationSource };
  const previewEvents = applyEditOverride(events, event.id, preview);
  const durationMinutes = Math.max(0, preview.endMin - preview.startMin);
  const header = `${DUTY_SHORT_LABELS[status]} · ${timeLabel(fromInput(start))} - ${timeLabel(preview.endMin)}`;

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
        />

        <div className="edit-sticky-save"><button className="save-main" onClick={save}>Save</button></div>

        <EditorNotesField note={note} onNoteChange={setNote} />

        {status === 'D' && <div className="warning">Manual Driving entry does not start trip or GPS miles. Use Drive Mode for tracking.</div>}

        <button className="cancel-main" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
