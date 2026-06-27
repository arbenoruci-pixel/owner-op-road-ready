import React, { useState } from 'react';

/**
 * Optional notes editor. Notes stay supported, but the compact editor flow only
 * shows a small Add/Edit note control until the driver chooses to open it.
 */
export default function EditorNotesField({
  note,
  onNoteChange,
  label = 'Notes',
  placeholder = 'Notes / reason',
}) {
  const [open, setOpen] = useState(false);
  const trimmedNote = String(note || '').trim();
  const hasNote = trimmedNote.length > 0;

  return (
    <div className={`form-section editor-note-compact-v90 ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="note-toggle-v90"
        onClick={() => setOpen(v => !v)}
      >
        <span>{open ? 'Done note' : hasNote ? 'Edit note' : 'Add note'}</span>
        {hasNote && !open ? <em>{trimmedNote}</em> : null}
      </button>
      {open ? (
        <input
          className="note-v85"
          aria-label={label}
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : null}
    </div>
  );
}
