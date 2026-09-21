import fs from 'node:fs';
import assert from 'node:assert/strict';
const scan='source/src/modules/scan/';
function patch(path,before,after){
  const source=fs.readFileSync(path,'utf8');
  if(source.includes(after))return;
  assert.equal(source.split(before).length,2,'AI reader installation anchor: '+path+': '+before);
  fs.writeFileSync(path,source.replace(before,after));
}
export function installAiReader(){
  fs.copyFileSync('scripts/reader-ai/client.js',scan+'readerAiFallbackV110398.js');
  fs.copyFileSync('scripts/reader-ai/Summary.jsx',scan+'AiClassificationSummaryV110398.jsx');
  patch(scan+'engines/isolatedDocumentRouterV10959.js',"import {guardOcrLayoutReading}","import {assistDocumentClassification} from '../readerAiFallbackV110398.js';\nimport {guardOcrLayoutReading}");
  patch(scan+'engines/isolatedDocumentRouterV10959.js','return finalizeSmartScanAnalysisV11039(await analyzeGenericTruckDocumentV1040(file,options),options,file);',
    'const local=finalizeSmartScanAnalysisV11039(await analyzeGenericTruckDocumentV1040(file,options),options,file);\n  return assistDocumentClassification(local,file,options);');
  const preview=scan+'OwnedReaderPreview.jsx';
  for(const line of ["import AiClassificationSummary from './AiClassificationSummaryV110398.jsx';","import {AI_LABELS} from '../../../../lib/reader-ai/policy.js';","import {confirmReviewedKind} from '../../../../lib/reader-ai/confirm.js';"]){
    const source=fs.readFileSync(preview,'utf8');
    if(!source.includes(line)){
      assert.equal(source.split("'use client';").length,2,'Reader client directive');
      fs.writeFileSync(preview,source.replace("'use client';","'use client';\n"+line));
    }
  }
  patch(preview,'confirmDocumentKind(result,{...request,kind:draft})','confirmReviewedKind(result,{...request,kind:draft})');
  patch(preview,'return <section className="owned-reader-preview">','return <section className="owned-reader-preview">\n    <AiClassificationSummary analysis={analysis}/>');
  patch(preview,'function sourceFor(group){return sourceOptions(group)[0]||null;}',`function sourceFor(group){return sourceOptions(group)[0]||null;}
  function aiSuggestion(group){
    if(group.pageIds.length!==1 || group.typeCorrection || Object.values(group.fields).some(field=>field.status==='confirmed'))return null;
    const page=result.pages.find(p=>p.id===group.pageIds[0]);
    return analysis.aiClassification?.pages?.find(p=>p.pageNumber===page?.number&&p.status==='suggested'&&reviewKinds.some(k=>k.id===p.result?.kind))?.result||null;
  }
  function checkAiSuggestion(group){
    const suggestion=aiSuggestion(group);if(!suggestion)return;
    openItem({groupId:group.id,key:null});setDraft(suggestion.kind);
    // Show a complete source page, not an unrelated OCR heading crop.
    setSelection(value=>({...value,evidence:sourceFor(group)}));
  }`);
  patch(preview,"{group.boundaryReview?<p>Check whether these pages belong together.</p>:null}",`{group.boundaryReview?<p>Check whether these pages belong together.</p>:null}
      {aiSuggestion(group)?<aside aria-label="AI type suggestion"><b>AI suggests {AI_LABELS[aiSuggestion(group).kind]}</b><p>Check the original before confirming. AI evidence:</p><ul>{aiSuggestion(group).evidence.map((e,i)=><li key={i}>{e.quote} · {e.location} of page</li>)}</ul><button type="button" onClick={()=>checkAiSuggestion(group)}>Check AI suggestion</button></aside>:null}`);
  // Retain the AI provenance in the exported/saved host review without turning
  // it into core OCR evidence or a human confirmation.
  patch(preview,"function sourcePages(candidate) {",`function aiReadingSummary(result,analysis){return {...savedReadingReview(result),aiClassification:analysis.aiClassification||null};}
function sourcePages(candidate) {`);
  let source=fs.readFileSync(preview,'utf8');
  source=source.replaceAll('summary:savedReadingReview(next)','summary:aiReadingSummary(next,analysis)');
  fs.writeFileSync(preview,source);
  patch(preview,'JSON.stringify({...result,referenceWarnings:referenceDiscrepancies(result)},null,2)','JSON.stringify({...result,referenceWarnings:referenceDiscrepancies(result),aiClassification:analysis.aiClassification||null},null,2)');
}
