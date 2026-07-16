import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(ROOT, 'scripts/materialize-v1034.mjs');
const runtimePath = path.join(ROOT, 'scripts/.materialize-v1034-runtime.mjs');
let source = fs.readFileSync(sourcePath, 'utf8');

// The source materializer intentionally contains JSX text. Remove its one
// nested template literal before Node parses the generated runtime script.
source = source.replace(
  "{deliveryContextV1034.nextStop?.company ? ` · ${deliveryContextV1034.nextStop.company}` : ''}",
  "{deliveryContextV1034.nextStop?.company ? ' · ' + deliveryContextV1034.nextStop.company : ''}"
);

// Generated StatusWorkflow variants have changed payload formatting over time.
// Enrich at the stable save call instead of matching the whole payload body.
const payloadPatchStart = source.indexOf("workflow = replacePattern(\n  workflow,\n  /    return");
const payloadPatchEnd = source.indexOf("workflow = replacePattern(\n  workflow,\n  /        \\{reasonNeedsLoadLink", payloadPatchStart);
if (payloadPatchStart < 0 || payloadPatchEnd < 0) throw new Error('v103.4 runner could not locate payload patch block');
source = `${source.slice(0, payloadPatchStart)}workflow = replaceOnce(
  workflow,
  \`    const p = payload();\`,
  \`    const p = applyDeliveryContextToPayloadV1034(state, payload());\`,
  'payload delivery enrichment'
);
${source.slice(payloadPatchEnd)}`;

// Run this after all older materializers have generated their final V107 file.
// It prevents a current delivery/unloading event from ever becoming the pickup
// event of the first Rate Con leg.
const checksAt = source.indexOf('const checks = [');
if (checksAt < 0) throw new Error('v103.4 runner could not locate final checks');
const finalIntegrityPatch = `
integrity = read(integrityPath);
if (!integrity.includes('sourceEventCandidateIdV1034')) {
  integrity = integrity.replace(
    /    const sourceEventId = text\(state\.loadInfo\?\.guideId\) === text\(guide\.id\) \? text\(state\.loadInfo\?\.sourceEventId\) : '';?/,
    "    const sourceEventCandidateIdV1034 = text(state.loadInfo?.guideId) === text(guide.id) ? text(state.loadInfo?.sourceEventId) : '';\\n    const sourceEventCandidateV1034 = sourceEventCandidateIdV1034 ? findEvent(state, sourceDay || pickupDay, sourceEventCandidateIdV1034) : null;\\n    const sourceEventId = sourceEventCandidateV1034 && /pickup|loading/i.test(eventText(sourceEventCandidateV1034)) ? sourceEventCandidateIdV1034 : '';"
  );
}
if (!integrity.includes('oldPickupEventIdV1034')) {
  integrity = integrity.replace(
    /    const pickupEventId = sequence === 1 \? \(sourceEventId \|\| old\.pickupEventId \|\| ''\) : \(old\.pickupEventId \|\| ''\);?/,
    "    const oldPickupEventIdV1034 = text(old.pickupEventId);\\n    const oldPickupEventV1034 = oldPickupEventIdV1034 ? findEvent(state, validDay(old.pickupDay || old.day || pickupDay), oldPickupEventIdV1034) : null;\\n    const validOldPickupEventIdV1034 = oldPickupEventV1034 && /pickup|loading/i.test(eventText(oldPickupEventV1034)) ? oldPickupEventIdV1034 : '';\\n    const pickupEventId = sequence === 1 ? (sourceEventId || validOldPickupEventIdV1034) : (validOldPickupEventIdV1034 || '');"
  );
}
integrity = integrity.replace(
  "  if (sourceEvent && sourceEvent.status === 'ON') {",
  "  if (sourceEvent && sourceEvent.status === 'ON' && /pickup|loading/i.test(eventText(sourceEvent))) {"
);
write(integrityPath, integrity);

`;
source = `${source.slice(0, checksAt)}${finalIntegrityPatch}${source.slice(checksAt)}`;

fs.writeFileSync(runtimePath, source);
await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
