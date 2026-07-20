import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'scripts/patch-v1074-document-restore.mjs');
let source = fs.readFileSync(target, 'utf8');
const invalid = "context.filter = `blur(${blurPx}px)`;";
const valid = "context.filter = \\`blur(\\${blurPx}px)\\`;";
if (source.includes(invalid)) source = source.replace(invalid, valid);
if (!source.includes(valid)) throw new Error('v107.4 blur template escape repair failed');
fs.writeFileSync(target, source);
console.log('v107.4 blur template escaping prepared');
