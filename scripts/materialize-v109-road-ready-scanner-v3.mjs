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
try {
  await import(`${pathToFileURL(runtime).href}?v=${Date.now()}`);
} finally {
  fs.rmSync(runtime, { force:true });
}
