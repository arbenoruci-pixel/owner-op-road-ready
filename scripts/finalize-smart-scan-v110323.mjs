import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(file,'utf8');
function patch(file,before,after){const s=read(file);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,'Smart Scan anchor: '+file);fs.writeFileSync(file,s.replace(before,after));}
const scan='source/src/modules/scan/';
for(const name of ['paperQuality','imageReader','fieldEvidence','routeMatch'])fs.copyFileSync('scripts/v110323/'+name+'.js',scan+name+'V110323.js');
function addImport(file,statement){const s=read(file).replace(statement+'\n','');fs.writeFileSync(file,s.startsWith("'use client';\n")?s.replace("'use client';\n","'use client';\n"+statement+'\n'):statement+'\n'+s);}
const quality=scan+'v3/DocumentQualityV11036.js';
addImport(quality,"import {normalizePaperV110323} from '../paperQualityV110323.js';");
patch(quality,'export function normalizePaperLighting(image) {','export function normalizePaperLighting(image) { return normalizePaperV110323(image); }\nfunction normalizePaperLightingLegacyV11036(image) {');
const image=scan+'v3/imageUtilsV3.js';
if(!read(image).includes("const mimeType ="))patch(image,"const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));\n  if (!blob) throw scannerErrorV3('jpeg_export_failed'","const mimeType = name.endsWith('.png') ? 'image/png' : 'image/jpeg';\n  const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));\n  if (!blob) throw scannerErrorV3('jpeg_export_failed'");
patch(image,"return new File([blob], name, { type:'image/jpeg', lastModified:Date.now() });\n}\n\nexport async function canvasToFileV3","return new File([blob], name, { type:mimeType, lastModified:Date.now() });\n}\n\nexport async function canvasToFileV3");
if(!read(image).includes("let exportCanvas ="))patch(image,"  const mimeType = name.endsWith('.png') ? 'image/png' : 'image/jpeg';",`  let exportCanvas = canvas;
  if(name.endsWith('-ocr.png') && Math.max(image.width,image.height)<2200){
    const scale=Math.min(2,3000/Math.max(image.width,image.height));
    exportCanvas=createCanvas(Math.round(image.width*scale),Math.round(image.height*scale));
    const up=exportCanvas.getContext('2d',{alpha:false});up.imageSmoothingEnabled=true;up.imageSmoothingQuality='high';up.drawImage(canvas,0,0,exportCanvas.width,exportCanvas.height);
  }
  const mimeType = name.endsWith('.png') ? 'image/png' : 'image/jpeg';`);
patch(image,"canvas.toBlob(resolve, mimeType, quality)","exportCanvas.toBlob(resolve, mimeType, quality)");
const engine=scan+'v3/ScannerEngineV3.js';
addImport(engine,"import {grayscalePaperV110323} from '../paperQualityV110323.js';");
patch(engine,'this.maxOcrDimension = options.maxOcrDimension || 1800;','this.maxOcrDimension = options.maxOcrDimension || 3000;');
let source=read(engine),start=source.indexOf('    const restored = restoreDocumentV3(ocrSource);'),end=source.indexOf('    const cleanFile =',start);
if(start>=0){assert.ok(end>start);source=source.slice(0,start)+`    const normalizedOcr = normalizePaperLighting(ocrSource);
    const restored = {color:normalizedOcr,metadata:{method:'paper-detail-v110323'}};
    const ocrFixed = {clean:grayscalePaperV110323(normalizedOcr),metadata:{method:'lossless-grayscale-v110323'}};
    ocrFixed.highContrast = ocrFixed.clean;
    const ocr = {selected:{name:'grayscale'},ranked:[]};

`+source.slice(end);fs.writeFileSync(engine,source);}
patch(engine,"'road-ready-clean-ocr.jpg'","'road-ready-clean-ocr.png'");
source=read(engine);start=source.indexOf('    const highContrastFile = await imageDataToFileV3(');end=source.indexOf('    const byName =',start);
if(start>=0){assert.ok(end>start);fs.writeFileSync(engine,source.slice(0,start)+'    const highContrastFile = cleanFile;\n'+source.slice(end));}
patch(engine,"filter:'clean-ocr-v10934'","filter:'paper-detail-v110323'");
const reader=scan+'smartDocumentReaderV1030.js';
addImport(reader,"import {readImageDocumentV110323} from './imageReaderV110323.js';");
patch(reader,'export async function analyzeSmartDocumentV1030(file, options = {}) {',"export async function analyzeSmartDocumentV1030(file, options = {}) {\n  if(String(file?.type||'').startsWith('image/'))return readImageDocumentV110323(file,options);");
const semantics=scan+'documentFieldSemanticsV11038.js';
addImport(semantics,"import {qualifyFieldEvidenceV110323} from './fieldEvidenceV110323.js';");
patch(semantics,'export function qualifyDocumentFieldsV11038(result={}) {','export function qualifyDocumentFieldsV11038(result={}) { return qualifyFieldEvidenceV110323(result,qualifyDocumentFieldsBaseV11038); }\nfunction qualifyDocumentFieldsBaseV11038(result={}) {');
const matching=scan+'scanLoadAssignmentV11037.js';
addImport(matching,"import {matchDocumentRouteV110323} from './routeMatchV110323.js';");
patch(matching,"  const chosen = proofs.length === 1 ? proofs[0] : null;","  const route = proofs.length === 0 ? matchDocumentRouteV110323(options,collectLoadCandidatesV105(options.state,options.businessStore),base.candidates) : null;\n  if(route)return {...base,...route};\n  const chosen = proofs.length === 1 ? proofs[0] : null;");
patch(matching,"${token}([^A-Z0-9]|$)","${token.split('').join('[ \\t._/-]*')}([^A-Z0-9]|$)");
const ui=scan+'SmartScanSheetV105.jsx';
addImport(ui,"import {scanDateNoticeV110323} from './routeMatchV110323.js';");
patch(ui,"safeSelectedLoadV11034 ? 'document_reference' : 'unassigned'","safeSelectedLoadV11034 ? (nextMatch.source || 'document_reference') : 'unassigned'");
patch(ui,"            {!documentDate ? <em>Reader did not verify the date.</em>","            {scanDateNoticeV110323(documentDate,selectedLoadNo,candidates) ? <em role=\"status\">{scanDateNoticeV110323(documentDate,selectedLoadNo,candidates)}</em> : null}\n            {!documentDate ? <em>Reader did not verify the date.</em>");
const homeLogic='source/src/modules/home/adaptiveHomeLogicV1038.js';
patch(homeLogic,"  const currentStop = currentSequence > 0 ? deliveryStops[currentSequence - 1] || null : null;","  const stepAtPickup = currentStep && (['before_pickup','pickup'].includes(currentStep.phase) || ['route_pickup','pickup_bol','pickup_ready'].includes(currentStep.id));\n  const stepSequence = Number(currentStep?.stopSequence || currentSequence || 0);\n  const currentStop = stepAtPickup ? (guide?.stops || []).find(s=>s.type==='pickup') || null : stepSequence > 0 ? deliveryStops[stepSequence - 1] || null : null;");
patch(homeLogic,'    currentStop,\n    nextSteps,','    currentStop,\n    bolPresent:Boolean(progress.bol),\n    nextSteps,');
const home='source/src/modules/home/AdaptiveHomeV1038.jsx';
patch(home,'!activeLoad?.documentSummary?.bolPresent','!(snapshot.bolPresent || activeLoad?.documentSummary?.bolPresent)');
const css='source/src/command-center.css',rule='\n.adaptive-home-v1038 .adaptive-upcoming-v1038 p b{color:#17213a;-webkit-text-fill-color:#17213a}\n';
if(!read(css).includes(rule))fs.appendFileSync(css,rule);
const VERSION='110.3.23',BUILD='v110323-paper-detail-smart-scan';
for(const file of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(file));Object.assign(d,{version:VERSION,build:BUILD,force:false,label:'v110.3.23 Clearer scans and stronger document reading',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Full-detail paper lighting correction and lossless OCR images.','Independent OCR readings preserve table labels, dates and shipping references.','Load matching uses typed references or a unique verified route and date.']});fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const file of ['package.json','package-lock.json']){const d=JSON.parse(read(file));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');}
for(const [file,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(file);for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])s=s.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`),`const ${name}_${key} = '${value}';`);fs.writeFileSync(file,s);}
for(const file of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(file,read(file).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.22');assert.equal(meta.build,'v110322-load-guide-without-logbook');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — high-detail paper scanner and independent document evidence installed');
