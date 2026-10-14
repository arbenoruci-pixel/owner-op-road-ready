// Scanner-only candidates. They never become live dispatch work.
const text=v=>String(v??'').trim();
const norm=v=>text(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
export function libraryScanCandidates(base=[],store={},fields={}){
 const rows=new Map(base.map(c=>[c.loadNo,c]));
 for(const load of store.loads||[]){
  if(load.operationalStatus!=='closed'||!load.documentLibrarySource||!load.loadNo)continue;
  const no=text(load.loadNo).toUpperCase(),previous=rows.get(no)||{};
  const aliases=(load.aliases||[]).map(a=>typeof a==='string'?{kind:'order_number',value:a,source:'imported_source_reference'}:a).filter(a=>a?.value&&norm(a.value).length>=6);
  const incoming=norm(fields.broker),saved=norm(load.broker),conflict=!!(incoming&&saved&&incoming!==saved&&!incoming.includes(saved)&&!saved.includes(incoming));
  const details=Object.fromEntries(['broker','carrierName','origin','destination','pickupDate','deliveryDate'].map(key=>[key,text(previous[key])||text(load[key])]));
  rows.set(no,{...load,...previous,...details,id:previous.id||load.id||'archive-'+no,loadNo:no,status:'completed',stops:previous.stops?.length?previous.stops:load.stops||[],sourceKinds:[...new Set([...(previous.sourceKinds||[]),'document_library'])],aliases:[...(previous.aliases||[]),{kind:'load_number',value:no,source:'document_library'},...aliases],brokerIdentityConflict:previous.brokerIdentityConflict||conflict});
 }
 return [...rows.values()];
}
