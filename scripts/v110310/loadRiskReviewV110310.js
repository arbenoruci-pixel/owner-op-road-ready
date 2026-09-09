// Extends the existing inspection/deduction checks with clauses commonly printed
// on driver instruction sheets. Keep source excerpts so drivers can check them.
export function extendLoadRiskReviewV110310(base,input={}) {
  const source=String(input.text||input.rawText||input.fields?.rawText||'').replace(/\s+/g,' ').trim();
  const rules=[
    ['macropoint','MacroPoint tracking required',/Driver\s+Must\s+Accept\s+MacroPoint|(?:must|required).{0,60}MacroPoint|MacroPoint.{0,60}(?:must|required)/i],
    ['administrative-fees','Administrative fees may apply',/(?:Toll\s+Fee.{0,200})?administrative\s+fees?.{0,110}/i],
    ['detention-terms','Detention limits and notice requirements',/Detention\s+paid\s+after.{0,400}?(?=POD\s+emailed|Note\s+to\s+Carrier|$)/i],
    ['detention-notice','Detention notice deadline',/Carrier\s+must\s+notify.{0,150}(?:detention\s+begins|detention)/i],
    ['trailer-liability','Trailer damage and rental liability',/Carrier\s+is\s+liable\s+for\s+any\s+damage.{0,450}/i],
    ['rental-fees','Daily rental fees during repairs',/Carrier\s+will\s+be\s+responsible\s+for\s+the\s+daily\s+rental\s+fees.{0,90}/i],
    ['equipment-inspection','Trailer inspection and damage records required',/Inspect\s+the\s+Drop\s+Equipment.{0,200}/i],
    ['departure-contact','Contact broker before leaving',/Do\s+not\s+leave\s*[–—-]?\s*Call\s+TQL.{0,90}/i],
    ['pod-deadline','POD submission deadline',/POD\s+emailed.{0,180}?(?:final\s+delivery|\d+\s*h(?:ou)?rs?)/i],
    ['photo-requirements','Freight and seal photos required',/Driver\(s\)\s+are\s+required\s+to\s+send\s+pictures.{0,180}|Picture\s+of\s+load\s+loaded.{0,180}/i],
    ['seal-claim','Broken seal may lead to rejection and claim',/Broken\s+seal\s+could\s+result.{0,100}/i],
  ];
  const items=[...(base.items||[])];
  for(const [id,title,re] of rules){const match=source.match(re);if(match&&!items.some(x=>x.id===id))items.push({id,severity:'warning',title,detail:match[0].trim(),excerpt:match[0].trim(),amount:0});}
  const pageHeaders=[...source.matchAll(/Page\s+(\d+)\s+(?:of|\/)\s+(\d+)/gi)];
  const declared=Math.max(0,...pageHeaders.map(m=>Number(m[2]))),seen=new Set(pageHeaders.map(m=>Number(m[1])));
  const incomplete=declared>0&&seen.size<declared;
  if(incomplete&&!items.some(x=>x.id==='page-coverage'))items.push({id:'page-coverage',severity:'critical',title:'Some document pages may be missing',detail:`Readable page markers cover ${seen.size} of ${declared} pages. Review the original.`,amount:0});
  return {...base,version:'110.3.10',items,critical:items.filter(x=>x.severity==='critical'),blocking:base.blocking||incomplete,pageCoverage:declared&&seen.size===declared?'all-page-markers-present':'unverified'};
}
