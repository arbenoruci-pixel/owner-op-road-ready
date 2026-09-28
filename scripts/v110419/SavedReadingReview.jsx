'use client';
import React from 'react';
import {confirmedSource} from './sourceCopiesV110419.js';
import {CATALOG,evidenceFieldLabel,kindOf} from './evidenceCoreV110413.js';
export default function SavedReadingReview({review,document:doc}){
  if(doc&&confirmedSource(doc)){
    const kind=kindOf(doc),fields=doc.extracted.evidenceFactsV1.fields;
    return <details className="saved-reading-review-v345"><summary>Reviewed document details</summary>
      <p>Confirmed for Load {fields.loadNo}.</p>
      <dl>{(CATALOG[kind]?.fields||[]).filter(key=>fields[key]!==undefined&&fields[key]!==null&&String(fields[key]).trim()!=='').map(key=><div key={key}><dt>{evidenceFieldLabel(kind,key)}</dt><dd>{typeof fields[key]==='boolean'?(fields[key]?'Yes':'No'):String(fields[key])}</dd></div>)}</dl>
    </details>;
  }
  if(!review?.documents?.length)return null;
  return <details className="saved-reading-review-v345"><summary>Reviewed document details</summary>
    <p>Saved reading. {review.remaining} {review.remaining===1?'item still needs':'items still need'} checking.</p>
    {review.documents.map(group=><section key={group.id}><h3>{group.label} · Page {group.pages.join(', ')}</h3>
      {Object.keys(group.fields).length?<dl>{Object.entries(group.fields).map(([key,field])=><div key={key}><dt>{field.label}</dt><dd>{field.value}{field.status==='supported'?<small> · Check reading</small>:null}</dd></div>)}</dl>:<p>No confirmed fields yet.</p>}
    </section>)}
  </details>;
}
