import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

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
let materializerSource = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
materializerSource = materializerSource.replace(
  "  [catalogPath,'Southeast\\\\s+unloading'],",
  "  [catalogPath,'southeast\\\\s+unloading'],",
);
const qualifierAssetPath = path.join(ROOT, 'scripts/v1061-assets/documentEvidenceQualificationV1061.js.gz.b64');
let qualifierSource = gunzipSync(Buffer.from(fs.readFileSync(qualifierAssetPath, 'utf8'), 'base64')).toString('utf8');
qualifierSource = qualifierSource.replace(
  "  if (currentHighRisk && !current?.qualified) {",
  "  if ((currentHighRisk && !current?.qualified) || (genericCurrent && currentId !== 'other')) {",
);
fs.writeFileSync(qualifierAssetPath, gzipSync(Buffer.from(qualifierSource), { mtime:0 }).toString('base64'));
const verifyAssetPath = path.join(ROOT, 'scripts/v1061-assets/verify-document-evidence-v1061.mjs.gz.b64');
let verifySource = gunzipSync(Buffer.from(fs.readFileSync(verifyAssetPath, 'utf8'), 'base64')).toString('utf8');
verifySource = verifySource.replace(
  "catalogSource.includes('Southeast\\\\s+unloading')",
  "catalogSource.includes('southeast\\\\s+unloading')",
);
fs.writeFileSync(verifyAssetPath, gzipSync(Buffer.from(verifySource), { mtime:0 }).toString('base64'));
const target = path.join(ROOT, 'scripts/materialize-v1061-document-evidence.mjs');
fs.writeFileSync(target, materializerSource);
await import('./materialize-v1061-document-evidence.mjs');
