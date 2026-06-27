import React from 'react';
import LogGraph from '../../graph/LogGraph.jsx';

/**
 * The log graph panel. Sits directly under the duty buttons and is the focus
 * of the screen. Graph drawing/drag-handle logic stays in LogGraph.jsx; this
 * component only owns the consistent framing so Edit Duty Status and Insert
 * Events look identical.
 *
 * Props forward straight to LogGraph: events, selectedId, editId, onEditTime,
 * onSelect, onEmptyTap. `header` is kept as a non-visual accessibility label
 * so the graph can come immediately after the duty buttons.
 */
export default function EditorGraphPanel({
  events,
  selectedId,
  editId,
  onEditTime,
  onSelect,
  onEmptyTap,
  header = null,
}) {
  return (
    <div className="editor-graph-panel editor-graph-wrap-v85">
      <div className="v79-graph-card editor-graph-card" aria-label={header || undefined}>
        <LogGraph
          events={events}
          selectedId={selectedId}
          editId={editId}
          onEditTime={onEditTime}
          onSelect={onSelect}
          onEmptyTap={onEmptyTap}
          className="editor-large-graph graph-v85"
        />
      </div>
    </div>
  );
}
