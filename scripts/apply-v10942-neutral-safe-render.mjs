import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const VERSION='109.4.2';
const BUILD='v10942-neutral-safe-layered-render';
const RELEASED_AT=new Date().toISOString();
const file=r=>path.join(ROOT,r);
const read=r=>fs.readFileSync(file(r),'utf8');
const write=(r,c)=>{const t=file(r);fs.mkdirSync(path.dirname(t),{recursive:true});fs.writeFileSync(t,c);};
function replaceRequired(source,pattern,replacement,label){
 if(typeof pattern==='string'){
  if(source.includes(replacement)) return source;
  if(!source.includes(pattern)) throw new Error(`v109.4.2 missing ${label}`);
  return source.replace(pattern,replacement);
 }
 if(pattern.test(source)) return source.replace(pattern,replacement);
 if(source.includes(replacement)) return source;
 throw new Error(`v109.4.2 missing ${label}`);
}

const qualityPath='source/src/modules/scan/v3/AutoQualityBotV1093.js';
let quality=read(qualityPath);
quality=replaceRequired(quality,'smoothstep(6, 30, chroma) * Math.max(','smoothstep(14, 46, chroma) * Math.max(','stronger colored-ink chroma gate');
quality=replaceRequired(quality,'smoothstep(.3, 5.5, localDepth),','smoothstep(1.0, 7.5, localDepth),','stronger colored local-depth gate');
quality=replaceRequired(quality,'smoothstep(1.2, 15, broadDepth),','smoothstep(3.5, 22, broadDepth),','stronger colored broad-depth gate');
quality=replaceRequired(quality,'const normalizedPaperY = range(outputPaper + (246 - outputPaper) * .38, 8, 250);','const normalizedPaperY = range(outputPaper + (244 - outputPaper) * .20, 8, 248);','safer paper normalization');
quality=replaceRequired(quality,'const paperTargetY = fy + (normalizedPaperY - fy) * paperConfidence * .76;','const paperTargetY = fy + (normalizedPaperY - fy) * paperConfidence * .44;','reduced paper pass strength');
quality=replaceRequired(quality,'const sharpenDepth = Math.min(24, edgeDepth * (.72 + mask * .46));','const sharpenDepth = Math.min(12, edgeDepth * (.42 + mask * .28));','safer edge sharpening');
quality=replaceRequired(quality,'const sourceMix = range(.22 + color * .46, 0, .68);','const sourceMix = range(.10 + color * .28, 0, .38);','reduced color overlay');
quality=replaceRequired(quality,'const neutralBlend = .82 * mask;','const neutralBlend = .94 * mask;','stronger neutral text channels');
quality=replaceRequired(quality,"engine:'road-ready-auto-quality-bot-v10941'","engine:'road-ready-auto-quality-bot-v10942'",'quality engine');
quality=replaceRequired(quality,"qualityProfile:'layered-single-fidelity-pass-v10941'","qualityProfile:'neutral-safe-layered-render-v10942'",'quality profile');
quality=replaceRequired(quality,'duplicateFidelityPassRemoved:true,',`duplicateFidelityPassRemoved:true,\n      neutralPaperGuard:true,\n      blueCastGuard:true,\n      posterizationGuard:true,\n      conservativeEdgeSharpen:true,`,'safe render metadata');
write(qualityPath,quality);

for(const [target,pattern,replacement] of [
 ['source/src/modules/scan/v3/scannerTypesV3.js',/export const ROAD_READY_SCANNER_V3_VERSION = '[^']+';/,`export const ROAD_READY_SCANNER_V3_VERSION = '${VERSION}';`],
 ['source/src/modules/scan/scannerContractsV106.js',/export const ROAD_READY_SCANNER_VERSION_V106 = '[^']+';/,`export const ROAD_READY_SCANNER_VERSION_V106 = '${VERSION}';`],
]) write(target,replaceRequired(read(target),pattern,replacement,target));
const scanSheet='source/src/modules/scan/SmartScanSheetV105.jsx';
write(scanSheet,replaceRequired(read(scanSheet),/scannerVersion:analysis\?\.scanMeta\?\.scannerVersion \|\| '[^']+'/,`scannerVersion:analysis?.scanMeta?.scannerVersion || '${VERSION}'`,'scan version'));
const uiPath='source/src/modules/scan/v3/RoadReadyScannerV3.jsx';let ui=read(uiPath);ui=replaceRequired(ui,/Road Ready Scanner 0\.5\.[0-9]+/,'Road Ready Scanner 0.5.2','scanner label');ui=replaceRequired(ui,/· App 109\.[0-9]+\.[0-9]+/,`· App ${VERSION}`,'app label');write(uiPath,ui);
const reviewPath='source/src/modules/scan/v3/ReviewScreenV3.jsx';write(reviewPath,replaceRequired(read(reviewPath),/Layered single-pass · build 109\.[0-9]+\.[0-9]+/,`Neutral safe · build ${VERSION}`,'review marker'));
const updatePath='source/src/core/update/appUpdate.js';let update=read(updatePath);update=replaceRequired(update,/const FALLBACK_APP_VERSION = '[^']+';/,`const FALLBACK_APP_VERSION = '${VERSION}';`,'fallback version');update=replaceRequired(update,/const FALLBACK_APP_BUILD = '[^']+';/,`const FALLBACK_APP_BUILD = '${BUILD}';`,'fallback build');write(updatePath,update);
const banner='source/src/modules/update/UpdateBanner.jsx';write(banner,replaceRequired(read(banner),/data-owner-op-update-banner="[^"]+"/,`data-owner-op-update-banner="${VERSION}"`,'banner'));
const boot='public/update.html';let bootText=read(boot);bootText=replaceRequired(bootText,/const version = params\.get\('version'\) \|\| '[^']+';/,`const version = params.get('version') || '${VERSION}';`,'update version');bootText=replaceRequired(bootText,/const build = params\.get\('build'\) \|\| '[^']+';/,`const build = params.get('build') || '${BUILD}';`,'update build');write(boot,bootText);
const sw='public/sw.js';let swText=read(sw);swText=replaceRequired(swText,/const OWNER_OP_SW_VERSION = '[^']+';/,`const OWNER_OP_SW_VERSION = '${VERSION}';`,'sw version');swText=replaceRequired(swText,/const OWNER_OP_SW_BUILD = '[^']+';/,`const OWNER_OP_SW_BUILD = '${BUILD}';`,'sw build');write(sw,swText);
const pkg=JSON.parse(read('package.json'));pkg.version=VERSION;pkg.engines={...(pkg.engines||{}),node:'24.x'};write('package.json',`${JSON.stringify(pkg,null,2)}\n`);
const lock=JSON.parse(read('package-lock.json'));lock.version=VERSION;if(lock.packages?.['']){lock.packages[''].version=VERSION;lock.packages[''].engines={...(lock.packages[''].engines||{}),node:'24.x'};}write('package-lock.json',`${JSON.stringify(lock,null,2)}\n`);
write('public/app-version.json',`${JSON.stringify({version:VERSION,build:BUILD,releasedAt:RELEASED_AT,updatedAt:RELEASED_AT,label:'v109.4.2 Neutral Safe Scanner 0.5.2',force:true,notes:['Corrects the excessive blue cast and posterized shadow patches visible on blue-printed documents.','Reduces paper whitening and edge sharpening to a conservative source-safe level.','Requires stronger source evidence before restoring colored ink, preventing broad blue contamination from paper shadows.','Keeps one final Fidelity Lock, four-corner geometry, immutable original, OCR and display-final storage unchanged.']},null,2)}\n`);
const manifest=JSON.parse(read('public/scanner-engine.json'));Object.assign(manifest,{version:VERSION,name:'Road Ready Scanner 0.5.2',qualityBot:'road-ready-auto-quality-bot-v10942',qualityProfile:'neutral-safe-layered-render-v10942',neutralPaperGuard:true,blueCastGuard:true,posterizationGuard:true,conservativeEdgeSharpen:true,updateBootstrap:BUILD,visibleBuildMarker:VERSION});write('public/scanner-engine.json',`${JSON.stringify(manifest,null,2)}\n`);
console.log('PASS — v109.4.2 neutral safe layered renderer applied');
