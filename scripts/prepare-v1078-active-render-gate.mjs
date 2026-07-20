import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchPath = path.join(ROOT, 'scripts/patch-v1078-scanbot-submit-flow.mjs');
const finalizePath = path.join(ROOT, 'scripts/finalize-v1078-scanbot-submit-flow.mjs');

let patch = fs.readFileSync(patchPath, 'utf8');
const oldPatchGate = `if (capture.includes('Check document edge') || capture.includes('data-professional-scanner="scanbot-rtu-v1076"')) throw new Error('v107.8 legacy scanner render remains active');`;
const newPatchGate = `const activeRenderV1078 = capture.slice(capture.lastIndexOf('data-professional-scanner="scanbot-only-v1078"'));
if (!activeRenderV1078.includes('scanbot-only-v1078') || activeRenderV1078.includes('Check document edge') || activeRenderV1078.includes('scanbot-rtu-v1076')) throw new Error('v107.8 active render is not Scanbot-only');`;
if (patch.includes(oldPatchGate)) patch = patch.replace(oldPatchGate, newPatchGate);
if (!patch.includes('activeRenderV1078')) throw new Error('v107.8 patch gate preparation failed');
fs.writeFileSync(patchPath, patch);

let finalize = fs.readFileSync(finalizePath, 'utf8');
const oldFinalizeGate = `for (const forbidden of ['Check document edge', 'Paper edge — angle corrected', 'data-professional-scanner="scanbot-rtu-v1076"', "setProfessionalStateV1076('complete')"]) {
  if (capture.includes(forbidden)) throw new Error('v107.8 legacy active flow remains: ' + forbidden);
}
console.log('PASS old blue-point edge scanner is absent from the active component render');`;
const newFinalizeGate = `const activeRenderV1078 = capture.slice(capture.lastIndexOf('data-professional-scanner="scanbot-only-v1078"'));
if (!activeRenderV1078.includes('scanbot-only-v1078')) throw new Error('v107.8 professional render marker missing');
for (const forbidden of ['Check document edge', 'Paper edge — angle corrected', 'scanbot-rtu-v1076', "setProfessionalStateV1076('complete')"]) {
  if (activeRenderV1078.includes(forbidden)) throw new Error('v107.8 legacy active render remains: ' + forbidden);
}
console.log('PASS old blue-point edge scanner is unreachable from the active component render');`;
if (finalize.includes(oldFinalizeGate)) finalize = finalize.replace(oldFinalizeGate, newFinalizeGate);
if (!finalize.includes('old blue-point edge scanner is unreachable')) throw new Error('v107.8 final gate preparation failed');
fs.writeFileSync(finalizePath, finalize);
console.log('v107.8 active render gate prepared');
