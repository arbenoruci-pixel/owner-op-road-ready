import fs from 'node:fs';
import assert from 'node:assert/strict';
function patch(path,before,after){const source=fs.readFileSync(path,'utf8');if(source.includes(after))return;assert.equal(source.split(before).length-1,1,'Quality/recovery anchor: '+path);fs.writeFileSync(path,source.replace(before,after));}
const scan='source/src/modules/scan/',quality=scan+'v3/DocumentQualityV11036.js';
fs.copyFileSync('scripts/v110345/paperQuality.js',scan+'v3/paperQualityV110345.js');
patch(quality,"from './paperCleanupV110331.js'","from './paperQualityV110345.js'");
const paper=scan+'paperQualityV110323.js';
let source=fs.readFileSync(paper,'utf8');
if(!source.includes('paperQualityV110345.js'))fs.writeFileSync(paper,"import {cleanupDocumentPaper} from './v3/paperQualityV110345.js';\nexport function normalizePaperV110323(image){return cleanupDocumentPaper(image); }\n"+source.slice(source.indexOf('export function grayscalePaperV110323')));
const engine=scan+'v3/ScannerEngineV3.js';
patch(engine,"'road-ready-projective-native-detail.jpg'","'road-ready-projective-native-detail.png'");
patch(engine,"method:'paper-surface-v110331'","method:'paper-detail-v110345'");
fs.copyFileSync('scripts/v110345/ReaderPreview.jsx',scan+'OwnedReaderPreview.jsx');
fs.copyFileSync('scripts/v110345/SavedReadingReview.jsx','source/src/modules/owneros/SavedReadingReviewV110345.jsx');
const sheet=scan+'SmartScanSheetV105.jsx';
patch(sheet,'  const [analysis, setAnalysis] = useState(null);','  const [analysis, setAnalysis] = useState(null);\n  const [readerReviewV110345,setReaderReviewV110345] = useState(null);');
patch(sheet,'<OwnedReaderPreview analysis={analysis} />',`<OwnedReaderPreview analysis={analysis} reviewState={readerReviewV110345} onReviewChange={value=>{setReaderReviewV110345(value);const groups=value.summary.documents;if(groups.length===1&&groups[0].typeCorrection)setSelectedType(({bol:'bol',invoice:'invoice',unloading_receipt:'lumper_receipt'})[groups[0].kind]||'other');}} />`);
patch(sheet,'      const analysisForSaveV10964 = compactRateConAnalysisV10964',"      if(readerReviewV110345?.analysis===analysis)storageFieldsV10964.readerReviewV110345=readerReviewV110345.summary;\n      const analysisForSaveV10964 = compactRateConAnalysisV10964");
patch(sheet,"        local_blob_state:stored.localDocument?.local_blob_state || '',","        local_blob_state:stored.localDocument?.local_blob_state || '',\n        extracted:{readerReviewV110345:storageFieldsV10964.readerReviewV110345},");
let sheetSource=fs.readFileSync(sheet,'utf8');if(!sheetSource.includes('setReaderReviewV110345(null);')){sheetSource=sheetSource.replaceAll('setAnalysis(null);','setAnalysis(null);setReaderReviewV110345(null);').replace('    setAnalysis(result);','    setReaderReviewV110345(null);\n    setAnalysis(result);');fs.writeFileSync(sheet,sheetSource);}
const saved='source/src/modules/owneros/SavedDocumentFilesV110344.jsx';
patch(saved,"import './savedDocumentFilesV110344.css';","import './savedDocumentFilesV110344.css';\nimport SavedReadingReview from './SavedReadingReviewV110345.jsx';");
patch(saved,'  return <div className="saved-file-actions-v344" aria-label="Saved file actions">','  return <div className="saved-file-actions-v344" aria-label="Saved file actions">\n    <SavedReadingReview review={doc?.extracted?.readerReviewV110345}/>');
const css=fs.readFileSync('scripts/v110345/recovery.css','utf8'),cssPath='source/src/command-center.css';
if(!fs.readFileSync(cssPath,'utf8').includes(css))fs.appendFileSync(cssPath,'\n'+css);
const VERSION='110.3.45', BUILD='v110345-paper-quality-recovery';
for(const path of ['release-version.json','public/app-version.json']) {
  const value=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(value,{version:VERSION,build:BUILD,force:false,label:'v110.3.45 Clearer scans and guided reading corrections',releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,notes:['Whiten paper and strengthen existing text strokes while preserving ink colors.','Recheck unclear fields, enter missing values and move to the next reading.','Keep confirmed reading details with the saved document on this device.']});
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const path of ['package.json','package-lock.json']) {
  const value=JSON.parse(fs.readFileSync(path,'utf8'));value.version=VERSION;if(value.packages?.[''])value.packages[''].version=VERSION;
  fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let source=fs.readFileSync(path,'utf8');
  for(const [key,value] of [['VERSION',VERSION],['BUILD',BUILD]])source=source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['\"][^'\"]+['\"];?`),`const ${name}_${key} = '${value}';`);
  fs.writeFileSync(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/App v\d+\.\d+\.\d+/g,'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g,'APP V'+VERSION));
patch('scripts/test-duty-graph-continuity.mjs', "assert.equal(meta.version,'110.3.44');assert.equal(meta.build,'v110344-saved-document-access');", `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
console.log('PASS — v110.3.45 paper quality and guided reader recovery installed');
