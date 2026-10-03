import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8');
function patch(p,before,after) {const text=read(p);if(text.includes(after))return;assert.equal(text.split(before).length-1,1,'Full-page anchor: '+p+' '+before.slice(0,60));fs.writeFileSync(p,text.replace(before,after));}
const scan='source/src/modules/scan/';
fs.copyFileSync('scripts/v110428/safeDocumentBoundary.js',scan+'v3/safeDocumentBoundaryV110428.js');
patch(scan+'v3/EdgeDetectorV3.js',"export {detectDocumentBoundary as detectDocumentEdgesV3} from './documentBoundaryV110329.js';","export {detectSafeDocumentBoundary as detectDocumentEdgesV3} from './safeDocumentBoundaryV110428.js';");
patch(scan+'v3/ReviewScreenV3.jsx',`const DEFAULT_CORNERS = Object.freeze([
  { x:.08, y:.08 },
  { x:.92, y:.08 },
  { x:.92, y:.92 },
  { x:.08, y:.92 },
]);`,'const DEFAULT_CORNERS = FULL_PAGE;');
const intake=scan+'AttachmentIntakeV110427.jsx';
patch(intake,'Adjust the edges, then save.','Pages are prepared automatically.');
patch(intake,'<h1>Check your pages</h1>','<h1>Ready to save</h1>');
patch(intake,'<span>Tap to enlarge</span>','<span>Ready to save · Tap to enlarge</span>');
patch(intake,'<ol className={`scan-page-list-v328','{pages.length>1&&<ol className={`scan-page-list-v328');
patch(intake,'</li>)}</ol>','</li>)}</ol>}');
// Give the photo the available display area while preserving its entire aspect
// ratio. One-page captures do not need a duplicate thumbnail strip.
const css='source/src/command-center.css';
const style=`\n/* FULL_PAGE_PREVIEW_V110428 */
.attachment-ios-v427 .scan-review-v333>main{padding:8px 12px 0!important}
.attachment-ios-v427 .scan-review-v333 .scan-paper-preview-v328{padding:2px!important;border-radius:10px!important}
.attachment-ios-v427 .scan-review-v333 .scan-paper-preview-v328 img{max-height:none!important;object-fit:contain!important}
.attachment-ios-v427 .scan-review-v333 .scan-page-tools-v328{margin:6px 0!important;gap:6px!important}
.attachment-ios-v427 .scan-review-v333 .scan-page-tools-v328 button{font-size:13px!important;min-height:48px!important;padding:8px!important}
.attachment-ios-v427 .scan-review-v333 .scan-add-actions-v328{margin:6px 0!important}
.attachment-ios-v427 .scan-review-v333 .scan-intake-footer-v328{padding:10px 12px max(12px,env(safe-area-inset-bottom))!important}
`;
if(!read(css).includes('FULL_PAGE_PREVIEW_V110428'))fs.appendFileSync(css,style);
const browser='scripts/v110427/browser.mjs',hook="\nawait import('../v110428/browser.mjs');\n";
if(!read(browser).includes(hook))fs.appendFileSync(browser,hook);
const tests=spawnSync(process.execPath,['scripts/v110428/boundary.test.mjs'],{stdio:'inherit'});
if(tests.error)throw tests.error;assert.equal(tests.status,0,'Full-page detection regressions');
const VERSION='110.4.28',BUILD='v110428-full-page-scanner';
for(const p of ['release-version.json','public/app-version.json']) {
 const value=JSON.parse(read(p));Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.4.28 Automatic full-page capture',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Keep already framed document photos complete, including headers and signatures.','Reject internal table rules as automatic paper boundaries.','Larger full-page preview; manual crop remains optional.']});fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n');
}
for(const p of ['package.json','package-lock.json']) {const value=JSON.parse(read(p));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n');}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
 let text=read(p);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])text=text.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,text);
}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.27'","'"+VERSION+"'").replaceAll("'v110427-direct-document-scanner'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — v110.4.28 complete-page protection installed; no saved documents or duty records migrated');

await import('./finalize-portable-backup-v110429.mjs');
