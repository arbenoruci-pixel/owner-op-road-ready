import React, { useMemo, useState } from 'react';
import '../../team-driver-v110405.css';
import { teamDriverSummary } from '../../core/team/teamLogbook.js';

export default function TeamDriverBar({ state, onAddDriver, onSwitchDriver }) {
  const summary = useMemo(() => teamDriverSummary(state), [state]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const active = summary.activeDriver;

  function addDriver() {
    const clean = String(name || '').trim();
    if (!clean) return;
    onAddDriver?.(clean);
    setName('');
    setOpen(true);
  }

  return (
    <div className="team-driver-shell">
      <div className="team-driver-bar">
        <button type="button" className="team-driver-current" onClick={() => setOpen(value => !value)}>
          <span className="team-driver-avatar">{(active?.name || 'D').slice(0, 1).toUpperCase()}</span>
          <span>
            <small>{summary.drivers.length > 1 ? 'TEAM DRIVER' : 'DRIVER'}</small>
            <b>{active?.name || 'Driver'}</b>
          </span>
          <em>{summary.drivers.length > 1 ? `${summary.drivers.length} drivers` : 'Add team'}</em>
        </button>
        <button type="button" className="team-driver-toggle" onClick={() => setOpen(value => !value)} aria-label="Open team drivers">
          {open ? '×' : '⇄'}
        </button>
      </div>

      {open ? (
        <div className="team-driver-panel">
          <div className="team-driver-list">
            {summary.drivers.map(driver => (
              <button
                type="button"
                key={driver.id}
                className={driver.id === summary.activeDriverId ? 'active' : ''}
                onClick={() => {
                  onSwitchDriver?.(driver.id);
                  setOpen(false);
                }}
              >
                <span>{driver.name.slice(0, 1).toUpperCase()}</span>
                <b>{driver.name}</b>
                <em>{driver.id === summary.activeDriverId ? 'Active log' : 'Switch'}</em>
              </button>
            ))}
          </div>
          <div className="team-driver-add">
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Second driver name"
              onKeyDown={event => {
                if (event.key === 'Enter') addDriver();
              }}
            />
            <button type="button" onClick={addDriver} disabled={!name.trim()}>+ Add</button>
          </div>
          <p>Each driver keeps a separate duty log, signatures and inspections on this device. Load and truck information stays shared.</p>
        </div>
      ) : null}
    </div>
  );
}
