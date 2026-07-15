import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => fs.writeFileSync(file(relative), content);

const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = read(guidePath);
guide = guide.replace(
  '  if (samePlace(state.currentLocation || {}, step)) return true;',
  `  const currentCityV108 = text(state.currentLocation?.city).toLowerCase();
  const currentStateV108 = text(state.currentLocation?.state).toUpperCase();
  const stepCityV108 = text(step.city).toLowerCase();
  const stepStateV108 = text(step.state).toUpperCase();
  if (currentCityV108 && stepCityV108 && currentStateV108 && stepStateV108 && currentStateV108 === stepStateV108 && (currentCityV108 === stepCityV108 || currentCityV108.includes(stepCityV108) || stepCityV108.includes(currentCityV108))) return true;`
);
if (!guide.includes('const effectiveStepsV108')) {
  const completedLine = '  const completed = steps.filter(step => step.complete).length;';
  if (!guide.includes(completedLine)) throw new Error('v100.8 progress pass missing completed line');
  guide = guide.replace(
    completedLine,
    `  const effectiveStepsV108 = steps.map(step => {
    if (step.complete) return step;
    const complete = step.kind === 'route'
      ? routeStepCompleteV108(state, guide, step)
      : step.kind === 'status'
        ? statusStepCompleteV108(state, guide, step)
        : false;
    return complete ? { ...step, complete:true } : step;
  });
  const completed = effectiveStepsV108.filter(step => step.complete).length;`
  );
  guide = guide.replace('  const total = steps.length;', '  const total = effectiveStepsV108.length;');
  guide = guide.replace('  const currentStep = currentDriverStepV108(steps);', '  const currentStep = currentDriverStepV108(effectiveStepsV108);');
  guide = guide.replace('    steps,\n    completed,', '    steps:effectiveStepsV108,\n    completed,');
}
write(guidePath, guide);

if (!guide.includes('currentCityV108') || !guide.includes('effectiveStepsV108') || !guide.includes('steps:effectiveStepsV108')) throw new Error('v100.8 progress second pass failed');
console.log('v100.8 Driver Mission progress second pass materialized');
await import('./verify-driver-guide-progress-v108.mjs');
