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
  fs.copyFileSync('scripts/reader-ai/ExtractionReview.jsx',scan+'AiExtractionReviewV110398.jsx');
  patch(scan+'engines/isolatedDocumentRouterV10959.js',"import {guardOcrLayoutReading}","import {assistDocumentClassification} from '../readerAiFallbackV110398.js';\nimport {guardOcrLayoutReading}");
  patch(scan+'engines/isolatedDocumentRouterV10959.js','return finalizeSmartScanAnalysisV11039(await analyzeGenericTruckDocumentV1040(file,options),options,file);',
    'const local=finalizeSmartScanAnalysisV11039(await analyzeGenericTruckDocumentV1040(file,options),options,file);\n  return assistDocumentClassification(local,file,options);');
  const preview=scan+'OwnedReaderPreview.jsx';
  for(const line of ["import AiExtractionReview from './AiExtractionReviewV110398.jsx';","import {createAnalysisProjection} from '../../../../packages/smart-reader-core/src/analysisProjection.js';","import AiClassificationSummary from './AiClassificationSummaryV110398.jsx';","import {AI_LABELS} from '../../../../lib/reader-ai/policy.js';","import {aiReadingDiagnostics} from '../../../../lib/reader-ai/diagnostics.js';","import {confirmReviewedKind} from '../../../../lib/reader-ai/confirm.js';"]){
    const source=fs.readFileSync(preview,'utf8');
    if(!source.includes(line)){
      assert.equal(source.split("'use client';").length,2,'Reader client directive');
      fs.writeFileSync(preview,source.replace("'use client';","'use client';\n"+line));
    }
  }
  patch(preview,'confirmDocumentKind(result,{...request,kind:draft})','confirmReviewedKind(result,{...request,kind:draft})');
  patch(preview,'for(const {pageNumber,file}of retainedReviewPageSources(analysis)){','for(const {pageNumber,file}of [...retainedReviewPageSources(analysis),...(analysis.aiSourcePages||[])]){');
  if(!fs.readFileSync(preview,'utf8').includes('const hasAiSuggestion='))patch(preview,'setSources(files);setResult(next);onReady?.({analysis,result:next,',`for(const page of next.pages){
        const sourceImageId=originalSources[page.id];
        const hasAiSuggestion=analysis.aiClassification?.pages?.some(p=>p.pageNumber===page.number&&p.status==='suggested');
        if(sourceImageId&&!page.observations.some(o=>o.sourceImageId===sourceImageId))page.observations.push({id:'original-source',source:'source-image',sourceImageId,lines:[]});
      }
      setSources(files);setResult(next);onReady?.({analysis,result:next,`);
  let originalLink=fs.readFileSync(preview,'utf8');
  originalLink=originalLink.replace('if(hasAiSuggestion&&sourceImageId&&','if(sourceImageId&&');
  fs.writeFileSync(preview,originalLink);
  if(!fs.readFileSync(preview,'utf8').includes('<AiClassificationSummary '))patch(preview,'return <section className="owned-reader-preview">','return <section className="owned-reader-preview">\n    <AiClassificationSummary analysis={analysis}/>');
  patch(preview,'function sourceFor(group){return sourceOptions(group)[0]||null;}',`function sourceFor(group){return sourceOptions(group)[0]||null;}
  function aiSuggestion(group){
    if(group.pageIds.length!==1 || group.typeCorrection || Object.values(group.fields).some(field=>field.status==='confirmed'))return null;
    const page=result.pages.find(p=>p.id===group.pageIds[0]);
    return analysis.aiClassification?.pages?.find(p=>p.pageNumber===page?.number&&p.status==='suggested'&&reviewKinds.some(k=>k.id===p.result?.kind))?.result||null;
  }
  function checkAiSuggestion(group){
    const suggestion=aiSuggestion(group);if(!suggestion)return;
    openItem({groupId:group.id,key:null});setDraft(suggestion.kind);
    // Match the retained original sent to AI, not an OCR filter derivative.
    const page=result.pages.find(p=>p.id===group.pageIds[0]),sourceImageId=result.documentId+':'+page.id+':original';
    const evidence=sources[sourceImageId]?{pageId:page.id,pageNumber:page.number,sourceImageId}:sourceFor(group);
    setSelection(value=>({...value,evidence}));
  }`);
  const fieldReviewAnchor=fs.readFileSync(preview,'utf8').includes('  function steps(current=result,seen=new Set()){')
    ? '  function steps(current=result,seen=new Set()){'
    : '  function openItem(item,current=result,continuing=false){';
  patch(preview,fieldReviewAnchor,`  function checkAiFieldSuggestion(candidate){
    const group=result.documents.find(item=>item.id===candidate.groupId),field=group?.fields[candidate.field];
    const source=candidate.provenance?.providerImage;
    if(!field || field.status==='confirmed' || !source || !group.pageIds.includes(source.pageId) || !sources[source.sourceImageId])return;
    openItem({groupId:group.id,key:candidate.field});setDraft(candidate.rawValue);
    // Manual source confirmation, never an injected OCR candidate.
    setSelection(value=>({...value,candidate:null,evidence:{pageId:source.pageId,pageNumber:source.pageNumber,sourceImageId:source.sourceImageId,boxScope:'page'},aiCandidate:true}));
  }
${fieldReviewAnchor}`);
  patch(preview,'      <details><summary>Read page text</summary>{group.pageIds.map(id=>{',`      <AiExtractionReview analysis={analysis} result={result} group={group} sources={sources} signal={signal} disabled={busy||saving||modalOpen} onStage={stage=>update({...result,aiExtraction:stage})} onCandidate={checkAiFieldSuggestion}/>
      <details><summary>Read page text</summary>{group.pageIds.map(id=>{`);
  patch(preview,'      {rereadText?<p role="status">{rereadText}</p>:null}',`      {selection.aiCandidate?<p>AI suggested this value. Check the original page before confirming. No field has been changed yet.</p>:null}
      {rereadText?<p role="status">{rereadText}</p>:null}`);
  patch(preview,"{group.boundaryReview?<p>Check whether these pages belong together.</p>:null}",`{group.boundaryReview?<p>Check whether these pages belong together.</p>:null}
      {aiSuggestion(group)?<aside aria-label="AI type suggestion"><b>AI suggests {AI_LABELS[aiSuggestion(group).kind]}</b><p>Check the original before confirming. AI evidence:</p><ul>{aiSuggestion(group).evidence.map((e,i)=><li key={i}>{e.quote} · {e.location} of page</li>)}</ul><button type="button" onClick={()=>checkAiSuggestion(group)}>Check AI suggestion</button></aside>:null}`);
  // Retain the AI provenance in the exported/saved host review without turning
  // it into core OCR evidence or a human confirmation.
  // Upgrade already installed runtimes as well as freshly materialized ones.
  let existing=fs.readFileSync(preview,'utf8');
  existing=existing.replaceAll('aiClassification:analysis.aiClassification||null','...aiReadingDiagnostics(analysis)');
  fs.writeFileSync(preview,existing);
  if(!fs.readFileSync(preview,'utf8').includes('function aiReadingSummary('))patch(preview,"function sourcePages(candidate) {",`function aiReadingSummary(result,analysis){return {...savedReadingReview(result),...aiReadingDiagnostics(analysis)};}
function sourcePages(candidate) {`);
  let source=fs.readFileSync(preview,'utf8');
  source=source.replaceAll('summary:savedReadingReview(next)','summary:aiReadingSummary(next,analysis)');
  fs.writeFileSync(preview,source);
  if(!fs.readFileSync(preview,'utf8').includes('referenceWarnings:referenceDiscrepancies(result),...aiReadingDiagnostics('))patch(preview,'JSON.stringify({...result,referenceWarnings:referenceDiscrepancies(result)},null,2)','JSON.stringify({...result,referenceWarnings:referenceDiscrepancies(result),...aiReadingDiagnostics(analysis)},null,2)');
  let final=fs.readFileSync(preview,'utf8');
  const summary=`function aiReadingSummary(result,analysis){
  const diagnostics=aiReadingDiagnostics({...analysis,aiExtraction:result.aiExtraction||analysis.aiExtraction});
  const enriched={...analysis,...diagnostics};
  return {...savedReadingReview(result),...diagnostics,readerAnalysisV1:createAnalysisProjection({analysis:enriched,review:{analysis:enriched,result},selectedType:analysis.type?.id||''})};
}`;
  final=final.replace(/function aiReadingSummary\(result,analysis\)\{[\s\S]*?\nfunction sourcePages/,summary+'\nfunction sourcePages');
  final=final.replace('referenceWarnings:referenceDiscrepancies(result),...aiReadingDiagnostics(analysis)','referenceWarnings:referenceDiscrepancies(result),...aiReadingDiagnostics({...analysis,aiExtraction:result.aiExtraction||analysis.aiExtraction})');
  final=final.replace('JSON.stringify({...result,referenceWarnings:referenceDiscrepancies(result),...aiReadingDiagnostics(', 'JSON.stringify({...result,readerAnalysisV1:aiReadingSummary(result,analysis).readerAnalysisV1,referenceWarnings:referenceDiscrepancies(result),...aiReadingDiagnostics(');
  final=final.replace('function ReviewBody({analysis,reviewState,onReviewChange,onReady,signal,onSaveReading,previousReadings=[]})', 'function ReviewBody({analysis,reviewState,onReviewChange,onReady,signal,onSaveReading,previousReadings=[],onAiExtraction})');
  if(!final.includes('function update(next){setResult(next);onAiExtraction?.'))final=final.replace('function update(next){setResult(next);', 'function update(next){setResult(next);onAiExtraction?.(next.aiExtraction);');
  if(!final.includes('const [aiExtractionView,setAiExtractionView]'))final=final.replace('  const [open,setOpen]=useState(Boolean(defaultExpanded', '  const [aiExtractionView,setAiExtractionView]=useState({analysis,stage:analysis.aiExtraction});\n  const [open,setOpen]=useState(Boolean(defaultExpanded');
  final=final.replace('<ReviewBody analysis={analysis}', '<ReviewBody onAiExtraction={stage=>setAiExtractionView({analysis,stage})} analysis={analysis}');
  final=final.replace('<AiClassificationSummary analysis={analysis}/>','<AiClassificationSummary analysis={{...analysis,aiExtraction:reviewState?.analysis===analysis?reviewState?.result?.aiExtraction||analysis.aiExtraction:analysis.aiExtraction}}/>');
  final=final.replace('aiExtraction:reviewState?.analysis===analysis?reviewState?.result?.aiExtraction||analysis.aiExtraction:analysis.aiExtraction','aiExtraction:aiExtractionView.analysis===analysis&&aiExtractionView.stage?aiExtractionView.stage:reviewState?.analysis===analysis?reviewState?.result?.aiExtraction||analysis.aiExtraction:analysis.aiExtraction');
  fs.writeFileSync(preview,final);
}
