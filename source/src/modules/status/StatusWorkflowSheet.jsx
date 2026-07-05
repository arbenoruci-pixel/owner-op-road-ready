import React, { useEffect, useRef, useState } from 'react';
import { color, label, soft } from '../../shared/utils/status.js';
import { detectState, guessGpsCity, parseSmartLocationText } from '../../core/gps/locationService.js';

const onReasons = ['Pre-trip inspection', 'Fuel', 'Pickup / Loading', 'Delivery / Unloading', 'Waiting', 'Drop Trailer', 'Drop & Hook'];
const offReasons = ['Off Duty', 'Break', 'Parking', 'Personal Conveyance'];
const sbReasons = ['Sleeper Berth', 'Rest'];
const dReasons = ['Driving', 'Yard Move'];


function parseLocationText(value, fallbackState = '') {
  return parseSmartLocationText(value, fallbackState);
}

function reasonList(status) {
  if (status === 'ON') return onReasons;
  if (status === 'OFF') return offReasons;
  if (status === 'SB') return sbReasons;
  return dReasons;
}

function actionHeading(status) {
  if (status === 'ON') return 'What are you doing on duty?';
  if (status === 'OFF') return 'Why are you off duty?';
  if (status === 'SB') return 'Sleeper status';
  return 'Driving status';
}

function reasonText(reasons = []) {
  const list = Array.isArray(reasons) ? reasons : [reasons];
  return list.map(item => String(item || '').trim()).filter(Boolean).join(' · ');
}

function reasonHas(reasons = [], pattern) {
  return pattern.test(reasonText(reasons));
}

function reasonNeedsLoadLink(status, reasons) {
  return status === 'ON' && reasonHas(reasons, /pickup|loading|delivery|unloading/i);
}

function uniqueSuggestions(values = []) {
  const seen = new Set();
  return values
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .filter(v => {
      const key = v.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function locationString(city = '', state = '') {
  return [city, state].filter(Boolean).join(', ');
}

function parseDestinationState(value = '') {
  const parsed = parseLocationText(value, '');
  return { city: parsed.city, state: parsed.state };
}

export default function StatusWorkflowSheet({ state, onClose, onApplyStatus, onStartDriving }) {
  const [status, setStatus] = useState(state.currentStatus || 'OFF');
  const [city, setCity] = useState(state.currentLocation?.city || 'Chicago');
  const [st, setSt] = useState(state.currentLocation?.state || 'IL');
  const [locationText, setLocationText] = useState(locationString(state.currentLocation?.city || 'Chicago', state.currentLocation?.state || 'IL'));
  const [selectedReasons, setSelectedReasons] = useState([reasonList(state.currentStatus || 'OFF')[0]]);
  const [startAgoMinutes, setStartAgoMinutes] = useState(0);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [gpsFix, setGpsFix] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('');
  const [shippingDocs, setShippingDocs] = useState(state.loadInfo?.shippingDocs || state.loadInfo?.loadNo || '');
  const [destination, setDestination] = useState([state.loadInfo?.deliveryCity, state.loadInfo?.deliveryState].filter(Boolean).join(', '));
  const askedOffGps = useRef(false);
  // Set when the driver types or picks a location manually. A late-resolving
  // automatic GPS fix (e.g. the OFF-duty auto lookup) must never overwrite a
  // manual city/state; only the explicit "Use GPS" button may replace it.
  const manualLocationDirty = useRef(false);

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
    setLocationText(locationString(nextCity, nextState));
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

    if (!auto) manualLocationDirty.current = false;
    setGpsStatus(auto ? 'Getting GPS for OFF duty…' : 'Getting GPS…');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // A slow automatic fix must not replace a location the driver has
        // typed/picked in the meantime.
        if (auto && manualLocationDirty.current) return;
        applyFix(position);
      },
      () => {
        if (auto && manualLocationDirty.current) return;
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
    setSelectedReasons([reasonList(next)[0]]);
    if (next === 'OFF') {
      askedOffGps.current = false;
      setTimeout(() => useGps(true), 0);
    }
  }

  function toggleReason(reasonValue) {
    setSelectedReasons(current => {
      const active = current.includes(reasonValue);
      const next = active ? current.filter(item => item !== reasonValue) : [...current, reasonValue];
      return next.length ? next : [reasonValue];
    });
  }

  function payload() {
    const parsedLoc = parseLocationText(locationText, st || 'IL');
    const parsedDest = parseDestinationState(destination);
    const reason = reasonText(selectedReasons) || reasonList(status)[0];
    return {
      status,
      reason,
      reasons:selectedReasons,
      city: parsedLoc.city,
      state: parsedLoc.state,
      description: notes,
      droppedTrailer: '',
      hookedTrailer: '',
      shippingDocs: shippingDocs.trim(),
      loadNo: shippingDocs.trim(),
      destination: locationString(parsedDest.city, parsedDest.state) || destination.trim(),
      destinationState: parsedDest.state || '',
      backdateMinutes: Number(startAgoMinutes || 0),
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
    setSelectedReasons([r]);
    if (s === 'OFF') {
      askedOffGps.current = false;
      setTimeout(() => useGps(true), 0);
    }
  }

  function applyLocationText(value = locationText) {
    manualLocationDirty.current = true;
    const parsed = parseLocationText(value, st || 'IL');
    setCity(parsed.city);
    setSt(parsed.state);
    setLocationText(locationString(parsed.city, parsed.state));
    setGpsFix(null);
    setGpsStatus(parsed.city || parsed.state ? 'Manual location' : 'Location cleared');
    return parsed;
  }

  function chooseLocationSuggestion(value) {
    const parsed = applyLocationText(value);
    setGpsStatus(`Manual location · ${locationString(parsed.city, parsed.state)}`);
  }

  const locationSuggestions = uniqueSuggestions([
    locationString(city, st),
    locationString(state.currentLocation?.city, state.currentLocation?.state),
    locationString(state.loadInfo?.pickupCity, state.loadInfo?.pickupState),
    locationString(state.loadInfo?.deliveryCity, state.loadInfo?.deliveryState),
    'Romeoville, IL',
    'Joliet, IL',
    'Bolingbrook, IL',
    'Willowbrook, IL',
    'Chicago, IL',
    'Toledo, OH',
  ]);

  const accent = color(status);
  const accentSoft = soft(status);

  return (
    <div className="status-page status-driver-picker-v934" style={{ '--driver-accent': accent, '--driver-accent-soft': accentSoft }}>
      <div className="status-page-head driver-picker-head">
        <button type="button" onClick={onClose} aria-label="Back">‹</button>
        <div>
          <b>Change Status</b>
          <small>Now · {locationText || 'location needed'}</small>
        </div>
        <span />
      </div>

      <div className="status-page-body driver-picker-body">
        <section className="picker-section picker-section-tight">
          <div className="picker-label-row">
            <label>Status</label>
            <span style={{ color: accent }}>{label(status)}</span>
          </div>
          <div className="duty-grid driver-duty-grid" role="group" aria-label="Duty status">
            {['OFF','SB','D','ON'].map(s => (
              <button key={s} type="button" data-status={s} className={status === s ? 'picked' : ''} onClick={() => choose(s)}>
                <span>{s}</span>
                <small>{label(s)}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="picker-section">
          <div className="picker-label-row">
            <label>{actionHeading(status)}</label>
            <span>{selectedReasons.length > 1 ? `${selectedReasons.length} selected` : 'select one or more'}</span>
          </div>
          <div className="reason-pills driver-reason-grid multi-reason-grid">
            {reasonList(status).map(r => (
              <button key={r} type="button" className={selectedReasons.includes(r) ? 'picked' : ''} onClick={() => toggleReason(r)}>
                {selectedReasons.includes(r) ? '✓ ' : ''}{r}
              </button>
            ))}
          </div>
        </section>

        <section className="picker-section start-time-section">
          <div className="picker-label-row">
            <label>Start time</label>
            <span>{startAgoMinutes ? `${startAgoMinutes} min ago` : 'Now'}</span>
          </div>
          <div className="start-ago-pills">
            {[0, 15, 30].map(min => (
              <button key={min} type="button" className={startAgoMinutes === min ? 'picked' : ''} onClick={() => setStartAgoMinutes(min)}>
                {min === 0 ? 'Now' : `${min}m ago`}
              </button>
            ))}
          </div>
        </section>

        {reasonNeedsLoadLink(status, selectedReasons) && (
          <section className="picker-section load-link-section">
            <div className="picker-label-row">
              <label>{reasonHas(selectedReasons, /delivery|unloading/i) ? 'Delivery info' : 'Pickup info'}</label>
              <span>linked to this event</span>
            </div>
            <div className="driver-load-grid">
              <label>
                <span>BOL / Shipping #</span>
                <input
                  value={shippingDocs}
                  onChange={(e) => setShippingDocs(e.target.value)}
                  placeholder="Load or BOL #"
                  autoComplete="off"
                />
              </label>
              <label>
                <span>{reasonHas(selectedReasons, /delivery|unloading/i) ? 'Delivery location' : 'Going to'}</span>
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

        <section className="picker-section">
          <div className="picker-label-row">
            <label>Location</label>
            <button type="button" className="tiny-link" onClick={() => useGps(false)}>Use GPS</button>
          </div>
          <div className="location-row gps-location-row location-editable-v91 driver-location-row">
            <button type="button" className="gps-locate-btn" onClick={() => useGps(false)} aria-label="Use GPS location">⌖</button>
            <input
              value={locationText}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => applyLocationText()}
              onChange={(e) => {
                manualLocationDirty.current = true;
                setLocationText(e.target.value);
                setGpsFix(null);
                setGpsStatus('Manual location');
              }}
              placeholder="City, ST"
              autoComplete="off"
            />
            <button
              type="button"
              className="location-clear-btn"
              onClick={() => {
                manualLocationDirty.current = true;
                setCity('');
                setSt('');
                setLocationText('');
                setGpsFix(null);
                setGpsStatus('Location cleared');
              }}
              aria-label="Clear location"
            >×</button>
          </div>
          <div className="driver-location-suggestions">
            {locationSuggestions.map(value => (
              <button key={value} type="button" onClick={() => chooseLocationSuggestion(value)}>{value}</button>
            ))}
          </div>
          <div className={`gps-hint ${gpsFix ? 'ok' : ''}`}>
            {gpsStatus || 'Tap GPS or type city/state.'}
          </div>
        </section>

        <section className="picker-section note-section">
          {!showNotes && !notes ? (
            <button type="button" className="add-note-row" onClick={() => setShowNotes(true)}>+ Add note optional</button>
          ) : (
            <>
              <div className="picker-label-row">
                <label>Note</label>
                <button type="button" className="tiny-link" onClick={() => { setNotes(''); setShowNotes(false); }}>Clear</button>
              </div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional note" />
            </>
          )}
        </section>

        <button className="status-save driver-status-save" onClick={save}>Save {status}</button>
      </div>
    </div>
  );
}
