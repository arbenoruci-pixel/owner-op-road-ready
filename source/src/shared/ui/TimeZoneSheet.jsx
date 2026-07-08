import React from 'react';
import {
  COMMON_LOG_TIME_ZONES,
  DEFAULT_HOME_TERMINAL_TIMEZONE,
  getHomeTerminalTimeZone,
  homeTerminalMinute,
  isValidTimeZone,
  normalizeTimeZone,
  timeZoneSettingSummary,
} from '../../core/time/homeTerminalTime.js';
import { timeLabel } from '../utils/time.js';

export default function TimeZoneSheet({ state, onClose, onSave }) {
  const activeZone = getHomeTerminalTimeZone(state);
  const [custom, setCustom] = React.useState(activeZone || DEFAULT_HOME_TERMINAL_TIMEZONE);
  const [error, setError] = React.useState('');
  const nowMinute = homeTerminalMinute(new Date(), activeZone);

  function saveZone(value) {
    const raw = String(value || custom || '').trim();
    if (!isValidTimeZone(raw)) {
      setError('Use a valid IANA time zone, for example America/New_York.');
      return;
    }
    const zone = normalizeTimeZone(raw);
    setError('');
    onSave?.({ timeZone: zone });
  }

  return (
    <div className="sheet active timezone-sheet">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>Log Time Zone</div><span></span></div>
      <div className="choice-body">
        <div className="timezone-current-card">
          <span>Current DOT log time zone</span>
          <b>{timeZoneSettingSummary(activeZone)}</b>
          <em>Home-terminal time now: {timeLabel(nowMinute)}</em>
          <small>Default for MC871792/Narta Express is Eastern Time. Changing this does not convert existing log event times.</small>
        </div>

        <div className="timezone-list">
          {COMMON_LOG_TIME_ZONES.map(zone => (
            <button
              type="button"
              key={zone.value}
              className={`timezone-option ${activeZone === zone.value ? 'active' : ''}`}
              onClick={() => saveZone(zone.value)}
            >
              <b>{zone.label}</b>
              <span>{zone.value}</span>
              <em>{zone.example}</em>
            </button>
          ))}
        </div>

        <div className="timezone-custom-card">
          <label htmlFor="custom-timezone-input">Custom IANA time zone</label>
          <input
            id="custom-timezone-input"
            value={custom}
            onChange={event => { setCustom(event.target.value); setError(''); }}
            placeholder="America/New_York"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
          />
          {error ? <strong>{error}</strong> : <small>Examples: America/New_York, America/Chicago, America/Los_Angeles.</small>}
          <button type="button" onClick={() => saveZone(custom)}>Save custom time zone</button>
        </div>
      </div>
    </div>
  );
}
