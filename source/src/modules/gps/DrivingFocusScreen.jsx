import React from 'react';
import { nowMin } from '../../shared/utils/time.js';
import { analyzeLinkedHos } from '../../core/hos/hosEngine.js';

function clockLabel(minsLeft) {
  const safe = Math.max(0, Math.round(Number(minsLeft || 0)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h < 10 ? String(h).padStart(2, '0') : h}:${String(m).padStart(2, '0')}`;
}

function parseDurationMinutes(text = '') {
  const value = String(text || '');
  const h = value.match(/(\d+)\s*h/i);
  const m = value.match(/(\d+)\s*m/i);
  if (!h && !m) return 0;
  return Number(h?.[1] || 0) * 60 + Number(m?.[1] || 0);
}

function cardLeft(cards = [], label = '', fallback = 0) {
  const card = cards.find(item => item.label === label);
  if (!card) return fallback;
  const fromSub = parseDurationMinutes(card.sub || '');
  if (fromSub) return fromSub;
  const fromValue = parseDurationMinutes(card.value || '');
  return fromValue || fallback;
}

function ringStyle(color, left, limit) {
  const pct = Math.max(0, Math.min(1, Number(left || 0) / Math.max(1, Number(limit || 1))));
  return {
    '--drive-ring-color': color,
    '--drive-ring-deg': `${Math.round(pct * 360)}deg`,
  };
}

function ClockRing({ item, large = false }) {
  return (
    <div className={`drive-clock-ring ${large ? 'large' : ''}`} style={ringStyle(item.color, item.left, item.limit)}>
      <div className="drive-clock-inner">
        <b>{clockLabel(item.left)}</b>
        <span>{item.label}</span>
      </div>
    </div>
  );
}

export default function DrivingFocusScreen({ open, state, liveCurrent, onStopDriving, onStopToOnDuty, onOpenLog, onOpenStatus }) {
  const [, tick] = React.useState(0);
  const [showAll, setShowAll] = React.useState(false);

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

  const hos = analyzeLinkedHos(state.eventsByDay || {}, state.activeDay, state.certifyStatus || {});
  const cards = hos.cards || [];
  const driveCard = cards.find(card => card.label === '11h Drive');
  const driveUsed = parseDurationMinutes(driveCard?.value || '') || Math.max(0, nowMin() - start);
  const used = Math.max(driveUsed, gpsElapsed || 0);

  const clocks = [
    { key:'break', label:'BREAK', left:cardLeft(cards, 'Break', 8 * 60), limit:8 * 60, color:'#11aeea' },
    { key:'drive', label:'DRIVE', left:Math.max(0, 11 * 60 - used), limit:11 * 60, color:'#26a646' },
    { key:'shift', label:'SHIFT', left:cardLeft(cards, '14h Window', 14 * 60), limit:14 * 60, color:'#0b7dec' },
    { key:'cycle', label:'CYCLE', left:cardLeft(cards, 'Cycle', 70 * 60), limit:70 * 60, color:'#5f6368' },
  ];

  const mainClock = clocks[0];
  const location = liveCurrent.location
    ? `${liveCurrent.location.city || 'GPS'}, ${liveCurrent.location.state || 'UNK'}`
    : 'GPS location';

  function stop() {
    if (gpsActive) onStopDriving?.();
    else onStopToOnDuty?.();
  }

  return (
    <div className="drive-focus motive-drive-mode">
      <div className="drive-mode-topline">
        <span><i /> MANUAL DRIVING</span>
        <button type="button" onClick={onOpenLog}>Log</button>
      </div>

      <button type="button" className="drive-split-toggle" onClick={() => setShowAll(value => !value)}>
        {showAll ? 'Hide Split SB Clocks' : 'Show Split SB Clocks'}
      </button>

      <div className="drive-clock-area">
        {showAll ? (
          <div className="drive-clock-grid">
            {clocks.map(item => <ClockRing key={item.key} item={item} />)}
          </div>
        ) : (
          <ClockRing item={mainClock} large />
        )}
      </div>

      <button type="button" className="drive-status-card motive-status-card" onClick={onOpenStatus}>
        <div className="drive-status-dot">D</div>
        <div>
          <b>DRIVING</b>
          <span>{location}</span>
        </div>
        <strong>›</strong>
      </button>

      <div className="drive-mode-bottom">
        <button type="button" className="drive-mode-icon" onClick={() => setShowAll(value => !value)} aria-label="Toggle clocks">
          {showAll ? '○' : '◌◌\n◌◌'}
        </button>
        <button type="button" className="drive-mode-stop" onClick={stop}>Stop driving</button>
        <button type="button" className="drive-mode-night" onClick={onOpenLog} aria-label="Open log">☾</button>
      </div>
    </div>
  );
}
