import React from 'react';
import { CURRENT_APP_VERSION } from '../../core/update/appUpdate.js';

export default function ToolsSheet({ onClose, onDot, onWallet, onMove, updateState, onCheckUpdate, onApplyUpdate, onClearTestDates }) {
  const available = !!updateState?.available;
  const latest = updateState?.remote?.version || updateState?.latestVersion || CURRENT_APP_VERSION;
  const checking = !!updateState?.checking;
  const saving = updateState?.saveState === 'saving-update';

  return (
    <div className="sheet active tools-sheet">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>Log Tools</div><span></span></div>
      <div className="choice-body">
        <button className="choice-card" onClick={onDot}><b>DOT Inspection</b><span>Email officer report or open inspection-safe DOT Mode on this device.</span></button>
        <button className="choice-card" onClick={onWallet}><b>DOT Digital Wallet</b><span>CDL, medical, registration, insurance, annual inspection, BOL, and expiration reminders.</span></button>
        <button className="choice-card" onClick={onMove}><b>Shift day events</b><span>Select all real events for this day and move them forward or backward together.</span></button>
        <button className={`choice-card ${available ? 'update-ready' : ''}`} onClick={available ? onApplyUpdate : onCheckUpdate} disabled={saving}>
          <b>{available ? 'Update ready' : 'Check app update'}</b>
          <span>{saving ? 'Saving logs before update…' : available ? `v${latest} available. Saves logs first, then reloads.` : `Current v${CURRENT_APP_VERSION}. App checks automatically.`}</span>
          <em>{checking ? 'Checking…' : available ? 'Update safely' : 'Check now'}</em>
        </button>
        <button className="choice-card danger" onClick={onClearTestDates}><b>Clear test dates</b><span>Deletes log dates, events, signatures, inspections, route/load test data, and GPS trip data so you can start a fresh test.</span></button>
      </div>
    </div>
  );
}
