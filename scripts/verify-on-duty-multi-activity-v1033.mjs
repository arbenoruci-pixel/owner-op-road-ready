import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function legacyArtifact(value = '', status = 'OFF') {
  const text = String(value || '').toLowerCase();
  if (!text.trim()) return false;
  if (status !== 'ON' && /(pre[- ]?trip|inspection|on duty|pickup|loading|delivery|unloading)/i.test(text)) return true;
  if (status !== 'D' && /driving started|manual driving|\bdriving\b/i.test(text)) return true;
  if (status !== 'SB' && /sleeper/i.test(text)) return true;
  if (status !== 'OFF' && /off duty|parked|parking/i.test(text)) return true;
  if (status !== 'ON' && /\s\/\s/.test(text) && /(pre[- ]?trip|inspection|on duty|driving|new event)/i.test(text)) return true;
  return false;
}

const combined = 'Pre-trip inspection · Delivery / Unloading';
assert.equal(legacyArtifact(combined, 'ON'), false, 'legitimate ON DUTY multi-activity note must survive save');
assert.equal(legacyArtifact(combined, 'OFF'), true, 'same ON DUTY activity text on OFF must still be treated as stale');
assert.equal(legacyArtifact('Driving started', 'ON'), true, 'wrong-status Driving note must still be cleaned');
assert.equal(legacyArtifact('Off Duty', 'ON'), true, 'wrong-status Off Duty note must still be cleaned');

const editor = read('source/src/modules/editor/EditEventSheet.jsx');
const app = read('source/src/app/App.jsx');
const styles = read('source/src/styles.css');
assert.match(editor,/status !== 'ON' && \/\\s\\\/\\s\//);
assert.match(app,/status !== 'ON' && \/\\s\\\/\\s\//);
assert.match(editor,/composeOnDutyNote\(selectedOnReasons\.length \? selectedOnReasons : parsedOnDuty\.selected/);
assert.match(editor,/startMin:preview\.startMin/);
assert.match(editor,/endMin:preview\.endMin/);
assert.match(styles,/\.editor-on-duty-reasons \.multi-reason-grid button\.picked/);
assert.match(styles,/background:#0b7dec!important/);
assert.match(styles,/-webkit-text-fill-color:#ffffff!important/);

console.log('verify-on-duty-multi-activity-v1033 passed');
await import('./run-materialize-v1034.mjs');
