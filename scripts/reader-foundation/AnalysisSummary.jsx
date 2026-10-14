'use client';
import React from 'react';
import {pendingAnalysisGroups} from '../../../../packages/smart-reader-core/src/analysisProjection.js';

export function PendingAnalysisReadings({snapshot}){
 const groups=pendingAnalysisGroups(snapshot);
 if(!groups.length)return null;
 return <section className="reader-pending-readings" aria-label="Readings needing confirmation">
  <h3>Readings found · Not confirmed</h3>
  <p>These readings need review. They are not confirmed details and do not assign a load. Check them against the original before confirming.</p>
  {groups.map(group=><section key={group.id} data-pending-group={group.id}>
   <h4>{group.label}</h4>
   <dl>{group.fields.map(field=><div key={field.key} data-pending-field={field.key}>
    <dt>{field.label}{field.candidates.length>1?' · Different possible readings':''}</dt>
    <dd><ul>{field.candidates.map((candidate,index)=><li key={index}>
     <span style={{overflowWrap:'anywhere'}}>{candidate.text}</span><small> · Not confirmed</small>
     <p>Page {candidate.pageNumbers.join(', ')} · {candidate.reason}</p>
    </li>)}</ul></dd>
   </div>)}</dl>
  </section>)}
 </section>;
}

export default function AnalysisSummary({snapshot}){
 if(snapshot?.version!==1)return null;
 const uncertain=snapshot.reviewItems.length;
 const incomplete=snapshot.pages.filter(page=>page.coverage?.needsReview).length;
 return <><PendingAnalysisReadings snapshot={snapshot}/><details className="reader-analysis-summary" data-analysis-version="1"><summary>Reading coverage and review</summary>
  <p>{snapshot.pages.length} pages · {snapshot.groups.length} document groups · {uncertain} ambiguous or missing required fields.</p>
  {snapshot.mixed?<p role="status">This is a mixed packet. Each document keeps its own evidence; fields are not combined automatically.</p>:null}
  {incomplete?<p role="status">{incomplete} pages need their original checked for reading coverage.</p>:null}
  <p>Source-supported readings are suggestions, not measured accuracy. Confirm the details before Save.</p>
  <ul>{snapshot.pages.map(page=><li key={page.id}>Page {page.number}: {page.coverage?.status || 'unknown'}{page.coverage?.ocr?.status?' · OCR '+page.coverage.ocr.status:''}</li>)}</ul>
 </details></>;
}
