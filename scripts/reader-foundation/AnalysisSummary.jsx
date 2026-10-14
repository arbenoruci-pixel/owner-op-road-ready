'use client';
import React from 'react';
export default function AnalysisSummary({snapshot}){
 if(snapshot?.version!==1)return null;
 const uncertain=snapshot.reviewItems.length;
 const incomplete=snapshot.pages.filter(page=>page.coverage?.needsReview).length;
 return <details className="reader-analysis-summary" data-analysis-version="1"><summary>Reading coverage and review</summary>
  <p>{snapshot.pages.length} pages · {snapshot.groups.length} document groups · {uncertain} ambiguous or missing required fields.</p>
  {snapshot.mixed?<p role="status">This is a mixed packet. Each document keeps its own evidence; fields are not combined automatically.</p>:null}
  {incomplete?<p role="status">{incomplete} pages need their original checked for reading coverage.</p>:null}
  <p>Source-supported readings are suggestions, not measured accuracy. Confirm the details before Save.</p>
  <ul>{snapshot.pages.map(page=><li key={page.id}>Page {page.number}: {page.coverage?.status || 'unknown'}{page.coverage?.ocr?.status?' · OCR '+page.coverage.ocr.status:''}</li>)}</ul>
 </details>;
}
