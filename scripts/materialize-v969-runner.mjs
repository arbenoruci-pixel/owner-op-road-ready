import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'scripts/materialize-v969.mjs');
const tempPath = path.join(root, 'scripts/.materialize-v969-fixed.mjs');
let source = fs.readFileSync(sourcePath, 'utf8');
source = source
  .replace("return `load_${safeText(leg.pickupEventId)}`;", "return 'load_' + safeText(leg.pickupEventId);")
  .replace("loadGroupId:anchor.loadGroupId || `load_${anchor.pickupEventId || anchor.id}`", "loadGroupId:anchor.loadGroupId || ('load_' + (anchor.pickupEventId || anchor.id))");
fs.writeFileSync(tempPath, source);
try {
  await import(pathToFileURL(tempPath).href + '?v=' + Date.now());
} finally {
  fs.rmSync(tempPath, { force:true });
}
