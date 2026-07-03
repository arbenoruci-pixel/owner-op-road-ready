import React from 'react';
import { durLabel, nowMin } from '../../shared/utils/time.js';
import { analyzeLinkedHos } from '../../core/hos/hosEngine.js';

function remainingLabel(minsLeft) {
  const safe = Math.max(0, Math.round(minsLeft || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export default function DrivingFocusScreen({ open, state, liveCurrent, onStopDriving, onStopToOnDuty, onOpenLog }) {
  const [, tick] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    const t = setInterval(() => tick(v => v + 1), 30000);
    return () => clearInterval(t);
  }, [open]);

  if (!open || liveCurrent?.status !== 'D') return null;

  const current = liveCurrent.event;
  const start = current?.startMin ?? nowMin();
  const gpsActive = state.gpsTrip?.status === 'active';
  const gpsElapsed = gpsActive && state.gpsTrip?.startedAt
    ? Math.max(0, Math.round((Date.now() - Number(state.gpsTrip.startedAt || Date.now())) / 60000))
    : null;

  // The focus screen should use the same linked-HOS 11h clock as Log Check.
  // The current GPS trip elapsed time is still useful while moving, but the
  // 11-hour remaining clock must not reset to 11:00 every time a new drive
  // segment starts after a short ON DUTY stop.
  const hos = analyzeLinkedHos(state.eventsByDay || {}, state.activeDay, state.certifyStatus || {});
  const driveCard = hos.cards?.find(card => card.label === '11h Drive');
  const driveUsedMatch = String(driveCard?.value || '').match(/(?:(\d+)h)?\s*(\d+)?m?\s*used/i);
  const hosUsed = driveUsedMatch
    ? (Number(driveUsedMatch[1] || 0) * 60 + Number(driveUsedMatch[2] || 0))
    : Math.max(0, nowMin() - start);
  const used = Math.max(hosUsed, gpsElapsed || 0);
  const driveLeft = Math.max(0, 11 * 60 - used);
  const location = liveCurrent.location
    ? `${liveCurrent.location.city || 'GPS'}, ${liveCurrent.location.state || 'UNK'}`
    : 'GPS location';

  function stop() {
    if (gpsActive) onStopDriving?.();
    else onStopToOnDuty?.();
  }

  return (
    <div className="drive-focus">
      <div className="drive-focus-top">
        <span>{gpsActive ? 'GPS DRIVING' : 'MANUAL DRIVING'}</span>
        <button onClick={onOpenLog}>Log</button>
      </div>

      <div className="drive-ring">
        <div className="drive-ring-inner">
          <small>DRIVE TIME LEFT</small>
          <b>{remainingLabel(driveLeft)}</b>
          <em>{durLabel(used)} used</em>
        </div>
      </div>

      <div className="drive-status-card">
        <div className="drive-status-dot">D</div>
        <div>
          <b>DRIVING</b>
          <span>{location}</span>
        </div>
      </div>

      <div className="drive-focus-actions">
        <button className="drive-stop-big" onClick={stop}>STOP DRIVING</button>
        <button className="drive-secondary-big" onClick={onOpenLog}>OPEN LOG</button>
      </div>

      <p className="drive-focus-note">
        Motion GPS works while the web app is open. Native iPhone/Android app is required for reliable background GPS.
      </p>
    </div>
  );
}
