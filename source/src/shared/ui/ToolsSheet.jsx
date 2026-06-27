import React from 'react';

export default function ToolsSheet({ onClose, onMove, onDot }) {
  return (
    <div className="sheet active tools-sheet">
      <div className="sheet-head"><button onClick={onClose}>‹</button><div>Log Tools</div><span></span></div>
      <div className="choice-body">
        <button className="choice-card" onClick={onMove}><b>Move selected events</b><span>Select events and shift them forward/backward.</span></button>
        <button className="choice-card" onClick={onDot}><b>DOT Mode</b><span>Show clean official log view only.</span></button>
      </div>
    </div>
  );
}
