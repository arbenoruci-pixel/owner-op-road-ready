import fs from 'node:fs';

const originalMkdirSync = fs.mkdirSync.bind(fs);
fs.mkdirSync = (target, options) => {
  if (!String(target || '').trim()) return undefined;
  return originalMkdirSync(target, options);
};

const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = fs.readFileSync(guidePath, 'utf8');
const resolvePattern = /export function resolveDriverGuideV103\(state = \{\}, guideInput = null\) \{[\s\S]*?(?=  const steps = \(guide\.steps \|\| \[\]\)\.map)/;
if (!resolvePattern.test(guide)) throw new Error('v109.5.8 could not normalize resolveDriverGuideV103 prelude');
guide = guide.replace(resolvePattern, `export function resolveDriverGuideV103(state = {}, guideInput = null) {
  const guide = guideInput || getActiveLoadGuideV103(state);
  if (!guide) return { guide:null, steps:[], completed:0, total:0, percent:0, currentStep:null, complete:false };
`);
fs.writeFileSync(guidePath, guide);

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
