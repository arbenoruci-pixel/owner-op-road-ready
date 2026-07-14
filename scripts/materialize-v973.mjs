import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '98.1.0';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}

const graphPath = 'source/src/modules/graph/LogGraph.jsx';
let graph = read(graphPath);
graph = graph
  .replace(/D:'#[0-9a-fA-F]{6}'/, "D:'#00c98d'")
  .replace(/const HOUR_GRID_W = [0-9.]+;/, 'const HOUR_GRID_W = 0.64;')
  .replace(/const QUARTER_GRID_W = [0-9.]+;/, 'const QUARTER_GRID_W = 0.3;')
  .replace(/const HOUR_GRID_OPACITY = [0-9.]+;/, 'const HOUR_GRID_OPACITY = 0.8;')
  .replace(/const QUARTER_GRID_OPACITY = [0-9.]+;/, 'const QUARTER_GRID_OPACITY = 0.58;');

// Remove only the white halo SVG line that belongs to a vertical connector.
// [^>] keeps the match inside one JSX tag so grid lines are never touched.
graph = graph.replace(
  /\s*<line\b(?=[^>]*x1=\{x\})(?=[^>]*x2=\{x\})(?=[^>]*stroke="#ffffff")(?=[^>]*VERTICAL_LINE_W)[^>]*\/>/g,
  ''
);

// Keep the v98.0 aligned graph junction geometry while the command center ships.
graph = graph.replace(
  /<line\b(?=[^>]*x1=\{x\})(?=[^>]*x2=\{x\})(?=[^>]*stroke=\{CONNECTOR_COLOR\})[^>]*\/>/g,
  '<line x1={transition.to.status === \'D\' ? x - LINE_W * 0.06 : transition.from.status === \'D\' ? x + LINE_W * 0.06 : x} x2={transition.to.status === \'D\' ? x - LINE_W * 0.06 : transition.from.status === \'D\' ? x + LINE_W * 0.06 : x} y1={Math.min(y1, y2) - LINE_W * 0.47} y2={Math.max(y1, y2) + LINE_W * 0.47} stroke={CONNECTOR_COLOR} strokeWidth={VERTICAL_LINE_W} strokeLinecap="square" shapeRendering="geometricPrecision" />'
);

graph = graph.replace(
  /const CONNECTOR_COLOR = ([^;]+);(?:\s*\/\/[^\n]*)?/,
  'const CONNECTOR_COLOR = $1; // v98.0-aligned-junction-overlap'
);
write(graphPath, graph);

// The Home component can fall back to Status, but production should route the
// center Drive button straight into the existing Drive Mode screen.
const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
if (!app.includes("onOpenDrive={()=>setState(s=>({ ...s, view:'driveMode', sheet:null }))}")) {
  app = app.replace(
    "        onOpenWallet={()=>setState(s=>({ ...s, view:'wallet', sheet:null }))}\n      />",
    "        onOpenWallet={()=>setState(s=>({ ...s, view:'wallet', sheet:null }))}\n        onOpenDrive={()=>setState(s=>({ ...s, view:'driveMode', sheet:null }))}\n      />"
  );
}
write(appPath, app);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v98.1-owner-op-command-center',
  releasedAt:'2026-07-14T01:30:00.000Z',
  notes:[
    'Replaces the old logs-first home with a clean Owner-Op Command Center and smart next-step card.',
    'Adds active-load, HOS, DOT, Wallet, Loads & Billing, Fuel & IFTA, Maintenance, Expenses, Performance, attention, and weekly summary cards.',
    'Adds a local business center for rate confirmations, weekly gross, mileage, fuel, repairs, expenses, invoice status, and per-mile performance.',
    'Keeps duty events, HOS calculations, route records, signatures, DOT logic, and stored log data unchanged.'
  ],
  label:'v98.1 Owner-Op Command Center',
  updatedAt:'2026-07-14T01:30:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const home = read('source/src/modules/home/HomeScreen.jsx');
const business = read('source/src/modules/business/OwnerOpBusinessScreen.jsx');
const commandCss = read('source/src/command-center.css');
if (!graph.includes("D:'#00c98d'") || !graph.includes('LINE_W * 0.47') || !graph.includes("transition.to.status === 'D'")) {
  throw new Error('v98.1 graph preservation verification failed');
}
if (!home.includes('Owner-Op Command Center') || !business.includes('Business Center') || !commandCss.includes('v98.1 Owner-Op Command Center')) {
  throw new Error('v98.1 command center verification failed');
}
if (!app.includes("onOpenDrive={()=>setState(s=>({ ...s, view:'driveMode', sheet:null }))}")) {
  throw new Error('v98.1 Drive Mode route verification failed');
}
console.log('v98.1 owner-op command center materialized');
