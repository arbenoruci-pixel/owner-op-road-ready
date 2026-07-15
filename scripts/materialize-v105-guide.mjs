import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guidePath = path.join(ROOT, 'source/src/modules/loads/loadGuideV103.js');
let guide = fs.readFileSync(guidePath, 'utf8');
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v100.5 missing ${label}`);
  return content.replace(before, after);
}

guide = replaceOnce(
  guide,
  `  steps.push(guideStep('pretrip', 'status', 'Complete pre-trip inspection', pickupLocation || 'Before leaving for pickup', {
    phase:'before_pickup', day:pickup?.date || dayKey(fields.pickupDate || fields.date), city:pickup?.city || '', state:pickup?.state || '', status:'ON', reason:'Pre-trip inspection', loadNo, destination:pickupLocation,
  }));`,
  `  steps.push(guideStep('pretrip', 'status', 'Complete pre-trip inspection', 'Before leaving for pickup', {
    phase:'before_pickup', day:pickup?.date || dayKey(fields.pickupDate || fields.date), status:'ON', reason:'Pre-trip inspection', loadNo, destination:pickupLocation,
  }));`,
  'guide pre-trip start location'
);

if (!guide.includes('function eventMatchesGuideReferenceV105')) {
  const pattern = /function eventsForStep\(state = \{\}, step = \{\}\) \{[\s\S]*?\n\}\n\nfunction documentStepComplete/;
  if (!pattern.test(guide)) throw new Error('v100.5 missing guide status completion block');
  const replacement = [
    "function eventsForStep(state = {}, guide = {}, step = {}) {",
    "  const preferredDay = dayKey(step.day || '') || step.day || '';",
    "  const guideDay = dayKey(guide.pickupDate || '') || guide.pickupDate || '';",
    "  const days = preferredDay ? [preferredDay] : unique([guideDay, localDayKey()]);",
    "  return days.flatMap(day => (state.eventsByDay?.[day] || []).map(event => ({ ...event, _day:day })));",
    "}",
    "",
    "function eventMatchesGuideReferenceV105(event = {}, guide = {}) {",
    "  const eventRefs = unique([event.shippingDocs, event.loadNo, event.bol, event.po, event.pickedUpLoadNo, event.deliveredLoadNo].map(ref));",
    "  if (!eventRefs.length) return true;",
    "  const guideRefs = guideReferenceValues(guide);",
    "  return !guideRefs.length || eventRefs.some(value => guideRefs.includes(value));",
    "}",
    "",
    "function statusStepComplete(state = {}, guide = {}, step = {}) {",
    "  const events = eventsForStep(state, guide, step);",
    "  const reason = text(step.reason).toLowerCase();",
    "  const pretripReason = /pre[- ]?trip|inspection/.test(reason);",
    "  return events.some(event => {",
    "    if (step.status && event.status !== step.status) return false;",
    "    const eventText = `${event.note || ''} ${event.description || ''}`.toLowerCase();",
    "    if (pretripReason && !/pre[- ]?trip|inspection/.test(eventText)) return false;",
    "    if (/pickup|loading/.test(reason) && !/pickup|loading/.test(eventText)) return false;",
    "    if (/delivery|unloading/.test(reason) && !/delivery|unloading/.test(eventText)) return false;",
    "    if (!pretripReason && (step.city || step.state) && !samePlace(event, step)) return false;",
    "    if (!eventMatchesGuideReferenceV105(event, guide)) return false;",
    "    return true;",
    "  });",
    "}",
    "",
    "function documentStepComplete",
  ].join('\n');
  guide = guide.replace(pattern, replacement);
}

guide = guide.replace(/statusStepComplete\(state, step\)/g, 'statusStepComplete(state, guide, step)');
fs.writeFileSync(guidePath, guide);
console.log('v100.5 Driver Mission progress patch applied');
