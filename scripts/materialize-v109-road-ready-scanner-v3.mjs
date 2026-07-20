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

// The first production upload split the large scanner asset manifest across
// connector payload boundaries. Some boundaries contain an injected `"}`
// immediately before the next base64 segment. Repair only this v109 manifest
// signature while it is parsed; all other JSON parsing remains unchanged.
const parseJson = JSON.parse;
JSON.parse = function roadReadyScannerV3JsonParse(value, reviver) {
  const input = typeof value === 'string' && value.startsWith('{"version":"109.0.0","files":')
    ? value.replace(/"\}(?=[A-Za-z0-9+/])/g, '')
    : value;
  return parseJson(input, reviver);
};

try {
  await import(`${pathToFileURL(runtime).href}?v=${Date.now()}`);
} finally {
  JSON.parse = parseJson;
  fs.rmSync(runtime, { force:true });
}
