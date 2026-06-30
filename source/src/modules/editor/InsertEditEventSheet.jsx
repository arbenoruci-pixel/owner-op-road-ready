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
  return statusLabel(status);
}

function clampMin(v) {
  return Math.max(0, Math.min(1439, Number(v || 0)));
}

function cleanEnd(start, end) {
  return Math.max(start + 5, Math.min(1439, Number(end || start + 15)));
}

function draftEvent({ id='insert_draft', status='ON', startMin, endMin, city='GPS', state='UNK', description='', note='', lat=null, lng=null, gpsAccuracy=null, locationSource='manual' }) {
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
    note: e?.note || '',
    lat: e?.lat ?? null,
    lng: e?.lng ?? null,
    gpsAccuracy: e?.gpsAccuracy ?? null,
    locationSource: e?.locationSource || 'manual',
  };
}

export default function AddStatusSheet({ defaults = {}, events, onClose, onSave, onCreate, onUpdate }) {
  const defaultStart = defaults.startMin ?? Math.max(0, nowMin() - 15);
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
    note: defaults.status === 'D' ? 'Driving' : 'New event',
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
      note: lastStatus === 'D' ? 'Driving' : 'New event',
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

            <EditorLocationFields
              city={form.city}
              state={form.state}
              onLocationChange={(c, s) => updateForm({ city: c, state: s, lat: null, lng: null, gpsAccuracy: null, locationSource: 'manual' })}
              description={form.description}
              onDescriptionChange={(v) => updateForm({ description: v })}
              onGps={() => applyGps(false)}
              gpsStatus={gpsStatus}
              onClear={() => updateForm({ city: '', state: '', lat: null, lng: null, gpsAccuracy: null, locationSource: 'manual' })}
            />

            <div className="edit-sticky-save"><button className="save-main" onClick={save}>{mode === 'insert' ? 'Save new event' : 'Save changes'}</button></div>

            <EditorNotesField note={form.note} onNoteChange={(v) => updateForm({ note: v })} />
          </>
        )}
        <button className="cancel-main" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
