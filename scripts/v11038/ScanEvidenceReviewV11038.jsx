'use client';
import React from 'react';
export default function ScanEvidenceReviewV11038({analysis}) {
  const review=analysis?.evidenceReviewV11036;
  if(!review)return null;
  const rows=Object.entries(review.evidence||{});
  return <section className="scan-evidence-v11038" aria-label="Document reading checks">
    <b>Document reading checks</b>
    {review.issues?.length>0?<ul>{review.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:<p>Check the original and the extracted fields before saving.</p>}
    {rows.length>0&&<details><summary>See where the fields came from</summary><dl>{rows.map(([key,item])=><div key={key}>
      <dt>{item.fieldLabel||key.replace(/([A-Z])/g,' $1')}</dt>
      <dd className="scan-evidence-value-v11038">{item.value}</dd>
      <dd className="scan-evidence-source-v11038">{item.source==='document_text'?item.excerpt:'Check the original image'}</dd>
    </div>)}</dl></details>}
  </section>;
}
