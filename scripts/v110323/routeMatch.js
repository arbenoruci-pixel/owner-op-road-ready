const city=value=>String(value||'').trim().toUpperCase().replace(/\s+\d{5}(?:-\d{4})?\b.*$/,'').replace(/[^A-Z0-9]+/g,' ').trim();
const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
export function matchDocumentRouteV110323(options,candidates,ranked=[]) {
  if(!['bol','pod','delivery_receipt'].includes(options.typeId))return null;
  const f=options.fields||{},e=options.analysis?.fieldEvidence||{};
  // Both addresses must have survived labeled source-text qualification.
  if(!e.origin?.excerpt||!e.destination?.excerpt||!e.documentDate?.excerpt)return null;
  const from=city(f.origin),to=city(f.destination),date=day(f.documentDate);if(!from||!to||from===to||!date)return null;
  const matches=candidates.filter(c=>{
    const source=(c.stops||[]).filter(s=>s.type==='pickup').map(s=>s.cityState||[s.city,s.state].filter(Boolean).join(', '));
    const targets=(c.stops||[]).filter(s=>s.type==='delivery'&&s.role!=='trailer_return').map(s=>s.cityState||[s.city,s.state].filter(Boolean).join(', '));
    if(![c.origin,...source].some(v=>city(v)===from)||![c.destination,...targets].some(v=>city(v)===to))return false;
    const dates=options.typeId==='bol'?[c.pickupDate,...(c.stops||[]).filter(s=>s.type==='pickup').map(s=>s.date)]:[c.deliveryDate,...(c.stops||[]).filter(s=>s.type==='delivery'&&s.role!=='trailer_return').map(s=>s.date)];
    if(!dates.includes(date)||ranked.find(r=>r.loadNo===c.loadNo)?.brokerIdentityConflict)return false;
    if(f.loadNo&&city(f.loadNo)!==city(c.loadNo))return false;
    return true;
  });
  if(matches.length!==1)return null;
  const match=matches[0],rank=ranked.find(c=>c.loadNo===match.loadNo);
  return {matched:true,automatic:true,requiresConfirmation:false,loadNo:match.loadNo,canonicalLoadId:match.id,broker:match.broker,stop:rank?.stopMatch||null,stopSequence:Number(rank?.stopMatch?.deliverySequence||0),confidence:.9,score:90,source:'document_route',reason:'Ship-from, ship-to and document date match this load.'};
}
export function scanDateNoticeV110323(date,match,candidates=[]) {
  const candidate=candidates.find(c=>c.loadNo===match),year=String(date||'').slice(0,4);
  const loadYears=[candidate?.pickupDate,candidate?.deliveryDate].filter(Boolean).map(d=>String(d).slice(0,4));
  return year&&loadYears.length&&!loadYears.includes(year)?'The document year differs from this load. Check the year on the photo.':'';
}
