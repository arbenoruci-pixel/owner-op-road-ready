import fs from 'node:fs';

const path = 'scripts/apply-v10965-live-pickup-mission.mjs';
let source = fs.readFileSync(path, 'utf8');

const lines = source.split('\n').map(line => {
  if (line.includes('const eventText =') && line.includes('event.note') && line.includes('event.description')) {
    return "    const eventText = (String(event.note || '') + ' ' + String(event.description || '')).toLowerCase();";
  }
  if (line.includes('id:step.id ||') && line.includes('step_') && line.includes('index + 1')) {
    return "    id:step.id || ('step_' + (index + 1)),";
  }
  return line;
});
source = lines.join('\n');

fs.writeFileSync(path, source);
console.log('PASS — v109.6.5 generated string templates prepared');
