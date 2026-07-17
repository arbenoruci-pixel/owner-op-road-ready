import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPath = path.join(ROOT, 'app/api/documents/commit-upload/route.js');
let api = fs.readFileSync(apiPath, 'utf8');
const brokenJoin = ".filter(Boolean).join('" + "\n\n" + "');";
const validJoin = ".filter(Boolean).join('\\n\\n');";
if (api.includes(brokenJoin)) api = api.replace(brokenJoin, validJoin);
if (!api.includes("'[[ROAD_READY_INTELLIGENCE_V1040]]' + payload")) {
  throw new Error('v104.0 fix missing intelligence envelope');
}
if (!api.includes(validJoin)) {
  throw new Error('v104.0 fix could not repair storedDocumentNotes join');
}
fs.writeFileSync(apiPath, api);
console.log('v104.0 generated cloud notes source repaired');
