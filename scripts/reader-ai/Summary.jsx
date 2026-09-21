'use client';
import React from 'react';
import {AI_LABELS,aiStatusMessage} from '../../../../lib/reader-ai/policy.js';

export default function AiClassificationSummary({analysis}){
  const pages=analysis?.aiClassification?.pages||[];
  if(!pages.length)return null;
  return <aside aria-label="AI document check" style={{padding:12,border:'1px solid #bdcfc9',borderRadius:12,margin:'8px 0'}}>
    <b>AI document check</b>
    {pages.map(page=><p key={page.pageNumber} style={{margin:'6px 0'}}>Page {page.pageNumber}: {page.status==='suggested'?`AI suggests ${AI_LABELS[page.result.kind]}. Open Reader preview to check and confirm.`:page.status==='needs_review'?'AI could not verify the document type. Check the original page.':aiStatusMessage(page.status)}</p>)}
  </aside>;
}
