import fs from 'node:fs';

const applyPath = 'scripts/apply-v10965-live-pickup-mission.mjs';
let source = fs.readFileSync(applyPath, 'utf8');

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
fs.writeFileSync(applyPath, source);

const guidePath = 'source/src/modules/loads/loadGuideV103.js';
let guide = fs.readFileSync(guidePath, 'utf8');

function replaceFunction(startName, nextName, replacement) {
  const pattern = new RegExp(`function ${startName}\\([\\s\\S]*?\\n}\\n\\n(?=function ${nextName}|export function ${nextName})`);
  if (!pattern.test(guide)) throw new Error(`v109.6.5 prepare could not locate ${startName}`);
  guide = guide.replace(pattern, `${replacement}\n\n`);
}

replaceFunction('samePlace', 'eventsForStep', `function samePlace(event = {}, step = {}) {
  const city = text(step.city).toLowerCase();
  const state = text(step.state).toUpperCase();
  if (!city && !state) return true;
  const eventCity = text(event.city).toLowerCase();
  const eventState = text(event.state).toUpperCase();
  const cityOk = !city || eventCity.includes(city) || city.includes(eventCity);
  const stateOk = !state || eventState === state;
  return cityOk && stateOk;
}`);

replaceFunction('eventsForStep', 'statusStepComplete', `function eventsForStep(state = {}, step = {}) {
  const preferredDay = step.day || '';
  const days = unique([preferredDay, localDayKey(), ...Object.keys(state.eventsByDay || {})]);
  return days.flatMap(day => (state.eventsByDay?.[day] || []).map(event => ({ ...event, _day:day })));
}`);

replaceFunction('statusStepComplete', 'documentStepComplete', `function statusStepComplete(state = {}, step = {}) {
  const events = eventsForStep(state, step);
  const reason = text(step.reason).toLowerCase();
  return events.some(event => {
    if (step.status && event.status !== step.status) return false;
    const eventText = (String(event.note || '') + ' ' + String(event.description || '')).toLowerCase();
    if (/pre[- ]?trip|inspection/.test(reason) && !/pre[- ]?trip|inspection/.test(eventText)) return false;
    if (/pickup|loading/.test(reason) && !/pickup|loading/.test(eventText)) return false;
    if (/delivery|unloading/.test(reason) && !/delivery|unloading/.test(eventText)) return false;
    if (step.status !== 'D' && !samePlace(event, step)) return false;
    return true;
  });
}`);

replaceFunction('documentStepComplete', 'resolveDriverGuideV103', `function documentStepComplete(state = {}, guide = {}, step = {}) {
  const expected = step.documentType;
  if (!expected) return false;
  if (expected === 'bol' && guide.documents?.bolDocumentId) return true;
  if (expected === 'pod' && guide.documents?.podDocumentId) return true;
  const guideRefs = guideReferenceValues(guide);
  return Object.values(state.documentsByDay || {}).flatMap(list => Array.isArray(list) ? list : []).some(document => {
    if (document?.type !== expected) return false;
    const docRef = ref(document.loadNo || '');
    return !guideRefs.length || (docRef && guideRefs.includes(docRef));
  });
}`);

fs.writeFileSync(guidePath, guide);
console.log('PASS — v109.6.5 generated strings and mission function anchors prepared');
