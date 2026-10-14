import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=path=>fs.readFileSync(path,'utf8');
function patch(path,before,after){const text=read(path);if(text.includes(after))return;assert.equal(text.split(before).length,2,'Reader foundation anchor: '+path+' / '+before.slice(0,90));fs.writeFileSync(path,text.replace(before,()=>after));}
const scan='source/src/modules/scan/',sheet=scan+'SmartScanSheetV105.jsx';
for(const [from,to] of [['scripts/v110363/pdfPageReader.js','pdfPageReaderV110328.js'],['scripts/v110363/pdfCoverage.js','pdfCoverageV110363.js'],['scripts/v110348/pdfImageReader.js','pdfImageReaderV110348.js']])fs.copyFileSync(from,scan+to);
fs.copyFileSync('scripts/reader-foundation/AnalysisSummary.jsx',scan+'AnalysisSummary.jsx');
patch(sheet,"import {scanWithSourceFields}","import AnalysisSummary from './AnalysisSummary.jsx';\nimport {analysisWithProjection} from '../../../../packages/smart-reader-core/src/analysisProjection.js';\nimport {scanWithSourceFields}");
patch(sheet,'const sourceAnalysisV110393=useMemo(()=>scanWithSourceFields(analysis,readerReviewV110345,selectedType),[analysis,readerReviewV110345,selectedType]);',
 'const sourceAnalysisV110393=useMemo(()=>analysisWithProjection(analysis,readerReviewV110345,selectedType,selectedLoadNo,loadSelectionSourceV11037,scanWithSourceFields(analysis,readerReviewV110345,selectedType)),[analysis,readerReviewV110345,selectedType,selectedLoadNo,loadSelectionSourceV11037]);');
patch(sheet,'      const storageFieldsV10964 = compactRateConSaveFieldsV10964(mergedFields);','      const storageFieldsV10964 = compactRateConSaveFieldsV10964(mergedFields);\n      storageFieldsV10964.readerAnalysisV1=sourceAnalysisV110393?.fields?.readerAnalysisV1;');
patch(sheet,'<ScanEvidenceReviewV11036 analysis={sourceAnalysisV110393} />','<ScanEvidenceReviewV11036 analysis={sourceAnalysisV110393} />\n          <AnalysisSummary snapshot={sourceAnalysisV110393?.fields?.readerAnalysisV1}/>');
// An explicit type choice cannot be overwritten by a late OCR/AI callback.
patch(sheet,"  const [selectedType, setSelectedType] = useState('');","  const [selectedType, setSelectedType] = useState('');\n  const typeChosenByDriver=useRef(false);");
patch(sheet,'  function changeType(typeId) {','  function changeType(typeId) {\n    typeChosenByDriver.current=true;');
patch(sheet,"  function applyResult(result, preferredLoadNo = '', preserveLoadChoice = false) {","  function applyResult(result, preferredLoadNo = '', preserveLoadChoice = false) {\n    if(!preserveLoadChoice)typeChosenByDriver.current=Boolean(result.userSelectedTypeV11036);");
patch(sheet,'const typeId=filingTypeForReview(value.summary)||selectedType;','const typeId=typeChosenByDriver.current?selectedType:filingTypeForReview(value.summary)||selectedType;');
// Saved details use the exact persisted typed contract; later explicit facts
// reviews still take precedence over this earlier reading snapshot.
const saved='source/src/modules/owneros/SavedReadingReviewV110345.jsx';
fs.copyFileSync('scripts/reader-foundation/SavedReadingReview.jsx',saved);
// Add-on checklist capture stays capture-only. Record this explicitly instead
// of implying that a selected POD was independently read or AI-verified.
const attachment=scan+'attachmentContextV110426.js';
patch(attachment,'export function attachmentContext(',"import {createAnalysisProjection} from '../../../../packages/smart-reader-core/src/analysisProjection.js';\nexport function attachmentContext(");
patch(attachment,"  if (context.type === 'pod') Object.assign(fields,", "  fields.readerAnalysisV1=createAnalysisProjection({selectedType:context.type,selectedLoadNo:context.loadNo,assignment:'driver_selected',source:{fileName:file.name||''}});\n  if (context.type === 'pod') Object.assign(fields,");
console.log('PASS — versioned Reader analysis, save/reopen projection, explicit type authority, capture-only attachment diagnostics installed');

const reread='source/src/modules/owneros/savedRereadingV110347.js';
patch(reread,'    // Retain the last review for recovery; never keep another original or transcript.',`    if(current.extracted?.readerAnalysisV1)extracted.previousReaderAnalysisV1=current.extracted.readerAnalysisV1;
    if(summary.readerAnalysisV1?.version===1){
      extracted.readerAnalysisV1={...summary.readerAnalysisV1,
        source:{...summary.readerAnalysisV1.source,sha256:current.sha256||'',immutable:true},
        selection:{type:current.type||current.document_type||'',loadNo:current.load_no||current.extracted?.loadNo||'',assignment:'saved_document'},
      };
    }else delete extracted.readerAnalysisV1; // Legacy reread must not be hidden by stale fields.
    // Retain the last review for recovery; never keep another original or transcript.`);
const preview=scan+'OwnedReaderPreview.jsx';
patch(preview,'  const active=useRef(0),inspect=useRef(null),retryGeneration=useRef(0),visited=useRef(new Set());','  const active=useRef(0),inspect=useRef(null),retryGeneration=useRef(0),visited=useRef(new Set());\n  const latestCallbacks=useRef({onReady,onReviewChange});latestCallbacks.current={onReady,onReviewChange};');
patch(preview,'setSources(files);setResult(next);onReady?.(','setSources(files);setResult(next);latestCallbacks.current.onReady?.(');
patch(preview,'onReviewChange?.({analysis,result:next,summary:aiReadingSummary(next,analysis)})','latestCallbacks.current.onReviewChange?.({analysis,result:next,summary:aiReadingSummary(next,analysis)})');
patch('source/src/modules/owneros/SavedDocumentFilesV110344.jsx','<SavedReadingReview document={doc} review={savedReview || doc?.extracted?.readerReviewV110345}/>','<SavedReadingReview document={doc} review={savedReview || doc?.extracted?.readerReviewV110345} latestReview={Boolean(savedReview)}/>');

await import("./installReceiptProjection.mjs");

await import("./installPodSupersession.mjs");

await import('./installLoadPicker.mjs');

await import('./installCurrentLoad.mjs');
