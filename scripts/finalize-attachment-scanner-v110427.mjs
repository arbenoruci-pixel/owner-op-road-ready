import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8');
const scan='source/src/modules/scan/';
let intake=read(scan+'ScanIntakeV110328.jsx');
function replace(before,after){assert.equal(intake.split(before).length-1,1,'Direct scanner anchor: '+before.slice(0,100));intake=intake.replace(before,after);}
replace('({onReady,onClose,initialDraft})','({onReady,onClose,initialDraft,documentLabel="Document",loadNo=""})');
replace('<span>ROAD READY</span><b>Smart Scan</b>','<span>Load {loadNo}</span><b>Add {documentLabel}</b>');
replace('<h1>A clear scan.<br/>An easier day.</h1>','<h1>Add your {documentLabel}</h1>');
replace('Capture a document or choose your files.<br/>Check the pages before we read them.','Scan the paper or choose a photo.<br/>Adjust the edges, then save.');
replace('Keep every corner visible. Include all pages of the same BOL, POD, receipt or rate confirmation.','Keep every corner and signature visible. These pages will be saved to load {loadNo} as {documentLabel}.');
replace('async function readDocument()','async function saveDocument()');
intake=intake.replaceAll('onClick={readDocument}','onClick={saveDocument}');
intake=intake.replaceAll('onReady?.(', 'await onReady?.(');
intake=intake.replaceAll('Read & review','Adjust').replaceAll('Read document', 'Save document');
replace("'Save document'", "'Save ' + documentLabel");
intake=intake.replaceAll('Choose a file','Choose PDF').replaceAll('PDF, photo, TXT or CSV','Keep the original PDF');
intake=intake.replaceAll('accept={FILE_ACCEPT}','accept="application/pdf,.pdf"');
intake=intake.replaceAll('Ready to read','Ready to save').replaceAll('You can still read the original file.','You can still save the original file.');
intake=intake.replaceAll('Review the details before saving.','Saved as {documentLabel} to load {loadNo}.');
intake=intake.replaceAll('function close(){generation.current++;onClose?.();}', 'function close(){if(busyRef.current)return;if(pages.length&&!window.confirm("Discard these unsaved pages?"))return;generation.current++;onClose?.();}');
replace('if(!selection.length||busyRef.current)return;', 'if(!selection.length||busyRef.current)return;\n    if(selection.some(file=>!(file.type?.startsWith("image/")||file.type==="application/pdf"||/\\.(pdf|heic|heif|jpe?g|png|webp)$/i.test(file.name)))){setError("Choose a photo or PDF.");return;}');
// This is only the page intake. It never mounts SmartScanSheet or an AI/OCR reader.
assert.ok(!/readSmartDocument|runOwnedReader|readPdfText\(|getTextContent\(|readImage|fetch\(/.test(intake),'Unexpected interpretation in attachment intake');
fs.writeFileSync(scan+'AttachmentIntakeV110427.jsx',intake);
fs.copyFileSync('scripts/v110427/LoadAttachmentSheet.jsx',scan+'LoadAttachmentSheetV110426.jsx');
fs.copyFileSync('scripts/v110427/attachmentCapture.js',scan+'attachmentCaptureV110427.js');
const context=scan+'attachmentContextV110426.js';
fs.writeFileSync(context,read(context).replace('  writeStore(upsertRecord(readStore(), record, state));','  await writeStore(upsertRecord(readStore(), record, state));'));
const css='source/src/command-center.css',styles=read('scripts/v110427/attachment.css');
if(!read(css).includes('.attachment-ios-v427{'))fs.appendFileSync(css,'\n'+styles+'\n');
const VERSION='110.4.27',BUILD='v110427-direct-document-scanner';
for(const p of ['release-version.json','public/app-version.json']){const v=JSON.parse(read(p));Object.assign(v,{version:VERSION,build:BUILD,force:false,label:'v110.4.27 Scan and save BOL/POD',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Capture, crop, rotate and improve BOL/POD photos without AI reading.','Save the selected document type directly to its load.','Readable iPhone-style document capture and page review.']});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const p of ['package.json','package-lock.json']){const v=JSON.parse(read(p));v.version=VERSION;if(v.packages?.[''])v.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');}
for(const[p,name]of[['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(p);for(const[key,value]of[['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(p,s);}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
for(const p of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs'])fs.writeFileSync(p,read(p).replaceAll("'110.4.26'","'"+VERSION+"'").replaceAll("'v110426-direct-load-attachments'","'"+BUILD+"'"));
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
// Preview-build review of the existing original-asset storage contract.
const storage=read(scan+'quotaSafeScanStorageV10963.js');
const contract=storage.indexOf('export async function saveScannedDocument');
console.log('ATTACHMENT_STORAGE_CONTRACT',storage.slice(Math.max(0,contract),Math.max(0,contract)+10000));
const tests=spawnSync(process.execPath,['scripts/v110427/attachment-scanner.test.mjs'],{stdio:'inherit'});
if(tests.error)throw tests.error;assert.equal(tests.status,0,'Direct scanner regression tests');
console.log('PASS — direct BOL/POD camera, crop, quality, page order, and capture-only saving installed (110.4.27)');
