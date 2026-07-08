import fs from 'node:fs';
import assert from 'node:assert/strict';

const graph = fs.readFileSync('source/src/modules/graph/LogGraph.jsx', 'utf8');
const css = fs.readFileSync('source/src/styles.css', 'utf8');
const notes = fs.readFileSync('PATCH_V95_83_GRAPH_LINE_WEIGHT_AND_GRID_READABILITY_NOTES.md', 'utf8');

function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`PASS ${message}`);
}

const editGate = graph.indexOf('{editable && onEditTime');
ok(editGate > 0, 'edit handle gate exists');
const readOnlyPortion = graph.slice(0, editGate);

ok(!readOnlyPortion.includes('<circle'), 'read-only graph rendering contains no circle markers');
ok(!graph.includes('className="short-event-marker"'), 'read-only short-event dot marker class removed from LogGraph');
ok(!graph.includes('graph-violation-badge'), 'warning/exclamation badge circles removed from LogGraph');
ok(!graph.includes('className="violation-bang"'), 'warning/exclamation text removed from LogGraph');
ok(graph.includes('shortTraceBoosts'), 'short events still have dedicated visibility handling');
ok(graph.includes('className="short-event-trace-boost"'), 'short events render as a minimum blue trace segment');
ok(graph.includes('strokeLinecap="butt"'), 'short event trace boosts stay crisp instead of dot-like');
ok(css.includes('.log-graph .short-event-marker') && css.includes('display:none!important'), 'legacy dot marker classes are hidden if old markup appears');
ok(notes.includes('Removed always-visible short-event dot markers'), 'v95.83 notes describe read-only marker cleanup');

console.log('verify-graph-readonly-no-dot-markers-v9583 passed');
