import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chunkDirectory = path.join(ROOT, 'scripts/v1061-assets/materializer-chunks');
const encoded = fs.readdirSync(chunkDirectory)
  .filter(name => /^\d+\.txt$/.test(name))
  .sort()
  .map(name => fs.readFileSync(path.join(chunkDirectory, name), 'utf8').trim())
  .join('');
const digest = crypto.createHash('sha256').update(encoded).digest('hex');
if (encoded.length !== 5932 || digest !== 'c4341f3a069d26b6289aeeda96be46e29ed143ecd8fa92995ac7e2c4c0123481') {
  throw new Error(`v106.1 materializer asset integrity failed: ${encoded.length}:${digest}`);
}
const target = path.join(ROOT, 'scripts/materialize-v1061-document-evidence.mjs');
fs.writeFileSync(target, gunzipSync(Buffer.from(encoded, 'base64')));
await import('./materialize-v1061-document-evidence.mjs');
