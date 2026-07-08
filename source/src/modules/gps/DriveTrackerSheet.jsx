import React, { useEffect, useMemo, useRef, useState } from 'react';
import { detectState, formatMiles, metersPerSecondToMph } from '../../core/gps/locationService.js';

const MOTION_MPH = 7;
const STOP_MPH = 2;
const STOP_SECONDS = 90;

export default function GpsDriveTracker({ state, open = false, onClose, onStartDriving, onStopDriving, onUpdateTrip, onMotionDetected, onAutoStopped }) {
  const watchRef = useRef(null);
  const active = state.gpsTrip?.status === 'active';
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState('');
  const [lastFix, setLastFix] = useState(null);
  const [stoppedSince, setStoppedSince] = useState(null);
  const stoppedSinceRef = useRef(null);
  const autoStoppedRef = useRef(false);
  const PAPER_RODS_NO_AUTO_DUTY_EVENTS = true;
  const AUTO_MOTION = false;

  const totalMiles = useMemo(() => {
    const m = state.gpsTrip?.milesByState || {};
    return Object.values(m).reduce((a, b) => a + Number(b || 0), 0);
  }, [state.gpsTrip]);

  const shouldWatch = PAPER_RODS_NO_AUTO_DUTY_EVENTS ? false : (active || armed || AUTO_MOTION);

  useEffect(() => {
    if (!shouldWatch) return;
    if (!navigator.geolocation) {
      setError('GPS not available on this device/browser.');
      return;
    }

    setError('');
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const mph = metersPerSecondToMph(pos.coords.speed);
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          mph,
          timestamp: Date.now(),
          state: detectState(pos.coords.latitude, pos.coords.longitude),
        };

        setLastFix(fix);

        if (!PAPER_RODS_NO_AUTO_DUTY_EVENTS && !active && (armed || AUTO_MOTION) && mph >= MOTION_MPH) {
          setArmed(false);
          onMotionDetected?.(fix);
          return;
        }

        if (active) {
          onUpdateTrip(fix);

          if (mph <= STOP_MPH) {
            const firstStopped = stoppedSinceRef.current || Date.now();
            stoppedSinceRef.current = firstStopped;
            setStoppedSince(firstStopped);

            if (!PAPER_RODS_NO_AUTO_DUTY_EVENTS && !autoStoppedRef.current && Date.now() - firstStopped > STOP_SECONDS * 1000) {
              autoStoppedRef.current = true;
              onAutoStopped?.(fix);
            }
          } else {
            stoppedSinceRef.current = null;
            autoStoppedRef.current = false;
            setStoppedSince(null);
          }
        }
      },
      (err) => setError(err.message || 'GPS permission/location error.'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );

    return () => {
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [shouldWatch, active, armed, onMotionDetected, onUpdateTrip, onAutoStopped]);

  const stoppedLong = stoppedSince && Date.now() - stoppedSince > STOP_SECONDS * 1000;

  if (!open) return null;

  return (
    <div className="gps-sheet-backdrop" onClick={onClose}>
      <div className={`gps-sheet ${active ? 'active' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="gps-sheet-head">
          <b>Drive tracking</b>
          <button onClick={onClose}>Done</button>
        </div>

        <div className="gps-head">
          <div>
            <b>{active ? 'GPS trip recording' : armed ? 'Motion detection armed' : 'Drive tracking'}</b>
            <span>
              {active
                ? 'Recording miles while status is DRIVING'
                : armed
                  ? `Will switch to DRIVING around ${MOTION_MPH}+ mph`
                  : 'Motion detection is off until you arm it'}
            </span>
          </div>
          <div className="gps-total">{formatMiles(totalMiles)}</div>
        </div>

        {state.equipment?.type === 'intermodal' && (
          <div className="intermodal-mini">
            <span>Chassis: <b>{state.equipment.chassis || 'missing'}</b></span>
            <span>Container: <b>{state.equipment.container || 'missing'}</b></span>
          </div>
        )}

        {active && (
          <div className="state-breakdown">
            {Object.entries(state.gpsTrip?.milesByState || {}).map(([st, mi]) => (
              <div key={st}><span>{st}</span><b>{formatMiles(mi)}</b></div>
            ))}
          </div>
        )}

        {lastFix && (
          <div className="gps-fix">
            GPS: {lastFix.state} · {Number(lastFix.mph || 0).toFixed(1)} mph · ±{Math.round(lastFix.accuracy || 0)}m
          </div>
        )}

        {stoppedLong && active && (
          <div className="gps-stop-hint">
            Looks stopped. Tap Stop Driving / Review to choose Delivery, Fuel, Break, Sleeper, Drop & Hook, etc.
          </div>
        )}

        {error && <div className="gps-error">{error}</div>}

        {!active && !armed && (
          <div className="gps-actions">
            <button className="drive-main" disabled>Motion auto-driving disabled</button>
            <button className="drive-secondary" onClick={onStartDriving}>CHANGE STATUS MANUALLY</button>
          </div>
        )}

        {!active && armed && (
          <button className="drive-stop" onClick={() => setArmed(false)}>CANCEL MOTION DETECTION</button>
        )}

        {active && (
          <button className="drive-stop" onClick={onStopDriving}>STOP DRIVING / REVIEW</button>
        )}

        <div className="gps-warning">
          Smart paper RODS mode does not create automatic driving events. Change duty status manually.
        </div>
      </div>
    </div>
  );
}
