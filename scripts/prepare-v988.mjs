import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'scripts/materialize-v988.mjs');
let source = fs.readFileSync(target, 'utf8');
source = source.split("`{ icon:'log', title:'Logbook',").join("`{ id:'logbook', icon:'log', title:'Logbook',");
fs.writeFileSync(target, source);
console.log('v98.8 materializer prepared');
