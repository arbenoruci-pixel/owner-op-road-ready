import React from 'react';

function parseLocationText(value, fallbackState = '') {
  const raw = String(value || '');
  if (!raw.trim()) return { city: '', state: '' };

  const parts = raw.split(',');
  if (parts.length >= 2) {
    const state = parts.pop().trim().toUpperCase().slice(0, 2);
    return { city: parts.join(',').trim(), state };
  }

  const trailingState = raw.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (trailingState) {
    return { city: trailingState[1].trim(), state: trailingState[2].toUpperCase() };
  }

  return { city: raw.trim(), state: fallbackState || '' };
}

/**
 * Compact location row ("City, ST") with GPS and clear controls.
 * On focus the full value is selected so iPhone users can replace it quickly.
 */
export default function EditorLocationFields({
  city,
  state,
  onLocationChange,
  description,
  onDescriptionChange,
  onGps = null,
  gpsStatus = '',
  onClear = null,
}) {
  const value = [city, state].filter(Boolean).join(', ');

  function clearLocation() {
    onLocationChange('', '');
    onClear?.();
  }

  return (
    <div className="form-section">
      <div className="form-label">Location</div>
      <div className="location-one-v85 location-editable-v91">
        <button type="button" className="gps-locate-btn" onClick={onGps || undefined} aria-label="Use GPS location">⌖</button>
        <input
          value={value}
          onFocus={e => e.target.select()}
          onClick={e => e.currentTarget.select()}
          onChange={e => {
            const parsed = parseLocationText(e.target.value, state);
            onLocationChange(parsed.city, parsed.state);
          }}
          placeholder="City, ST"
          autoComplete="off"
          inputMode="text"
        />
        <button type="button" className="location-clear-btn" onClick={clearLocation} aria-label="Clear location">×</button>
      </div>
      {gpsStatus ? <div className="gps-msg gps-v85">{gpsStatus}</div> : null}
      <input
        className="desc-v85"
        value={description}
        onChange={e => onDescriptionChange(e.target.value)}
        placeholder="Optional description"
      />
    </div>
  );
}
