import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/documents/documentFoundationV105.js');
let source = fs.readFileSync(target, 'utf8');
const before = "invalidLoad || invalidPlace || invalidDate || document.reviewStatus === 'needs_review'";
const after = "invalidLoad || invalidPlace || invalidDate || document.status === 'needs_review' || document.reviewStatus === 'needs_review'";
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('v105 missing legacy document review-status condition');
  source = source.replace(before, after);
  fs.writeFileSync(target, source);
}
console.log('v105 explicit Needs Review status preserved');
