import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '103.8.0';
const RELEASED_AT = '2026-07-16T22:20:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homePath);
if (!home.includes("from './AdaptiveHomeV1038.jsx'")) {
  home = `import AdaptiveHomeV1038 from './AdaptiveHomeV1038.jsx';\n${home}`;
}
const mainStartMarker = '      <main className="command-home-body">';
const mainStart = home.lastIndexOf(mainStartMarker);
const mainEnd = home.lastIndexOf('      </main>');
if (mainStart < 0 || mainEnd < mainStart) throw new Error('v103.8 missing final Home main block');
const adaptiveMain = `      <AdaptiveHomeV1038
        state={state}
        activeLoad={activeLoad}
        business={business}
        summary={summary}
        walletCard={walletCard}
        operatorProfile={operatorProfile}
        logbookEnabled={logbookEnabled}
        onOpenStatus={onOpenStatus}
        onOpenTrailer={onOpenTrailer}
        onOpenDay={() => onOpenDay?.(today)}
        onOpenDot={onOpenDot}
        onOpenWallet={onOpenWallet}
        onOpenScan={() => setScanOpen(true)}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenSection={setBusinessSection}
      />`;
home = home.slice(0, mainStart) + adaptiveMain + home.slice(mainEnd + '      </main>'.length);
write(homePath, home);

const cssPath = 'source/src/command-center.css';
write(cssPath, appendOnce(read(cssPath), '/* v103.8 Adaptive Home */', read('source/src/adaptive-home-v1038.css')));

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v103.8-adaptive-load-command-home',
  releasedAt:RELEASED_AT,
  notes:[
    'Uses a compact Home when no load is active, with status, HOS, Scan Rate Con and essential owner-op tools only.',
    'Switches Home into Load Command Mode whenever a verified active Rate Con guide exists.',
    'Makes the current driver step, stop, appointment, PO or pickup number and primary action the main focus.',
    'Surfaces critical Rate Con instructions including tracking, temperature, seal, detention, OS&D, check-call and paperwork requirements.',
    'Shows the next three incomplete mission steps and keeps the full Driver Mission one tap away.',
    'Removes the duplicate large Active Load, Driver Mission and Live Load sections from Home while preserving their data and workflows.'
  ],
  label:'v103.8 Adaptive Load Command Home',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

for (const [relative, marker] of [
  [homePath,'AdaptiveHomeV1038'],
  ['source/src/modules/home/AdaptiveHomeV1038.jsx','ACTIVE LOAD COMMAND'],
  ['source/src/modules/home/adaptiveHomeLogicV1038.js','rateConInstructionRowsV1038'],
  [cssPath,'adaptive-mission-v1038'],
]) {
  if (!read(relative).includes(marker)) throw new Error(`v103.8 missing ${marker} in ${relative}`);
}
console.log('v103.8 adaptive Home materialized');
await import('./verify-adaptive-home-v1038.mjs');
await import('./materialize-v1040.mjs');
