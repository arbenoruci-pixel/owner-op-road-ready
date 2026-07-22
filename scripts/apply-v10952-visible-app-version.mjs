import fs from 'node:fs';

const VERSION = '109.5.2';
const BUILD = 'v10952-visible-app-version';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function writeJson(path, transform) {
  const value = JSON.parse(read(path));
  transform(value);
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homePath);
const businessImport = "import { BUSINESS_STORE_EVENT, businessSummary, readBusinessStore } from '../business/businessStore.js';";
const versionImport = "import { CURRENT_APP_VERSION } from '../../core/update/appUpdate.js';";
if (!home.includes(versionImport)) {
  if (!home.includes(businessImport)) throw new Error('v109.5.2 HomeScreen import marker missing');
  home = home.replace(businessImport, `${businessImport}\n${versionImport}`);
}

const visibleBrand = '<div><b>Road Ready</b><em>{modeLabel(operatorProfile.mode)} · App v{CURRENT_APP_VERSION}</em></div>';
if (!home.includes('App v{CURRENT_APP_VERSION}')) {
  const modularBrand = '<div><b>Road Ready</b><em>{modeLabel(operatorProfile.mode)}</em></div>';
  const baseBrand = '<div><b>Road Ready</b><em>Owner-Op Command Center</em></div>';
  if (home.includes(modularBrand)) {
    home = home.replace(modularBrand, visibleBrand);
  } else if (home.includes(baseBrand)) {
    home = home.replace(baseBrand, '<div><b>Road Ready</b><em>Owner-Op Command Center · App v{CURRENT_APP_VERSION}</em></div>');
  } else {
    throw new Error('v109.5.2 HomeScreen brand marker missing');
  }
}
write(homePath, home);

const toolsPath = 'source/src/shared/ui/ToolsSheet.jsx';
let tools = read(toolsPath);
const oldToolsHead = '<div className="sheet-head"><button onClick={onClose}>‹</button><div>Log Tools</div><span></span></div>';
const newToolsHead = '<div className="sheet-head"><button onClick={onClose}>‹</button><div>Log Tools · v{CURRENT_APP_VERSION}</div><span></span></div>';
if (!tools.includes(newToolsHead)) {
  if (!tools.includes(oldToolsHead)) throw new Error('v109.5.2 ToolsSheet header marker missing');
  tools = tools.replace(oldToolsHead, newToolsHead);
}
write(toolsPath, tools);

writeJson('package.json', pkg => {
  pkg.version = VERSION;
  pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
});

if (fs.existsSync('package-lock.json')) {
  writeJson('package-lock.json', lock => {
    lock.version = VERSION;
    if (lock.packages?.['']) {
      lock.packages[''].version = VERSION;
      lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
    }
  });
}

const releasedAt = new Date().toISOString();
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:BUILD,
  releasedAt,
  updatedAt:releasedAt,
  label:'v109.5.2 Visible App Version',
  force:true,
  notes:[
    'Shows the running app version directly under Road Ready on the Home screen.',
    'Shows the version in the Log Tools header and update card.',
    'Keeps the v109.5.1 multi-reason inspection root fix unchanged.'
  ]
}, null, 2)}\n`);

const swPath = 'public/sw.js';
let sw = read(swPath);
sw = sw.replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`);
sw = sw.replace(/const OWNER_OP_SW_BUILD = '[^']+';/, `const OWNER_OP_SW_BUILD = '${BUILD}';`);
write(swPath, sw);

const updatePath = 'source/src/core/update/appUpdate.js';
let update = read(updatePath);
update = update.replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`);
update = update.replace(/const FALLBACK_APP_BUILD = '[^']+';/, `const FALLBACK_APP_BUILD = '${BUILD}';`);
write(updatePath, update);

const verifyPath = 'scripts/verify-v10943-auto-upright.mjs';
let verify = read(verifyPath);
verify = verify.replace(/assert\.equal\(release\.version, '[^']+'\);/, `assert.equal(release.version, '${VERSION}');`);
verify = verify.replace(/assert\.equal\(release\.build, '[^']+'\);/, `assert.equal(release.build, '${BUILD}');`);
verify = verify.replace(/assert\.equal\(packageJson\.version, '[^']+'\);/, `assert.equal(packageJson.version, '${VERSION}');`);
write(verifyPath, verify);

if (!home.includes('App v{CURRENT_APP_VERSION}')) throw new Error('v109.5.2 Home version label missing');
if (!tools.includes('Log Tools · v{CURRENT_APP_VERSION}')) throw new Error('v109.5.2 Tools version label missing');

console.log('PASS — v109.5.2 app version is visible on Home and Log Tools');
