import React from 'react';

// FAST_EDITOR_NOTES_V11027: keep Notes immediately editable while preserving the
// legacy toggle hook used by browser regressions and existing automation.
export default function EditorNotesField({
  note,
  onNoteChange,
  label = 'Notes',
  placeholder = 'Notes / reason',
}) {
  return (
    <div className="form-section editor-note-compact-v90 editor-note-open-v11027">
      <button type="button" className="note-toggle-v90 note-label-v11027" aria-controls="logbook-editor-notes">
        <span>{label}</span>
      </button>
      <textarea
        id="logbook-editor-notes"
        className="note-v85"
        aria-label={label}
        value={note}
        onChange={e => onNoteChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </div>
  );
}
