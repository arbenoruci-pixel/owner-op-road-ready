import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '109.4.1';
const BUILD = 'v10941-layered-single-fidelity-pass';
const RELEASED_AT = new Date().toISOString();
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
const write = (relative, content) => { const target=file(relative); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,content); };
function replaceRequired(source, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (source.includes(replacement)) return source;
    if (!source.includes(pattern)) throw new Error(`v109.4.1 missing ${label}`);
    return source.replace(pattern, replacement);
  }
  if (pattern.test(source)) return source.replace(pattern, replacement);
  if (source.includes(replacement)) return source;
  throw new Error(`v109.4.1 missing ${label}`);
}

const qualityPath='source/src/modules/scan/v3/AutoQualityBotV1093.js';
let quality=read(qualityPath);
quality=replaceRequired(
  quality,
  '  return applyDocumentFidelityLock({ width, height, data }, source, metrics);',
  '  return { width, height, data };',
  'remove duplicate fidelity pass inside layered renderer',
);
quality=replaceRequired(
  quality,
  `  const fidelityDisplay = composeLayeredDocumentRender(\n    applyDocumentFidelityLock(enhancedDisplay, source, metrics),\n    source,\n    metrics,\n  );`,
  `  const layeredDisplay = composeLayeredDocumentRender(\n    enhancedDisplay,\n    source,\n    metrics,\n  );\n  const fidelityDisplay = applyDocumentFidelityLock(layeredDisplay, source, metrics);`,
  'single final fidelity pass ordering',
);
quality=replaceRequired(quality,"engine:'road-ready-auto-quality-bot-v10940'","engine:'road-ready-auto-quality-bot-v10941'",'quality engine');
quality=replaceRequired(quality,"qualityProfile:'layered-paper-text-fusion-v10940'","qualityProfile:'layered-single-fidelity-pass-v10941'",'quality profile');
quality=replaceRequired(quality,'handwritingLayerPreserved:true,',`handwritingLayerPreserved:true,\n      singleFinalFidelityPass:true,\n      duplicateFidelityPassRemoved:true,`,'single-pass metadata');
write(qualityPath,quality);

for (const [target,pattern,replacement] of [
 ['source/src/modules/scan/v3/scannerTypesV3.js',/export const ROAD_READY_SCANNER_V3_VERSION = '[^']+';/,`export const ROAD_READY_SCANNER_V3_VERSION = '${VERSION}';`],
 ['source/src/modules/scan/scannerContractsV106.js',/export const ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/,`export const ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`],
]) write(target,replaceRequired(read(target),pattern,replacement,target));

const scanSheet='source/src/modules/scan/SmartScanSheetV105.jsx';
write(scanSheet,replaceRequired(read(scanSheet),/scannerVersion:analysis\?\.scanMeta\?\.scannerVersion \|\| '[^']+'/,`scannerVersion:analysis?.scanMeta?.scannerVersion || '${VERSION}'`,'scan version'));
const uiPath='source/src/modules/scan/v3/RoadReadyScannerV3.jsx';
let ui=read(uiPath); ui=replaceRequired(ui,/Road Ready Scanner 0\.5\.[0-9]+/,'Road Ready Scanner 0.5.1','scanner label'); ui=replaceRequired(ui,/· App 109\.[0-9]+\.[0-9]+/,`· App ${VERSION}`,'app label'); write(uiPath,ui);
const reviewPath='source/src/modules/scan/v3/ReviewScreenV3.jsx';
write(reviewPath,replaceRequired(read(reviewPath),/Layered render · build 109\.[0-9]+\.[0-9]+/,`Layered single-pass · build ${VERSION}`,'review marker'));
const updatePath='source/src/core/update/appUpdate.js'; let update=read(updatePath); update=replaceRequired(update,/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`,'fallback version'); update=replaceRequired(update,/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`,'fallback build'); write(updatePath,update);
const banner='source/src/modules/update/UpdateBanner.jsx'; write(banner,replaceRequired(read(banner),/data-owner-op-update-banner="[^"]+"/,`data-owner-op-update-banner="${VERSION}"`,'banner'));
const boot='public/update.html'; let bootText=read(boot); bootText=replaceRequired(bootText,/const version = params\.get\('version'\) \|\| '[^']+';/,`const version = params.get('version') || '${VERSION}';`,'update version'); bootText=replaceRequired(bootText,/const build = params\.get\('build'\) \|\| '[^']+';/,`const build = params.get('build') || '${BUILD}';`,'update build'); write(boot,bootText);
const sw='public/sw.js'; let swText=read(sw); swText=replaceRequired(swText,/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`,'sw version'); swText=replaceRequired(swText,/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`,'sw build'); write(sw,swText);
const pkg=JSON.parse(read('package.json')); pkg.version=VERSION; pkg.engines={...(pkg.engines||{}),node:'24.x'}; write('package.json',`${JSON.stringify(pkg,null,2)}\n`);
const lock=JSON.parse(read('package-lock.json')); lock.version=VERSION; if(lock.packages?.['']){lock.packages[''].version=VERSION;lock.packages[''].engines={...(lock.packages[''].engines||{}),node:'24.x'};} write('package-lock.json',`${JSON.stringify(lock,null,2)}\n`);
write('public/app-version.json',`${JSON.stringify({version:VERSION,build:BUILD,releasedAt:RELEASED_AT,updatedAt:RELEASED_AT,label:'v109.4.1 Layered Single-Pass Scanner 0.5.1',force:true,notes:['Removes the duplicate Fidelity Lock that was cancelling the visible layered-render improvement.','Runs paper, text and handwriting enhancement first, followed by exactly one final source-anchored Fidelity Lock.','Keeps dates, amounts, VINs and handwriting topology protected without flattening the enhancement back to the prior image.','Keeps four-corner geometry, immutable original, OCR and display-final storage unchanged.']},null,2)}\n`);
const manifest=JSON.parse(read('public/scanner-engine.json')); Object.assign(manifest,{version:VERSION,name:'Road Ready Scanner 0.5.1',qualityBot:'road-ready-auto-quality-bot-v10941',qualityProfile:'layered-single-fidelity-pass-v10941',singleFinalFidelityPass:true,duplicateFidelityPassRemoved:true,updateBootstrap:BUILD,visibleBuildMarker:VERSION}); write('public/scanner-engine.json',`${JSON.stringify(manifest,null,2)}\n`);
console.log('PASS — v109.4.1 layered renderer now uses one final Fidelity Lock pass');
