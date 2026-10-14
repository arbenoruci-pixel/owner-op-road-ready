'use client';
import React from 'react';
import {readSavedAnalysis} from '../../../../packages/smart-reader-core/src/analysisProjection.js';
import {confirmedSource} from './sourceCopiesV110419.js';
import {CATALOG,evidenceFieldLabel,kindOf} from './evidenceCoreV110413.js';
export default function SavedReadingReview({review,document:doc,latestReview=false}){
  if(doc&&confirmedSource(doc)){
    const kind=kindOf(doc),fields=doc.extracted.evidenceFactsV1.fields;
    return <details className="saved-reading-review-v345"><summary>Reviewed document details</summary>
      <p>Confirmed for Load {fields.loadNo}.</p>
      <dl>{(CATALOG[kind]?.fields||[]).filter(key=>fields[key]!==undefined&&fields[key]!==null&&String(fields[key]).trim()!=='').map(key=><div key={key}><dt>{evidenceFieldLabel(kind,key)}</dt><dd>{typeof fields[key]==='boolean'?(fields[key]?'Yes':'No'):String(fields[key])}</dd></div>)}</dl>
    </details>;
  }
  const recent=readSavedAnalysis({readerAnalysisV1:review?.readerAnalysisV1});
  const snapshot=latestReview?recent:(recent||readSavedAnalysis(doc));
  if(snapshot?.groups?.length)return <details className="saved-reading-review-v345" data-analysis-version="1"><summary>Saved document reading</summary>
    <p>{snapshot.reviewItems.length} ambiguous or missing required fields. Original and source evidence are retained.</p>
    {snapshot.groups.map(group=><section key={group.id}><h3>{group.label} · Page {snapshot.pages.filter(page=>group.pageIds?.includes(page.id)).map(page=>page.number).join(', ')}</h3><dl>{Object.entries(group.fields).filter(([,field])=>field.value!==null).map(([key,field])=><div key={key}><dt>{field.label}</dt><dd>{field.value}{field.status==='confirmed'?' · Confirmed':' · Check reading'}</dd></div>)}</dl></section>)}
  </details>;
  if(!review?.documents?.length)return null;
  return <details className="saved-reading-review-v345"><summary>Reviewed document details</summary>
    <p>Saved reading. {review.remaining} {review.remaining===1?'item still needs':'items still need'} checking.</p>
    {review.documents.map(group=><section key={group.id}><h3>{group.label} · Page {group.pages.join(', ')}</h3>
      {Object.keys(group.fields).length?<dl>{Object.entries(group.fields).map(([key,field])=><div key={key}><dt>{field.label}</dt><dd>{field.value}{field.status==='supported'?<small> · Check reading</small>:null}</dd></div>)}</dl>:<p>No confirmed fields yet.</p>}
    </section>)}
  </details>;
}
