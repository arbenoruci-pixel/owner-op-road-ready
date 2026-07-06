import fs from 'fs';

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const graphPath = 'source/src/modules/graph/LogGraph.jsx';
const graph = fs.readFileSync(graphPath, 'utf8');

assert(/import\s*\{[^}]*\bcolor\b[^}]*\}\s*from ['"]\.\.\/\.\.\/shared\/utils\/status\.js['"]/.test(graph), 'LogGraph imports color helper from shared status utils');
assert(/const\s+c\s*=\s*color\(editable\.status\)/.test(graph), 'Edit handle rendering still uses color(editable.status)');
assert(/editable\s*&&\s*onEditTime/.test(graph), 'Verifier covers edit-only graph branch');
assert(!/ReferenceError:\s*color is not defined/.test(graph), 'No known missing-color error text present');

console.log(`verify-edit-event-graph-crash-v9565: ${checks} checks passed`);
