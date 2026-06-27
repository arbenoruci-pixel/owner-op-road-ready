import React, { useState } from 'react';
import EditorDutyStatusControls, { DUTY_SHORT_LABELS } from './components/EditorDutyStatusControls.jsx';
import EditorGraphPanel from './components/EditorGraphPanel.jsx';
import EditorTimeControls from './components/EditorTimeControls.jsx';
import EditorLocationFields from './components/EditorLocationFields.jsx';
import EditorNotesField from './components/EditorNotesField.jsx';
import { fromInput, toInput, timeLabel } from '../../shared/utils/time.js';
import { applyEditOverride } from '../../core/timeline/timelineEngine.js';
import { detectState, guessGpsCity } from '../../core/gps/locationService.js';

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

  function save() {
    onSave({ status, startMin: preview.startMin, endMin: preview.endMin, city, state, description, note, lat, lng, gpsAccuracy, locationSource });
    onClose();
  }

  return (
    <div className="sheet active editor-clean-v85">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>Edit Duty Status</div><button onClick={onDelete}>⋮</button></div>

      <EditorDutyStatusControls status={status} onChange={setStatus} />

      <EditorGraphPanel
        events={previewEvents}
        selectedId={event.id}
        editId={event.id}
        onEditTime={(edge, m) => edge === 'start' ? setStart(toInput(m)) : setEnd(toInput(m))}
        header={header}
      />

      <div className="form editor-form-v85">
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
