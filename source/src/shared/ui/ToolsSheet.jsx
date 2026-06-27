import React from 'react';

export default function ToolsSheet({ onClose, onDot }) {
  return (
    <div className="sheet active tools-sheet">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>Log Tools</div><span></span></div>
      <div className="choice-body">
        <button className="choice-card" onClick={onDot}><b>DOT Inspection</b><span>Email officer report or open inspection-safe DOT Mode on this device.</span></button>
      </div>
    </div>
  );
}
