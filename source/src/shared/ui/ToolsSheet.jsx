import React from 'react';

export default function ToolsSheet({ onClose, onDot, onWallet, onClearTestDates }) {
  return (
    <div className="sheet active tools-sheet">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>Log Tools</div><span></span></div>
      <div className="choice-body">
        <button className="choice-card" onClick={onDot}><b>DOT Inspection</b><span>Email officer report or open inspection-safe DOT Mode on this device.</span></button>
        <button className="choice-card" onClick={onWallet}><b>DOT Digital Wallet</b><span>CDL, medical, registration, insurance, annual inspection, BOL, and expiration reminders.</span></button>
        <button className="choice-card danger" onClick={onClearTestDates}><b>Clear test dates</b><span>Deletes log dates, events, signatures, inspections, route/load test data, and GPS trip data so you can start a fresh test.</span></button>
      </div>
    </div>
  );
}
