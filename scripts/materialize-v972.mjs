import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '97.2.0';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}

const graphPath = 'source/src/modules/graph/LogGraph.jsx';
let graph = read(graphPath);
const before = graph;
graph = graph.replace(/D:'#[0-9a-fA-F]{6}'/, "D:'#00b394'");
if (graph === before && !graph.includes("D:'#00b394'")) {
  throw new Error('v97.2 patch failed: driving trace color not found');
}
write(graphPath, graph);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v97.2-brighter-driving-trace',
  releasedAt:'2026-07-13T03:40:00.000Z',
  notes:[
    'Brightens the Driving trace slightly for better visibility while keeping the same thickness and geometry.',
    'Does not change duty events, times, HOS calculations, routes, signing, or stored log data.'
  ],
  label:'v97.2 Brighter Driving Trace',
  updatedAt:'2026-07-13T03:40:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

console.log('v97.2 brighter Driving trace materialized');
