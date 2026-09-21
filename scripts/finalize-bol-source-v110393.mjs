import fs from 'node:fs';
import assert from 'node:assert/strict';
const VERSION='110.3.93',BUILD='v110393-bol-source-evidence';
const read=path=>fs.readFileSync(path,'utf8');
assert.ok(['0.3.27','0.3.28','0.3.29'].includes(JSON.parse(read('packages/smart-reader-core/package.json')).version));
const sheetPath='source/src/modules/scan/SmartScanSheetV105.jsx';
let sheet=read(sheetPath);
function patch(before,after){if(sheet.includes(after))return;assert.equal(sheet.split(before).length,2,'BOL source display anchor');sheet=sheet.replace(before,after);}
patch("import {filingTypeForReview} from '../../../../packages/smart-reader-core/src/recovery.js';",
  "import {filingTypeForReview} from '../../../../packages/smart-reader-core/src/recovery.js';\nimport {scanWithSourceFields} from '../../../../packages/smart-reader-core/src/scanFields.js';");
patch("  const canSave = Boolean(file && selectedType && (!needsReview || reviewed) && !riskBlocked);",
  "  const canSave = Boolean(file && selectedType && (!needsReview || reviewed) && !riskBlocked);\n  const sourceAnalysisV110393=useMemo(()=>scanWithSourceFields(analysis,readerReviewV110345,selectedType),[analysis,readerReviewV110345,selectedType]);");
patch('<ScanEvidenceReviewV11036 analysis={analysis} />','<ScanEvidenceReviewV11036 analysis={sourceAnalysisV110393} />');
patch('<OwnedReaderPreview analysis={analysis} reviewState={readerReviewV110345} onReviewChange={acceptReaderReviewV110345} />',
  '<OwnedReaderPreview analysis={analysis} reviewState={readerReviewV110345} onReviewChange={acceptReaderReviewV110345} onReady={acceptReaderReviewV110345} />');
if(sheet.includes('extractedRows(analysis)')){assert.equal(sheet.split('extractedRows(analysis)').length,3);sheet=sheet.replaceAll('extractedRows(analysis)','extractedRows(sourceAnalysisV110393)');}
patch('        ...(analysis?.fields || {}),','        ...(sourceAnalysisV110393?.fields || {}),');
patch('      const storageFieldsV10964 = compactRateConSaveFieldsV10964(mergedFields);',
  '      const storageFieldsV10964 = compactRateConSaveFieldsV10964(mergedFields);\n      if(sourceAnalysisV110393?.fields?.readerSourceFieldsV110393)storageFieldsV10964.readerSourceFieldsV110393=sourceAnalysisV110393.fields.readerSourceFieldsV110393;');
patch('compactRateConAnalysisV10964(analysis || {}, storageFieldsV10964);','compactRateConAnalysisV10964(sourceAnalysisV110393 || {}, storageFieldsV10964);');
fs.writeFileSync(sheetPath,sheet);
const stamp=new Date().toISOString();
for(const path of ['release-version.json','public/app-version.json']){
  const value=JSON.parse(read(path));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.93 BOL source evidence',releasedAt:stamp,updatedAt:stamp,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,
    notes:['Read BOL numbers within their own numbered shipping header.',
      'Show and save the fields verified in Reader preview.',
      'Resolve corroborated company blocks, initial spacing and equipment labels.',
      'Preserve conflicting readings and require confirmation of missing weight units.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']){
  const value=JSON.parse(read(path));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name]of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let value=read(path);
  for(const [key,replacement]of [['VERSION',VERSION],['BUILD',BUILD]]){
    const pattern=new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`,'g');
    assert.equal([...value.matchAll(pattern)].length,1,path+' release marker');
    value=value.replace(pattern,`const ${name}_${key} = '${replacement}';`);
  }
  fs.writeFileSync(path,value);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){
  fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
}
for(const path of ['scripts/test-duty-graph-continuity.mjs','scripts/test-editor-grips-v110355.mjs','scripts/verify-log-integrity-v1051.mjs','scripts/test-document-continuity-integration-v110375.mjs']){
  fs.writeFileSync(path,read(path).replaceAll("'110.3.92'","'"+VERSION+"'").replaceAll("'v110392-lumper-receipt-consensus'","'"+BUILD+"'"));
}
for(const path of ['scripts/browser-native-pdf-v110363.mjs','scripts/v110373/browser-reader-evidence.mjs','scripts/v110382/browser-bol.mjs','scripts/v110384/browser-rows.mjs','scripts/browser-ratecon-structure-v110388.mjs']){
  fs.writeFileSync(path,read(path).replaceAll("'0.3.26'","'0.3.27'"));
}
const locks=JSON.parse(read('module-locks.v1.json'));locks.release=VERSION;
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — 110.3.93 BOL source evidence and PWA release identity');
