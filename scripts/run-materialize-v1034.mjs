import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(ROOT, 'scripts/materialize-v1034.mjs');
const runtimePath = path.join(ROOT, 'scripts/.materialize-v1034-runtime.mjs');
let source = fs.readFileSync(sourcePath, 'utf8');

source = source.replace(
  "{deliveryContextV1034.nextStop?.company ? ` · ${deliveryContextV1034.nextStop.company}` : ''}",
  "{deliveryContextV1034.nextStop?.company ? ' · ' + deliveryContextV1034.nextStop.company : ''}"
);

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

const checksAt = source.indexOf('const checks = [');
if (checksAt < 0) throw new Error('v103.4 runner could not locate final checks');
const finalIntegrityPatch = `
integrity = read(integrityPath);
if (!integrity.includes('sourceEventCandidateIdV1034')) {
  integrity = integrity.replace(
    /^(\\s*)const sourceEventId\\s*=\\s*[^\\n]*state\\.loadInfo\\?\\.sourceEventId[^\\n]*;?$/m,
    function(match, indent) {
      return indent + "const sourceEventCandidateIdV1034 = text(state.loadInfo?.sourceEventId || '');" +
        "\\n" + indent + "const sourceEventCandidateDayV1034 = validDay(state.loadInfo?.sourceEventDay || guide.pickupDate || pickup?.date);" +
        "\\n" + indent + "const sourceEventCandidateV1034 = sourceEventCandidateIdV1034 && sourceEventCandidateDayV1034 ? findEvent(state, sourceEventCandidateDayV1034, sourceEventCandidateIdV1034) : null;" +
        "\\n" + indent + "const sourceEventId = text(state.loadInfo?.guideId) === text(guide.id) && sourceEventCandidateV1034 && /pickup|loading/i.test(eventText(sourceEventCandidateV1034)) ? sourceEventCandidateIdV1034 : '';";
    }
  );
}
if (!integrity.includes('oldPickupEventIdV1034')) {
  integrity = integrity.replace(
    /^(\\s*)const pickupEventId\\s*=\\s*sequence\\s*===\\s*1[^\\n]*$/m,
    function(match, indent) {
      return indent + "const oldPickupEventIdV1034 = text(old.pickupEventId);" +
        "\\n" + indent + "const oldPickupEventDayV1034 = validDay(old.pickupDay || old.day || pickupDay);" +
        "\\n" + indent + "const oldPickupEventV1034 = oldPickupEventIdV1034 && oldPickupEventDayV1034 ? findEvent(state, oldPickupEventDayV1034, oldPickupEventIdV1034) : null;" +
        "\\n" + indent + "const validOldPickupEventIdV1034 = oldPickupEventV1034 && /pickup|loading/i.test(eventText(oldPickupEventV1034)) ? oldPickupEventIdV1034 : '';" +
        "\\n" + indent + "const pickupEventId = sequence === 1 ? (sourceEventId || validOldPickupEventIdV1034) : (validOldPickupEventIdV1034 || '');";
    }
  );
}
integrity = integrity.replace(
  /if \\(sourceEvent && sourceEvent\\.status === 'ON'\\) \\{/g,
  "if (sourceEvent && sourceEvent.status === 'ON' && /pickup|loading/i.test(eventText(sourceEvent))) {"
);
if (!integrity.includes('sourceEventCandidateIdV1034')) {
  const at = integrity.indexOf('sourceEventId');
  throw new Error('v103.4 final sourceEventId patch failed near: ' + integrity.slice(Math.max(0, at - 180), at + 320));
}
if (!integrity.includes('oldPickupEventIdV1034')) {
  const at = integrity.indexOf('pickupEventId');
  throw new Error('v103.4 final pickupEventId patch failed near: ' + integrity.slice(Math.max(0, at - 180), at + 320));
}
write(integrityPath, integrity);

`;
source = `${source.slice(0, checksAt)}${finalIntegrityPatch}${source.slice(checksAt)}`;

fs.writeFileSync(runtimePath, source);
await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
