'use client';
import React from 'react';
import {AI_LABELS,aiStatusMessage} from '../../../../lib/reader-ai/policy.js';
import {aiReadingDiagnostics} from '../../../../lib/reader-ai/diagnostics.js';

const skippedReason=reason=>({supported_local_type:'Local evidence already supports the document type.',user_selected_type:'You selected the document type.',not_run:'The AI classification stage did not run.',invalid_local_analysis:'Local page evidence could not be prepared for AI.'})[reason] || 'No AI classification request was made.';
export default function AiClassificationSummary({analysis}){
  const {aiClassification:stage,aiExtraction:extraction}=aiReadingDiagnostics(analysis);
  const pages=stage.pages||[],limits=stage.limits;
  return <aside aria-label="AI document check" style={{padding:12,border:'1px solid #bdcfc9',borderRadius:12,margin:'8px 0'}}>
    <b>AI document check</b>
    {!pages.length?<p>Classification {stage.state}: {skippedReason(stage.reason)}</p>:null}
    {pages.map(page=><p key={page.pageNumber} style={{margin:'6px 0'}}>Page {page.pageNumber}: {page.status==='suggested'?`AI suggests ${AI_LABELS[page.result.kind]}. Open Reader preview to check and confirm.`:page.status==='needs_review'?'AI could not verify the document type. Check the original page.':aiStatusMessage(page.status)}</p>)}
    <p>AI field extraction: {extraction.state} ({extraction.reason.replaceAll('_',' ')}). AI suggestions never apply fields automatically.</p>
    <details><summary>AI limits and provenance</summary>
      <p>Classification: {stage.state}. Model: {stage.model || 'not used or unavailable'}. Version: {stage.version}.</p>
      <p>Extraction: {extraction.state}. Model: {extraction.model || 'not used or unavailable'}. Version: {extraction.version}. {extraction.attemptedPageCount || 0} page requests.</p>
      <p>{stage.attemptedPageCount || 0} classification page requests; {stage.cachedPageCount || 0} cached results. All suggestions require original-page review.</p>
      {limits?<p>Maximum {limits.maxRequestsPerScan} combined classification and extraction page requests per scan; page numbers 1–{limits.maxPageNumber}; {limits.maxTextCharacters} OCR characters and {limits.maxImageBytes} image bytes per page; image dimension up to {limits.maxImageDimension}px. Request timeout {limits.serverTimeoutMs/1000}s; scan timeout {limits.scanTimeoutMs/1000}s.</p>:null}
      {pages.some(page=>page.textTruncated)?<p>Some OCR text exceeded the per-page limit and was truncated before AI review.</p>:null}
    </details>
  </aside>;
}
