import React, { useEffect, useState } from 'react';

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

function locationString(city = '', state = '') {
  return [city, state].filter(Boolean).join(', ');
}

/**
 * Compact location row ("City, ST") with GPS and clear controls.
 * Manual typing stays intact while the driver types; parsing happens on blur/save.
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
  suggestions = [],
  collapsedDescription = false,
}) {
  const value = locationString(city, state);
  const [draft, setDraft] = useState(value);
  const [showDescription, setShowDescription] = useState(!collapsedDescription || !!description);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commitLocation(nextValue = draft) {
    const parsed = parseLocationText(nextValue, state);
    onLocationChange(parsed.city, parsed.state);
    setDraft(locationString(parsed.city, parsed.state));
  }

  function clearLocation() {
    setDraft('');
    onLocationChange('', '');
    onClear?.();
  }

  return (
    <div className="form-section">
      <div className="form-label">Location</div>
      <div className="location-one-v85 location-editable-v91">
        <button type="button" className="gps-locate-btn" onClick={onGps || undefined} aria-label="Use GPS location">⌖</button>
        <input
          value={draft}
          onFocus={e => e.target.select()}
          onClick={e => e.currentTarget.select()}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commitLocation()}
          placeholder="City, ST"
          autoComplete="off"
          inputMode="text"
        />
        <button type="button" className="location-clear-btn" onClick={clearLocation} aria-label="Clear location">×</button>
      </div>

      {suggestions.length ? (
        <div className="editor-location-suggestions">
          {suggestions.map(item => (
            <button key={item} type="button" onClick={() => commitLocation(item)}>{item}</button>
          ))}
        </div>
      ) : null}

      {draft && !parseLocationText(draft, '').state ? (
        <div className="gps-msg gps-v85 warn">Add state, example: Gary, IN</div>
      ) : gpsStatus ? (
        <div className="gps-msg gps-v85">{gpsStatus}</div>
      ) : null}

      {showDescription ? (
        <input
          className="desc-v85"
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          placeholder="Optional description"
        />
      ) : (
        <button type="button" className="add-note-row insert-add-description" onClick={() => setShowDescription(true)}>+ Add description optional</button>
      )}
    </div>
  );
}
