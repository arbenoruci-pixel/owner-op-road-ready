import React, { useEffect, useRef, useState } from 'react';
import { color, label, soft } from '../../shared/utils/status.js';
import { getAccurateGpsLocation } from '../../core/gps/locationService.js';

const onReasons = ['Pre-trip inspection', 'Fuel', 'Pickup / Loading', 'Delivery / Unloading', 'Waiting', 'Drop Trailer', 'Drop Off', 'Drop & Hook', 'Hook Empty / Reposition'];
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

function loadReasonKind(status, reasons) {
  if (status !== 'ON') return '';
  if (reasonHas(reasons, /delivery|unloading/i)) return 'delivery';
  if (reasonHas(reasons, /pickup|loading/i)) return 'pickup';
  return '';
}

function reasonNeedsDropOff(status, reasons) {
  return status === 'ON' && reasonHas(reasons, /\bdrop\s*off\b/i);
}

function reasonNeedsDropHook(status, reasons) {
  return status === 'ON' && reasonHas(reasons, /drop\s*&\s*hook/i);
}

function reasonNeedsHookEmpty(status, reasons) {
  return status === 'ON' && reasonHas(reasons, /hook\s+empty|empty\s+return|reposition|return\s+empty/i);
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
  const [gpsPending, setGpsPending] = useState(false);
  const activeLoadDocs = String(state.loadInfo?.shippingDocs || state.loadInfo?.loadNo || state.loadInfo?.bol || '').trim();
  const activeLoadDestination = [state.loadInfo?.deliveryCity, state.loadInfo?.deliveryState].filter(Boolean).join(', ');
  // Pickup starts a new exact event/load, so it must never inherit yesterday's
  // BOL or destination. Delivery may use the currently active load as a helpful
  // default and still saves the values on the exact delivery event.
  const [shippingDocs, setShippingDocs] = useState('');
  const [destination, setDestination] = useState('');
  const [dropContainer, setDropContainer] = useState(state.equipment?.container || '');
  const [dropChassis, setDropChassis] = useState(state.equipment?.chassis || '');
  const [hookContainer, setHookContainer] = useState('');
  const [hookChassis, setHookChassis] = useState('');
  const [hookSeal, setHookSeal] = useState('');
  const [hookLoadNo, setHookLoadNo] = useState('');
  const [hookDestination, setHookDestination] = useState('');
  const askedOffGps = useRef(false);
  const askedDrivingExitGps = useRef(false);
  const gpsRequestId = useRef(0);
  const previousLoadKind = useRef('');
  // Set when the driver types or picks a location manually. A late-resolving
  // automatic GPS fix (e.g. the OFF-duty auto lookup) must never overwrite a
  // manual city/state; only the explicit "Use GPS" button may replace it.
  const manualLocationDirty = useRef(false);

  function applyFix(fix = {}) {
    const nextCity = String(fix.city || 'GPS').trim() || 'GPS';
    const nextState = String(fix.state || 'UNK').trim().toUpperCase().slice(0, 2) || 'UNK';
    const accuracy = Number.isFinite(Number(fix.accuracy)) ? Number(fix.accuracy) : null;

    setCity(nextCity);
    setSt(nextState);
    setLocationText(locationString(nextCity, nextState));
    manualLocationDirty.current = false;
    setGpsFix({
      lat:fix.lat ?? null,
      lng:fix.lng ?? null,
      accuracy,
      timestamp:fix.timestamp || Date.now(),
      city:nextCity,
      state:nextState,
      source:fix.source || 'gps',
    });
    setGpsPending(false);
    setGpsStatus(`GPS locked · ${nextCity}, ${nextState}${accuracy != null ? ` · ±${Math.round(accuracy)} m` : ''}`);
  }

  async function useGps(auto = false, context = 'status') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsPending(false);
      setGpsStatus('GPS not available. Type location manually.');
      return;
    }

    const requestId = gpsRequestId.current + 1;
    gpsRequestId.current = requestId;
    const requireFreshStop = context === 'driving-exit';
    if (!auto) manualLocationDirty.current = false;
    setGpsPending(true);
    setGpsStatus(
      context === 'driving-exit'
        ? 'Getting current stop location… improving GPS accuracy'
        : (auto ? 'Locking accurate current location…' : 'Improving GPS accuracy…')
    );

    try {
      const fix = await getAccurateGpsLocation({
        durationMs:requireFreshStop ? 15000 : 12000,
        targetAccuracy:requireFreshStop ? 35 : 45,
        maximumAge:0,
        minimumSamples:2,
        rejectCoarseFix:true,
        maximumAcceptedAccuracy:250,
      });
      if (gpsRequestId.current !== requestId) return;
      // A slow automatic fix must not replace a location the driver has
      // typed/picked in the meantime.
      if (auto && manualLocationDirty.current) {
        setGpsPending(false);
        return;
      }
      applyFix(fix);
    } catch (error) {
      if (gpsRequestId.current !== requestId) return;
      setGpsPending(false);
      if (auto && manualLocationDirty.current) return;
      if (error?.code === 'GPS_ACCURACY') {
        setGpsStatus(`GPS signal too weak${Number.isFinite(error.accuracy) ? ` (±${Math.round(error.accuracy)} m)` : ''}. Tap GPS again or type City, ST.`);
      } else {
        setGpsStatus('GPS blocked/unavailable. Type location manually.');
      }
    }
  }

  useEffect(() => {
    const nextKind = loadReasonKind(status, selectedReasons);
    if (nextKind === previousLoadKind.current) return;

    if (nextKind === 'pickup') {
      // A pickup is a new load. Never copy a prior event/day's BOL or route.
      setShippingDocs('');
      setDestination('');
    } else if (nextKind === 'delivery') {
      // Delivery can start from the currently active load, then persists on
      // this exact event when the driver saves.
      setShippingDocs(activeLoadDocs);
      setDestination(activeLoadDestination);
    }
    previousLoadKind.current = nextKind;
  }, [status, selectedReasons, activeLoadDocs, activeLoadDestination]);

  useEffect(() => {
    if (status === 'OFF' && !askedOffGps.current) {
      askedOffGps.current = true;
      useGps(true);
    }
  }, [status]);

  function choose(next) {
    const leavingDriving = state.currentStatus === 'D' && next !== 'D';
    setStatus(next);
    setSelectedReasons([reasonList(next)[0]]);

    if (next === 'D') {
      askedDrivingExitGps.current = false;
      gpsRequestId.current += 1;
      setGpsPending(false);
      setGpsStatus('');
      return;
    }

    // The location on a non-driving row is the place where Driving ended.
    // Never silently reuse the Driving start city. Clear it, request a fresh
    // position, and keep the field editable if GPS is unavailable.
    if (leavingDriving && !askedDrivingExitGps.current) {
      askedDrivingExitGps.current = true;
      askedOffGps.current = next === 'OFF';
      manualLocationDirty.current = false;
      setCity('');
      setSt('');
      setLocationText('');
      setGpsFix(null);
      useGps(true, 'driving-exit');
      return;
    }

    if (next === 'OFF') {
      askedOffGps.current = false;
      setTimeout(() => useGps(true, 'off-duty'), 0);
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
    const parsedLoc = parseLocationText(locationText, st || '');
    const parsedDest = parseDestinationState(destination);
    const reason = reasonText(selectedReasons) || reasonList(status)[0];
    const hookEmpty = reasonNeedsHookEmpty(status, selectedReasons);
    const transitionDocs = (reasonNeedsDropHook(status, selectedReasons) || hookEmpty) ? hookLoadNo.trim().toUpperCase() : shippingDocs.trim();
    return {
      status,
      reason,
      reasons:selectedReasons,
      city: parsedLoc.city,
      state: parsedLoc.state,
      description: notes,
      droppedTrailer: '',
      hookedTrailer: '',
      shippingDocs: transitionDocs,
      loadNo: transitionDocs,
      destination: locationString(parsedDest.city, parsedDest.state) || destination.trim(),
      destinationState: parsedDest.state || '',
      dropHook: {
        mode: reasonNeedsDropOff(status, selectedReasons) ? 'drop_off' : (reasonNeedsDropHook(status, selectedReasons) ? 'drop_hook' : (hookEmpty ? 'hook_empty' : '')),
        droppedContainer: dropContainer.trim().toUpperCase(),
        droppedChassis: dropChassis.trim().toUpperCase(),
        hookedContainer: hookContainer.trim().toUpperCase(),
        hookedChassis: hookChassis.trim().toUpperCase(),
        hookedSeal: hookSeal.trim().toUpperCase(),
        hookedLoadNo: hookLoadNo.trim().toUpperCase(),
        hookedDestination: hookDestination.trim(),
      },
      backdateMinutes: Number(startAgoMinutes || 0),
      lat: gpsFix?.lat ?? null,
      lng: gpsFix?.lng ?? null,
      gpsAccuracy: gpsFix?.accuracy ?? null,
      locationSource: gpsFix ? 'gps' : 'manual',
    };
  }

  function save() {
    if (dropOffSelected && !dropContainer.trim() && !dropChassis.trim()) {
      setGpsStatus('Add the container or chassis you dropped off.');
      return;
    }
    if (dropHookSelected && (!hookContainer.trim() || !hookChassis.trim() || !hookDestination.trim())) {
      setGpsStatus('Add new container, new chassis, and going-to location for Drop & Hook.');
      return;
    }
    if (dropHookSelected && !hookLoadNo.trim()) {
      setGpsStatus('Add the new BOL/load #, or choose Hook Empty / Reposition for an empty move.');
      return;
    }
    if (hookEmptySelected && (!hookContainer.trim() && !hookChassis.trim())) {
      setGpsStatus('Add the empty container or chassis you hooked.');
      return;
    }
    if (hookEmptySelected && !hookDestination.trim()) {
      setGpsStatus('Add where the empty/reposition move is going.');
      return;
    }
    const p = payload();
    const leavingDriving = state.currentStatus === 'D' && status !== 'D';
    if (gpsPending && leavingDriving && !manualLocationDirty.current && !gpsFix) {
      setGpsStatus('Getting the stop location. Wait a moment or type City, ST.');
      return;
    }
    if (!p.city || !p.state || p.city === 'GPS' || p.state === 'UNK') {
      setGpsStatus('Add the current City, ST or tap Use GPS before saving.');
      return;
    }
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
    gpsRequestId.current += 1;
    setGpsPending(false);
    const parsed = parseLocationText(value, st || '');
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

  const leavingDriving = state.currentStatus === 'D' && status !== 'D';
  const locationSuggestions = uniqueSuggestions([
    locationString(city, st),
    leavingDriving ? '' : locationString(state.currentLocation?.city, state.currentLocation?.state),
    locationString(state.loadInfo?.pickupCity, state.loadInfo?.pickupState),
    locationString(state.loadInfo?.deliveryCity, state.loadInfo?.deliveryState),
    'Hubbard, OH',
    'Romeoville, IL',
    'Joliet, IL',
    'Bolingbrook, IL',
    'Willowbrook, IL',
    'Chicago, IL',
    'Toledo, OH',
    'North Baltimore, OH',
    'Greenfield, IN',
  ]);

  const accent = color(status);
  const accentSoft = soft(status);
  const dropHookSelected = reasonNeedsDropHook(status, selectedReasons);
  const dropOffSelected = reasonNeedsDropOff(status, selectedReasons);
  const hookEmptySelected = reasonNeedsHookEmpty(status, selectedReasons);
  const equipmentDropSelected = dropHookSelected || dropOffSelected || hookEmptySelected;
  const currentEquipmentText = [state.equipment?.container, state.equipment?.chassis].filter(Boolean).join(' / ') || state.currentTrailer || 'No equipment set';

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



        {equipmentDropSelected && (
          <section className="picker-section drop-hook-section">
            <div className="picker-label-row">
              <label>{dropOffSelected ? 'Drop off equipment' : 'Drop & hook equipment'}</label>
              <span>{dropOffSelected ? 'drop only' : (hookEmptySelected ? 'empty / reposition' : 'required for next load')}</span>
            </div>
            <div className="drop-hook-current">
              <small>Current equipment</small>
              <b>{currentEquipmentText}</b>
            </div>
            <div className="driver-load-grid drop-hook-grid">
              <label>
                <span>Drop container</span>
                <input value={dropContainer} onChange={(e) => setDropContainer(e.target.value.toUpperCase())} placeholder="Old container #" autoComplete="off" />
              </label>
              <label>
                <span>Drop chassis</span>
                <input value={dropChassis} onChange={(e) => setDropChassis(e.target.value.toUpperCase())} placeholder="Old chassis #" autoComplete="off" />
              </label>
              {/* {dropHookSelected && ( legacy verifier marker; Hook Empty shares the hook fields without carrying old loads. */}
              {(dropHookSelected || hookEmptySelected) && (
                <>
                  <label>
                    <span>Hook container</span>
                    <input value={hookContainer} onChange={(e) => setHookContainer(e.target.value.toUpperCase())} placeholder="New container #" autoComplete="off" />
                  </label>
                  <label>
                    <span>Hook chassis</span>
                    <input value={hookChassis} onChange={(e) => setHookChassis(e.target.value.toUpperCase())} placeholder="New chassis #" autoComplete="off" />
                  </label>
                  <label>
                    <span>{hookEmptySelected ? 'Ref optional' : 'New BOL / load #'}</span>
                    <input value={hookLoadNo} onChange={(e) => setHookLoadNo(e.target.value.toUpperCase())} placeholder={hookEmptySelected ? 'EMPTY/MT optional' : 'BOL or pickup #'} autoComplete="off" />
                  </label>
                  <label>
                    <span>Going to</span>
                    <input value={hookDestination} onChange={(e) => setHookDestination(e.target.value)} placeholder="City, ST" autoComplete="off" />
                  </label>
                  <label>
                    <span>Seal optional</span>
                    <input value={hookSeal} onChange={(e) => setHookSeal(e.target.value.toUpperCase())} placeholder="Seal #" autoComplete="off" />
                  </label>
                </>
              )}
              {hookEmptySelected && (
                <div className="drop-hook-note hook-empty-note">
                  Hook Empty / Reposition creates an empty/reposition route leg. It will not reuse the previous load number.
                </div>
              )}
              {dropOffSelected && (
                <div className="drop-hook-note drop-off-note">
                  Drop Off saves an ON DUTY drop-only event and clears current intermodal equipment. No new container or chassis required.
                </div>
              )}
            </div>
          </section>
        )}

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
            <label>{leavingDriving ? 'Stop location' : 'Location'}</label>
            <button type="button" className="tiny-link" onClick={() => useGps(false, leavingDriving ? 'driving-exit' : 'status')}>
              {leavingDriving ? 'Use current GPS' : 'Use GPS'}
            </button>
          </div>
          <div className="location-row gps-location-row location-editable-v91 driver-location-row">
            <button type="button" className="gps-locate-btn" onClick={() => useGps(false, leavingDriving ? 'driving-exit' : 'status')} aria-label="Use GPS location">⌖</button>
            <input
              value={locationText}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => applyLocationText()}
              onChange={(e) => {
                manualLocationDirty.current = true;
                gpsRequestId.current += 1;
                setGpsPending(false);
                setLocationText(e.target.value);
                setGpsFix(null);
                setGpsStatus('Manual location');
              }}
              placeholder={leavingDriving ? 'Stop City, ST' : 'City, ST'}
              autoComplete="off"
            />
            <button
              type="button"
              className="location-clear-btn"
              onClick={() => {
                manualLocationDirty.current = true;
                gpsRequestId.current += 1;
                setGpsPending(false);
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
            {gpsStatus || (dropOffSelected ? 'Set the port/yard where you dropped the equipment.' : (hookEmptySelected ? 'Set where you hooked the empty/reposition equipment.' : 'Tap GPS or type city/state.'))}
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

        <button
          className="status-save driver-status-save"
          onClick={save}
          disabled={gpsPending && leavingDriving && !manualLocationDirty.current && !locationText}
        >
          {gpsPending && leavingDriving && !manualLocationDirty.current && !locationText ? 'Getting stop location…' : `Save ${status}`}
        </button>
      </div>
    </div>
  );
}
