import fs from 'node:fs';
import assert from 'node:assert/strict';

const graph = fs.readFileSync('source/src/modules/graph/LogGraph.jsx', 'utf8');
const notes = fs.readFileSync('PATCH_V95_83_GRAPH_LINE_WEIGHT_AND_GRID_READABILITY_NOTES.md', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`PASS ${message}`);
}

const lineMatch = graph.match(/const\s+LINE_W\s*=\s*([0-9.]+)/);
ok(Boolean(lineMatch), 'LINE_W constant exists');
const lineW = Number(lineMatch[1]);
ok(lineW >= 5.75 && lineW <= 5.85, 'main duty trace is about 10% thicker than v95.63/v95.81');
ok(lineW > 5.25, 'main duty trace increased from previous 5.25px width');
ok(graph.includes('const VERTICAL_LINE_W = LINE_W'), 'horizontal and vertical trace bends share the same width');
ok(graph.includes('strokeWidth={LINE_W}'), 'visible duty path uses LINE_W directly');
ok(graph.includes('stroke={TRACE_COLOR}'), 'visible duty path remains one blue paper-log trace');
ok(!graph.includes('stroke={color(event.status)}'), 'graph still avoids per-status colored duty overlays');
ok(/^95\.(8[3-9]|[9-9][0-9])\./.test(pkg.version), 'package version includes v95.83 graph readability or newer');
ok(notes.includes('Increased the main blue duty-status trace'), 'v95.83 notes describe line weight change');

console.log('verify-graph-main-duty-line-thicker-v9583 passed');
