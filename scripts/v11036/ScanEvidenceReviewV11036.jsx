'use client';
import React from 'react';
export default function ScanEvidenceReviewV11036({analysis}){
  const review=analysis?.evidenceReviewV11036;
  if(!review)return null;
  const rows=Object.entries(review.evidence||{});
  return <section aria-label="Document reading checks" style={{margin:'12px 0',padding:14,border:'1px solid #94a3b8',borderRadius:12,background:'#f8fafc',color:'#172033'}}>
    <b>Document reading checks</b>
    {review.issues.length>0?<ul style={{margin:'10px 0',paddingLeft:20,fontSize:13,lineHeight:1.5}}>{review.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:<p style={{fontSize:13}}>Review the image and extracted details before saving.</p>}
    {review.suggestedLoad&&<p style={{fontSize:13}}>Active pickup: <b>{review.suggestedLoad.loadNo}</b>. This is a folder suggestion; verify it against the document.</p>}
    {rows.length>0&&<details><summary style={{minHeight:44,paddingTop:10,cursor:'pointer'}}>See where the fields came from</summary><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr>{['Field','Value','Evidence'].map(s=><th key={s} style={{textAlign:'left',padding:6}}>{s}</th>)}</tr></thead><tbody>{rows.map(([key,item])=><tr key={key}><td style={{padding:6}}>{key.replace(/([A-Z])/g,' $1')}</td><td style={{padding:6,overflowWrap:'anywhere'}}>{item.value}</td><td style={{padding:6,overflowWrap:'anywhere'}}>{item.source==='document_text'?item.excerpt:'Check the image'}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
