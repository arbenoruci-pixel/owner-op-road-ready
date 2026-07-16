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
fs.writeFileSync(runtimePath, source);
await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
