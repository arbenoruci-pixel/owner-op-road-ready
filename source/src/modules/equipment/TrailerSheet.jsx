import React, { useState } from 'react';

export default function TrailerSheet({ currentTrailer, onClose, onSave }) {
  const [action, setAction] = useState(currentTrailer && currentTrailer !== 'No trailer' ? 'drop-hook' : 'hook');
  const [dropTrailer, setDropTrailer] = useState(currentTrailer && currentTrailer !== 'No trailer' ? currentTrailer : '');
  const [hookTrailer, setHookTrailer] = useState('');
  const [note, setNote] = useState('');

  function save() {
    if (action === 'hook') {
      onSave({ action, currentTrailer: hookTrailer || 'Trailer hooked', note });
    }
    if (action === 'drop') {
      onSave({ action, currentTrailer: 'No trailer', droppedTrailer: dropTrailer || currentTrailer, note });
    }
    if (action === 'drop-hook') {
      onSave({ action, currentTrailer: hookTrailer || 'Trailer hooked', droppedTrailer: dropTrailer || currentTrailer, hookedTrailer: hookTrailer || 'Trailer hooked', note });
    }
  }

  return (
    <div className="sheet active">
      <div className="sheet-head">
        <button onClick={onClose}>‹</button>
        <div>Trailer</div>
        <span></span>
      </div>

      <div className="form">
        <div className="trailer-current-box">
          <small>Current trailer</small>
          <b>{currentTrailer || 'No trailer'}</b>
        </div>

        <div className="form-label">Trailer action</div>
        <div className="trailer-action-grid">
          <button className={action === 'hook' ? 'active' : ''} onClick={() => setAction('hook')}>Hook Trailer</button>
          <button className={action === 'drop' ? 'active' : ''} onClick={() => setAction('drop')}>Drop Trailer</button>
          <button className={action === 'drop-hook' ? 'active' : ''} onClick={() => setAction('drop-hook')}>Drop & Hook</button>
        </div>

        {(action === 'drop' || action === 'drop-hook') && (
          <>
            <div className="form-label">Drop trailer</div>
            <input value={dropTrailer} onChange={e => setDropTrailer(e.target.value)} placeholder="Trailer to drop" />
          </>
        )}

        {(action === 'hook' || action === 'drop-hook') && (
          <>
            <div className="form-label">Hook trailer</div>
            <input value={hookTrailer} onChange={e => setHookTrailer(e.target.value)} placeholder="Hooked trailer number" />
          </>
        )}

        <div className="form-label">Note</div>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional trailer note, seal, yard, dock..." />

        <div className="warning">Trailer actions are separate from duty status. If this work also needs an ON DUTY log event, add or change duty status separately.</div>

        <button className="save-main" onClick={save}>Save trailer</button>
        <button className="cancel-main" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
