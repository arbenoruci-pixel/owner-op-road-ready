import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chunkDir = path.join(ROOT, 'scripts/v109-assets/materializer');
const encoded = fs.readdirSync(chunkDir)
  .filter(name => /^part-\d+\.txt$/.test(name))
  .sort()
  .map(name => fs.readFileSync(path.join(chunkDir, name), 'utf8').trim())
  .join('');
const source = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
const runtime = path.join(ROOT, 'scripts/materialize-v109-road-ready-scanner-v3-runtime.mjs');
fs.writeFileSync(runtime, source);

// Repair connector payload boundaries in the one-time v109 asset manifest.
// The first boundary injected `"}` into a base64 stream and the final upload
// omitted the closing quote/braces. This repair is scoped only to the v109
// scanner manifest; normal application JSON parsing remains unchanged.
const parseJson = JSON.parse;
JSON.parse = function roadReadyScannerV3JsonParse(value, reviver) {
  let input = value;
  if (typeof input === 'string' && input.startsWith('{"version":"109.0.0","files":')) {
    input = input.replace(/"\}(?=[A-Za-z0-9+/])/g, '');
    if (!input.endsWith('"}}}')) input += '"}}}';
  }
  return parseJson(input, reviver);
};

try {
  await import(`${pathToFileURL(runtime).href}?v=${Date.now()}`);
} finally {
  JSON.parse = parseJson;
  fs.rmSync(runtime, { force:true });
}
