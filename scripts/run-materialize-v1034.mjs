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

fs.writeFileSync(runtimePath, source);
await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
