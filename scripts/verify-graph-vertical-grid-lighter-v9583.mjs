import fs from 'node:fs';
import assert from 'node:assert/strict';

const graph = fs.readFileSync('source/src/modules/graph/LogGraph.jsx', 'utf8');
const css = fs.readFileSync('source/src/styles.css', 'utf8');
const notes = fs.readFileSync('PATCH_V95_83_GRAPH_LINE_WEIGHT_AND_GRID_READABILITY_NOTES.md', 'utf8');

function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`PASS ${message}`);
}
function constantNumber(name) {
  const m = graph.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  assert.ok(m, `${name} constant exists`);
  return Number(m[1]);
}

const hourW = constantNumber('HOUR_GRID_W');
const quarterW = constantNumber('QUARTER_GRID_W');
const hourOpacity = constantNumber('HOUR_GRID_OPACITY');
const quarterOpacity = constantNumber('QUARTER_GRID_OPACITY');

ok(hourW <= 0.44, 'hour grid line stroke width reduced about 40% from 0.72px');
ok(quarterW <= 0.21, 'quarter-hour grid line stroke width reduced about 40% from 0.34px');
ok(hourW > quarterW, 'hour grid lines remain slightly stronger than quarter-hour lines');
ok(hourOpacity < 1 && quarterOpacity < 1, 'vertical grid lines use reduced opacity');
ok(hourOpacity >= quarterOpacity, 'hour grid opacity remains slightly stronger than quarter-hour opacity');
ok(graph.includes('className={major ? \'graph-hour-grid-line\' : \'graph-quarter-grid-line\'}'), 'grid lines have dedicated classes');
ok(graph.includes('strokeWidth={major ? HOUR_GRID_W : QUARTER_GRID_W}'), 'grid stroke width uses light v95.83 constants');
ok(!graph.includes('strokeWidth={major ? 0.72 : 0.34}'), 'old heavier grid stroke widths are removed');
ok(css.includes('.log-graph .graph-hour-grid-line'), 'v95.83 CSS targets hour grid lines');
ok(notes.includes('Reduced vertical grid line stroke widths'), 'v95.83 notes describe grid reduction');

console.log('verify-graph-vertical-grid-lighter-v9583 passed');
