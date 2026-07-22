import fs from 'node:fs';

const path = 'scripts/apply-v10964-save-completion-stability.mjs';
let source = fs.readFileSync(path, 'utf8');
const before = "stop.id || `stop_${index + 1}`";
const after = "stop.id || ('stop_' + (index + 1))";
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('v109.6.4 generated helper template anchor missing');
  source = source.replace(before, after);
}
fs.writeFileSync(path, source);
console.log('PASS — v109.6.4 generated helper template prepared');
