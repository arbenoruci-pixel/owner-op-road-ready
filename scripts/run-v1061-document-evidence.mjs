import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const encoded = fs.readFileSync(path.join(ROOT, 'scripts/v1061-assets/materialize-v1061-document-evidence.mjs.gz.b64'), 'utf8');
const target = path.join(ROOT, 'scripts/materialize-v1061-document-evidence.mjs');
fs.writeFileSync(target, gunzipSync(Buffer.from(encoded, 'base64')));
await import('./materialize-v1061-document-evidence.mjs');
