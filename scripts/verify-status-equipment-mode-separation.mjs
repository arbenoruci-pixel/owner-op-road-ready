import fs from 'node:fs';
import { isIntermodalModeActive } from './v110324/equipmentMode.js';

const status = fs.readFileSync('source/src/modules/status/StatusWorkflowSheet.jsx', 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

assert(status.includes("const trailerReasons = ['Drop Load / Trailer', 'Hook / Pickup Trailer']"), 'normal trailer mode exposes trailer actions');
assert(status.includes("const intermodalReasons = ['Drop Off', 'Drop & Hook', 'Hook Empty / Reposition']"), 'intermodal mode exposes container/chassis actions');
assert(status.includes("import { isIntermodalModeActive } from './equipmentMode.js'"), 'status flow resolves active equipment mode');
assert(status.includes('reasonList(status, intermodalMode).map'), 'reason buttons are separated by active equipment mode');
assert(status.includes('const equipmentDropSelected = intermodalMode &&'), 'container/chassis panel is limited to intermodal mode');
assert(status.includes('intermodalMode && dropOffSelected && !dropContainer.trim()'), 'container/chassis validation is limited to intermodal drop off');

assert(isIntermodalModeActive({
  currentTrailer:'PTLZ232755',
  equipment:{ type:'intermodal', container:'', chassis:'' },
}) === false, 'PTLZ232755 is treated as a regular trailer despite stale legacy equipment type');
assert(isIntermodalModeActive({
  currentTrailer:'Chassis NSPZ135827',
  equipment:{ type:'intermodal', container:'AZNU203742', chassis:'NSPZ135827' },
}) === true, 'container/chassis equipment stays in intermodal mode');
assert(isIntermodalModeActive({
  currentTrailer:'No trailer',
  equipment:{ type:'dry_van', trailer:'' },
}) === false, 'dry van without a hooked trailer stays in trailer mode');

console.log('status equipment mode separation verification passed');
