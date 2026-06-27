import React from 'react';
import { STATUS } from '../../shared/utils/status.js';

export default function CurrentStatusCard({ status='OFF', location, reason, trailer, onOpen, onOpenTrailer }) {
  const meta = STATUS[status] || STATUS.OFF;
  const loc = location ? `${location.city}, ${location.state}` : 'Location';
  return (
    <div className="simple-status">
      <button className={`status-dot ${status}`} onClick={onOpen}>{status}</button>
      <button className="status-main" onClick={onOpen}>
        <b>{meta.label}</b>
        <span>{loc}{reason ? ` · ${reason}` : ''}</span>
      </button>
      <button className="equip-mini" onClick={onOpenTrailer}>
        <span>{trailer?.id ? trailer.id : 'No vehicle'}</span>
        <b>Change</b>
      </button>
    </div>
  );
}
