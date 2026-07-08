import fs from 'node:fs';
import assert from 'node:assert/strict';

const graph = fs.readFileSync('source/src/modules/graph/LogGraph.jsx', 'utf8');
const css = fs.readFileSync('source/src/styles.css', 'utf8');

function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`PASS ${message}`);
}

const editableDef = /const\s+editable\s*=\s*editId\s*\?\s*sorted\.find\(e\s*=>\s*e\.id\s*===\s*editId\)/.test(graph);
const editGate = graph.indexOf('{editable && onEditTime');
const readOnlyPortion = graph.slice(0, editGate);
const editPortion = graph.slice(editGate);

ok(editableDef, 'editable event is selected by editId only');
ok(editGate > 0, 'edit handles are gated by editable && onEditTime');
ok(!readOnlyPortion.includes('edit-handles-large'), 'edit handle group is absent from read-only render path');
ok(!readOnlyPortion.includes('<circle'), 'endpoint circles are absent from read-only render path');
ok(editPortion.includes('className="edit-handles-large"'), 'edit handle group still renders during editing');
ok(editPortion.includes('r="25"') && editPortion.includes('r="15"') && editPortion.includes('r="6.5"'), 'edit handle visible circles are smaller and cleaner');
ok(!editPortion.includes('r="34"') && !editPortion.includes('r="20"') && !editPortion.includes('r="74"'), 'old oversized visible/touch handle radii are removed');
ok(editPortion.includes('r="64"'), 'large transparent touch target remains for iPhone-friendly editing');
ok(css.includes('v95.83 Graph line weight and grid readability'), 'v95.83 CSS block exists');

console.log('verify-graph-edit-handles-only-when-selected-v9583 passed');
