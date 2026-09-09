import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='source/src/modules/scan/', assets='scripts/v11036/';
const read=p=>fs.readFileSync(p,'utf8');
function patch(path,before,after){let s=read(path);if(s.includes(after))return;assert.equal(s.split(before).length-1,1,`110.3.6 anchor: ${path}: ${before.slice(0,90)}`);fs.writeFileSync(path,s.replace(before,after));}
for(const name of ['DocumentQualityV11036.js','CameraAdapterV3.jsx'])fs.copyFileSync(assets+name,root+'v3/'+name);
for(const name of ['DocumentEvidenceV11036.js','ScanEvidenceReviewV11036.jsx','webOcr.js'])fs.copyFileSync(assets+name,root+name);
const engine=root+'v3/ScannerEngineV3.js';
patch(engine,"import { detectDocumentEdgesV3 }", "import { assessDocumentQuality, normalizePaperLighting } from './DocumentQualityV11036.js';\nimport { detectDocumentEdgesV3 }");
patch(engine,"    options.onStatus?.('Recovering the physical page ratio…');", "    const inputQualityV11036 = assessDocumentQuality(finalSource, {corners});\n    options.onStatus?.('Recovering the physical page ratio…');");
patch(engine,"let displayFixed = autoFixDocumentV1093(corrected, {}, { profile:'display' });","const documentQualityV11036 = inputQualityV11036;\n    let displayFixed = { display:normalizePaperLighting(corrected), metadata:{method:'local-paper-illumination-v11036',coloredInkPreserved:true} };");
patch(engine,'        originalPreserved:true,','        originalPreserved:true,\n        documentQualityV11036,');
const review=root+'v3/ReviewScreenV3.jsx';
patch(review,"import { clampV3", "import { assessDocumentQuality } from './DocumentQualityV11036.js';\nimport { clampV3");
patch(review,'  const confidence = Math.round(Number(session.detection?.confidence || 0) * 100);','  const quality = useMemo(() => assessDocumentQuality(session.workingImage, {corners}), [session.workingImage, corners]);');
patch(review,'Detection {confidence}% · 4 corner frame · Fast quality · build 109.5.6',"{quality.issues[0] || 'Match the four corners to the full paper edge'}");
const sheet=root+'SmartScanSheetV105.jsx';
patch(sheet,"import React, { useMemo, useState } from 'react';","import React, { useEffect, useMemo, useRef, useState } from 'react';");
patch(sheet,"  const [file, setFile] = useState(null);","  const scanGenerationV11036 = useRef(0);\n  useEffect(() => () => { scanGenerationV11036.current++; }, []);\n  const [file, setFile] = useState(null);");
patch(sheet,'  function reset() {','  function reset() {\n    scanGenerationV11036.current++;');
patch(sheet,"  async function chooseFile(nextFile, preferredType = 'auto', scanMeta = {}) {\n    if (!nextFile) return;","  async function chooseFile(nextFile, preferredType = 'auto', scanMeta = {}) {\n    if (!nextFile) return;\n    const scanGeneration = ++scanGenerationV11036.current;");
patch(sheet,'          setProgress(value);','          if (scanGeneration !== scanGenerationV11036.current) return;\n          setProgress(value);');
patch(sheet,"      const rateConFileNameV10964 = nextFile.name", "      if (scanGeneration !== scanGenerationV11036.current) return;\n      const rateConFileNameV10964 = nextFile.name");
patch(sheet,"      const fallbackType = requestedType !== 'auto' ? requestedType : 'other';","      if (scanGeneration !== scanGenerationV11036.current) return;\n      const fallbackType = requestedType !== 'auto' ? requestedType : 'other';");
patch(sheet,"import { applyLiveBolContextV11035 } from './liveBolContextV11035.js';","import { qualifyScanResultV11036 } from './DocumentEvidenceV11036.js';\nimport ScanEvidenceReviewV11036 from './ScanEvidenceReviewV11036.jsx';");
patch(sheet,'    result = applyLiveBolContextV11035(result, state);','    result = qualifyScanResultV11036(result, state);');
patch(sheet,'    applyResult(result);\n  }\n\n  function chooseLoad','    applyResult({...result, userSelectedTypeV11036:typeId});\n  }\n\n  function chooseLoad');
patch(sheet,'          <button type="button" onClick={() => setDetailsOpen(value => !value)}>', '          <ScanEvidenceReviewV11036 analysis={analysis} />\n          <button type="button" onClick={() => setDetailsOpen(value => !value)}>');
// Reuse distinct preserved OCR/color layers; do not repeatedly filter a JPEG.
const reader=root+'smartDocumentReaderV1030.js';
patch(reader,"  const variants = await buildOcrVariantsV1030(file, {\n    onStatus:text => onProgress(pageStart + pageSpan * .08, text),\n  });",`  const prepared = options.preparedAssets || [];
  const preparedFiles = [
    ['normalized','clean-ocr'], ['adaptive','high-contrast-ocr'], ['color','perspective-corrected']
  ].map(([id,kind]) => ({id,file:prepared.find(asset=>asset.kind===kind)?.file})).filter(item=>item.file);
  const variants = preparedFiles.length === 3 ? preparedFiles : await buildOcrVariantsV1030(file, {
    onStatus:text => onProgress(pageStart + pageSpan * .08, text),
  });`);
patch(reader,"    pageSegMode:'6',\n    progressStart:pageStart + pageSpan * .10,","    pageSegMode:'3',\n    progressStart:pageStart + pageSpan * .10,");
patch(reader,'        progressStart:pageAreaStart + index * perPage,','        preparedAssets:sourcePages.length === 1 ? options.scanMeta?.captureAssets : [],\n        progressStart:pageAreaStart + index * perPage,');
const VERSION='110.3.6', BUILD='v110306-smart-document-capture';
// The final-runtime regression must verify the release being shipped.
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.2');assert.equal(meta.build,'v110302-status-midnight-carry');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
for(const path of ['package.json','package-lock.json']){const json=JSON.parse(read(path));json.version=VERSION;if(json.packages?.[''])json.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(json,null,2)+'\n');}
for(const path of ['release-version.json','public/app-version.json']){const json=JSON.parse(read(path));Object.assign(json,{version:VERSION,build:BUILD,force:false,label:'v110.3.6 Smart Document Capture',notes:['Stable auto capture, still-photo support and sharp-frame selection.','Paper shadow normalization and readable-image checks.','Document evidence review, separate load suggestions and signature verification.','Bounded, cached OCR and reuse of preserved scan layers.']});fs.writeFileSync(path,JSON.stringify(json,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){let s=read(path);s=s.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);fs.writeFileSync(path,s);}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,`App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g,`APP V${VERSION}`));
console.log('PASS — smart scanner 110.3.6 installed; original files and Logbook stay isolated');
