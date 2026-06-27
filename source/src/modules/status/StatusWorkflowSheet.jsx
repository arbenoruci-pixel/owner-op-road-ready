import React, { useEffect, useRef, useState } from 'react';
import { label } from '../../shared/utils/status.js';
import { detectState, guessGpsCity } from '../../core/gps/locationService.js';

const onReasons = ['Pre-trip inspection', 'Fuel', 'Pickup / Loading', 'Delivery / Unloading', 'Waiting', 'Drop Trailer', 'Drop & Hook'];
const offReasons = ['Off Duty', 'Break', 'Parking', 'Personal Conveyance'];
const sbReasons = ['Sleeper Berth', 'Rest'];
const dReasons = ['Driving', 'Yard Move'];


function parseLocationText(value, fallbackState = '') {
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

function reasonList(status) {
  if (status === 'ON') return onReasons;
  if (status === 'OFF') return offReasons;
  if (status === 'SB') return sbReasons;
  return dReasons;
}

export default function StatusWorkflowSheet({ state, onClose, onApplyStatus, onStartDriving }) {
  const [status, setStatus] = useState(state.currentStatus || 'OFF');
  const [city, setCity] = useState(state.currentLocation?.city || 'Chicago');
  const [st, setSt] = useState(state.currentLocation?.state || 'IL');
  const [reason, setReason] = useState(reasonList(state.currentStatus || 'OFF')[0]);
  const [notes, setNotes] = useState('');
  const [gpsFix, setGpsFix] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('');
  const askedOffGps = useRef(false);

  function applyFix(position) {
    const coords = position.coords || {};
    const lat = coords.latitude;
    const lng = coords.longitude;
    const detectedState = detectState(lat, lng);
    const guessed = guessGpsCity(lat, lng);
    const nextCity = guessed.city || 'GPS';
    const nextState = guessed.state || detectedState || 'UNK';

    setCity(nextCity);
    setSt(nextState);
    setGpsFix({
      lat,
      lng,
      accuracy: coords.accuracy || null,
      timestamp: position.timestamp || Date.now(),
      city: nextCity,
      state: nextState,
      source: 'gps',
    });
    setGpsStatus(`GPS locked · ${nextCity}, ${nextState}`);
  }

  function useGps(auto = false) {
    if (!navigator.geolocation) {
      setGpsStatus('GPS not available. Type location manually.');
      return;
    }

    setGpsStatus(auto ? 'Getting GPS for OFF duty…' : 'Getting GPS…');

    navigator.geolocation.getCurrentPosition(
      applyFix,
      () => {
        setGpsStatus('GPS blocked/unavailable. Type location manually.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  useEffect(() => {
    if (status === 'OFF' && !askedOffGps.current) {
      askedOffGps.current = true;
      useGps(true);
    }
  }, [status]);

  function choose(next) {
    setStatus(next);
    setReason(reasonList(next)[0]);
    if (next === 'OFF') {
      askedOffGps.current = false;
      setTimeout(() => useGps(true), 0);
    }
  }

  function payload() {
    return {
      status,
      reason,
      city,
      state: st,
      description: notes,
      droppedTrailer: '',
      hookedTrailer: '',
      lat: gpsFix?.lat ?? null,
      lng: gpsFix?.lng ?? null,
      gpsAccuracy: gpsFix?.accuracy ?? null,
      locationSource: gpsFix ? 'gps' : 'manual',
    };
  }

  function save() {
    const p = payload();
    if (status === 'D') {
      onStartDriving({ city:p.city, state:p.state, lat:p.lat, lng:p.lng, gpsAccuracy:p.gpsAccuracy, locationSource:p.locationSource });
      return;
    }
    onApplyStatus(p);
  }

  function saveSpecial(s, r) {
    setStatus(s);
    setReason(r);
    if (s === 'OFF') {
      askedOffGps.current = false;
      setTimeout(() => useGps(true), 0);
    }
  }

  return (
    <div className="status-page">
      <div className="status-page-head">
        <button onClick={onClose}>‹</button>
        <b>Change duty status</b>
        <span />
      </div>

      <div className="status-page-body">
        <label>Duty Status *</label>
        <div className="duty-grid">
          {['OFF','SB','D','ON'].map(s => (
            <button key={s} className={status === s ? 'picked' : ''} onClick={() => choose(s)}>
              <span>{s}</span>
              <small>{label(s)}</small>
            </button>
          ))}
        </div>

        <div className="special-grid">
          <button className={reason === 'Personal Conveyance' ? 'picked' : ''} onClick={() => saveSpecial('OFF','Personal Conveyance')}>Personal Conveyance</button>
          <button className={reason === 'Yard Move' ? 'picked' : ''} onClick={() => saveSpecial('D','Yard Move')}>Yard Move</button>
        </div>

        <label>Location *</label>
        <div className="location-row gps-location-row location-editable-v91">
          <button type="button" className="gps-locate-btn" onClick={() => useGps(false)} aria-label="Use GPS location">⌖</button>
          <input
            value={[city, st].filter(Boolean).join(', ')}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const parsed = parseLocationText(e.target.value, st);
              setCity(parsed.city);
              setSt(parsed.state);
              setGpsFix(null);
              setGpsStatus(parsed.city || parsed.state ? 'Manual location' : 'Location cleared');
            }}
            placeholder="City, ST"
            autoComplete="off"
          />
          <button
            type="button"
            className="location-clear-btn"
            onClick={() => {
              setCity('');
              setSt('');
              setGpsFix(null);
              setGpsStatus('Location cleared');
            }}
            aria-label="Clear location"
          >×</button>
        </div>
        <div className={`gps-hint ${gpsFix ? 'ok' : ''}`}>
          {gpsStatus || (status === 'OFF' ? 'OFF duty will try GPS automatically.' : 'Tap target to use GPS.')}
        </div>

        <label>Reason</label>
        <div className="reason-pills">
          {reasonList(status).map(r => (
            <button key={r} className={reason === r ? 'picked' : ''} onClick={() => setReason(r)}>{r}</button>
          ))}
        </div>

        <label>Notes</label>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes" />

        <button className="status-save" onClick={save}>Save</button>
      </div>
    </div>
  );
}
