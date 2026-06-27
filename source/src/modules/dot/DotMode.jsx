import React from 'react';
import { Header, Tabs } from '../../shared/ui/Chrome.jsx';
import LogGraph from '../graph/LogGraph.jsx';
import { durLabel, timeLabel } from '../../shared/utils/time.js';
import { color } from '../../shared/utils/status.js';

export default function DotMode({ dayTitle, events, onBack }) {
  return (
    <section className="screen active dot-mode">
      <Header title="DOT MODE" onBack={onBack} right="" />
      <Tabs />
      <div className="graph-panel"><LogGraph events={events} /></div>
      <div className="events">
        {events.map(e => (
          <div className="event-row" key={e.id}>
            <div className="event-badge" style={{ background:color(e.status) }}>{e.status}</div>
            <div className="event-content">
              <div className="event-time">{timeLabel(e.startMin, true)} EDT <span>|</span> {durLabel(e.endMin-e.startMin)}</div>
              <div className="event-loc">{e.description || `${e.city}, ${e.state}`}</div>
              <div className="event-note">{e.note}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="dot-note">Official paper-style log view only. Private warnings, drafts, billing, IFTA drafts, and internal edit notes are hidden.</div>
    </section>
  );
}
