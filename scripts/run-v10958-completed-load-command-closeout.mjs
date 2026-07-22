import fs from 'node:fs';

const originalMkdirSync = fs.mkdirSync.bind(fs);
fs.mkdirSync = (target, options) => {
  if (!String(target || '').trim()) return undefined;
  return originalMkdirSync(target, options);
};

await import('./apply-v10958-completed-load-command-closeout.mjs');

const helperPath = 'source/src/modules/loads/completedLoadCloseoutV10958.js';
let helper = fs.readFileSync(helperPath, 'utf8');
const before = `  const guide = guideId ? state.loadGuidesById?.[guideId] : null;
  const closeGuide = Boolean(guide && (guideClosedOrMalformedV10958(guide) || relatedRouteLegsV10958(state, candidate).every(routeLegClosedV10958)));`;
const after = `  const guide = guideId ? state.loadGuidesById?.[guideId] : null;
  const relatedLegs = relatedRouteLegsV10958(state, candidate);
  const closeGuide = Boolean(guide && (guideClosedOrMalformedV10958(guide) || (relatedLegs.length > 0 && relatedLegs.every(routeLegClosedV10958))));`;
if (!helper.includes(before)) throw new Error('v109.5.8 generated close-guide guard missing');
helper = helper.replace(before, after);
fs.writeFileSync(helperPath, helper);

console.log('PASS — v109.5.8 generated closeout safety finalized');
