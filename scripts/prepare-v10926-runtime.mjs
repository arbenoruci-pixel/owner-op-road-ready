import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'scripts/apply-v10926-event-reasons-source-of-truth.mjs');
let source = fs.readFileSync(target, 'utf8');

const strictBlock = `  source = replaceOnce(
    source,
    \`function hasStartDutyContextText(event = {}) {\\n  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop\\s*&\\s*hook|hook|delivery|unloading|drop\\s*off/i.test(\\\`${'${event.note || \'\'} ${event.description || \'\'}'}\\\`);\\n}\`,
    \`function hasStartDutyContextText(event = {}) {\\n  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop\\s*&\\s*hook|hook|delivery|unloading|drop\\s*off/i.test(eventActivityText(event));\\n}\`,
    'DOT start-duty reasons',
  );`;

const tolerantBlock = `  // Generated builds format this fallback differently. It is safe to leave it
  // untouched because timeline normalization already reconstructs note from reasons[],
  // while hasPreTripText above reads reasons[] directly.
  const legacyStartDuty = \`function hasStartDutyContextText(event = {}) {\\n  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop\\\\s*&\\\\s*hook|hook|delivery|unloading|drop\\\\s*off/i.test(\\\`${'${event.note || \'\'} ${event.description || \'\'}'}\\\`);\\n}\`;
  const reasonAwareStartDuty = \`function hasStartDutyContextText(event = {}) {\\n  return event.status === 'ON' && /pre[- ]?trip|inspection|pickup|loading|drop\\\\s*&\\\\s*hook|hook|delivery|unloading|drop\\\\s*off/i.test(eventActivityText(event));\\n}\`;
  if (source.includes(legacyStartDuty)) source = source.replace(legacyStartDuty, reasonAwareStartDuty);`;

if (!source.includes(strictBlock)) {
  throw new Error('prepare-v10926 could not find the strict DOT start-duty patch block');
}

source = source.replace(strictBlock, tolerantBlock);
fs.writeFileSync(target, source);
console.log('Prepared v109.2.6 with tolerant generated DOT context patch.');
