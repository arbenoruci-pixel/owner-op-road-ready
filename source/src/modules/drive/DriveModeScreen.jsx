import React from 'react';
import { calculateHosClocks, formatHosClockMinutes } from '../../core/hos/hosEngine.js';

const CLOCK_ORDER = ['BREAK', 'DRIVE', 'SHIFT', 'CYCLE'];

function statusToneClass(clock = {}) {
  if (clock.tone === 'red' || clock.expired) return 'red';
  if (clock.tone === 'yellow' || clock.warning) return 'yellow';
  if (clock.tone === 'grey' || clock.inactive) return 'grey';
  return 'green';
}

function progressValue(clock = {}) {
  const limit = Math.max(1, Number(clock.limitMinutes || 1));
  const remaining = Math.max(0, Number(clock.remainingMinutes || 0));
  return Math.max(0, Math.min(1, remaining / limit));
}

function ClockCircle({ clock }) {
  const tone = statusToneClass(clock);
  const progress = progressValue(clock);
  const rawDriveText = clock.kind === 'effectiveDrive'
    && Number(clock.rawRemainingMinutes || 0) > Number(clock.remainingMinutes || 0)
      ? `11h clock ${formatHosClockMinutes(clock.rawRemainingMinutes)} left`
      : '';
  return (
    <div
      className={`drive-mode-clock ${tone}`}
      style={{ '--hos-clock-progress': `${Math.round(progress * 360)}deg` }}
      aria-label={`${clock.label} ${formatHosClockMinutes(clock.remainingMinutes)} remaining`}
    >
      <div className="drive-mode-clock-inner">
        <b>{formatHosClockMinutes(clock.remainingMinutes)}</b>
        <span>{clock.label}</span>
        {rawDriveText ? <small>{rawDriveText}</small> : null}
      </div>
    </div>
  );
}

function WarningStrip({ warnings = [] }) {
  const soft = (warnings || []).filter(item => item.severity !== 'high').slice(0, 2);
  const hard = (warnings || []).filter(item => item.severity === 'high').slice(0, 2);
  const rows = hard.length ? hard : soft;
  if (!rows.length) return null;
  return (
    <div className={`drive-mode-warnings ${hard.length ? 'hard' : 'soft'}`}>
      {rows.map((item, index) => <span key={`${item.type || 'warn'}_${index}`}>{item.text}</span>)}
    </div>
  );
}

export default function DriveModeScreen({ state, onOpenStatus, onOpenLog, onBack }) {
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const timer = window.setInterval(() => setTick(value => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const hos = React.useMemo(() => calculateHosClocks(state, new Date()), [state, tick]);
  const displayClocks = hos.displayClocks || hos.clocks || [];
  const byLabel = new Map(displayClocks.map(clock => [clock.label, clock]));
  const clocks = CLOCK_ORDER.map(label => byLabel.get(label)).filter(Boolean);
  const status = hos.currentStatus || state.currentStatus || 'D';

  return (
    <section className="drive-mode-screen" aria-label="Drive Mode HOS clocks">
      <div className="drive-mode-topbar">
        <button type="button" className="drive-mode-back" onClick={onBack} aria-label="Back to logs">‹</button>
        <div className="drive-mode-status-label"><span aria-hidden="true" /> MANUAL DRIVING</div>
        <button type="button" className="drive-mode-log-btn" onClick={onOpenLog}>Log</button>
      </div>

      <button type="button" className="drive-mode-split-disabled" disabled>
        Show Split SB Clocks
      </button>

      <div className="drive-mode-clock-grid">
        {clocks.map(clock => <ClockCircle key={clock.label} clock={clock} />)}
      </div>

      <WarningStrip warnings={hos.warnings} />

      <button type="button" className="drive-mode-pill" onClick={onOpenStatus} aria-label="Change current status">
        <span>D</span>
        <b>{status === 'D' ? 'DRIVING' : 'CURRENT STATUS'}</b>
        <em aria-hidden="true">›</em>
      </button>

      <div className="drive-mode-bottom-actions">
        <button type="button" aria-label="Open logs" onClick={onOpenLog}><span aria-hidden="true" /> <span aria-hidden="true" /> <span aria-hidden="true" /> <span aria-hidden="true" /></button>
        <small>Advisory HOS clocks from manual duty-status events.</small>
      </div>
    </section>
  );
}
