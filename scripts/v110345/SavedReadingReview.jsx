'use client';
import React from 'react';
export default function SavedReadingReview({review}){
  if(!review?.documents?.length)return null;
  return <details className="saved-reading-review-v345"><summary>Reviewed document details</summary>
    <p>Saved with this original on this device. {review.remaining} items still need checking.</p>
    {review.documents.map(group=><section key={group.id}><h3>{group.label} · Page {group.pages.join(', ')}</h3>
      {Object.keys(group.fields).length?<dl>{Object.entries(group.fields).map(([key,field])=><div key={key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>:<p>No confirmed fields yet.</p>}
    </section>)}
  </details>;
}
