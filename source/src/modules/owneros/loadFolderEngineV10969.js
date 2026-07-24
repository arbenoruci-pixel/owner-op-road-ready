export const LOAD_FOLDER_ENGINE_VERSION_V10969 = '109.6.9';

function text(value=''){ return String(value ?? '').replace(/\s+/g,' ').trim(); }
function upper(value=''){ return text(value).toUpperCase(); }
function num(value=0){ const n=Number(value); return Number.isFinite(n)?n:0; }
function date(value=''){ return text(value).slice(0,10); }
function unique(values=[]){ return [...new Set(values.filter(Boolean))]; }
function docType(doc={}){ return text(doc.document_type || doc.type || doc.classification?.selectedType || doc.extracted?.type || doc.metadata?.relationType).toLowerCase(); }
function docLoad(doc={}){ return upper(doc.load_no || doc.loadNo || doc.canonicalLoadNo || doc.extracted?.canonicalLoadNo || doc.extracted?.loadNo || doc.metadata?.loadNo); }
function docDay(doc={}){ return date(doc.vaultDate || doc.document_date || doc.documentDate || doc.extracted?.documentDate || doc.extracted?.date || doc.created_at); }
function docStop(doc={}){ return num(doc.stopSequence || doc.stop_sequence || doc.extracted?.stopSequence || doc.metadata?.stopSequence); }
function place(city='',state=''){ return [text(city),upper(state).slice(0,2)].filter(Boolean).join(', '); }

function loadEvents(state={},loadNo=''){
  const target=upper(loadNo);
  return Object.entries(state.eventsByDay||{}).flatMap(([day,events])=>(events||[]).filter(event=>{
    const refs=[event.loadNo,event.shippingDocs,event.orderNo,event.pickedUpLoadNo,event.deliveredLoadNo].map(upper);
    return refs.includes(target);
  }).map(event=>({...event,day})));
}
function loadRouteLegs(state={},loadNo=''){
  const target=upper(loadNo);
  return Object.entries(state.routeLegsByDay||{}).flatMap(([day,legs])=>(legs||[]).filter(leg=>upper(leg.loadNo||leg.orderNo||leg.shippingDocs)===target).map(leg=>({...leg,day})));
}
function deliveryStops(load={},legs=[]){
  const fromLoad=(load.stops||[]).filter(stop=>stop.type==='delivery');
  if(fromLoad.length) return fromLoad.map((stop,index)=>({
    sequence:num(stop.deliverySequence||stop.stopSequence||stop.sequence||index+1),
    company:text(stop.company||stop.facility||stop.name),
    city:text(stop.city||stop.deliveryCity), state:upper(stop.state||stop.deliveryState).slice(0,2),
    address:text(stop.address), appointment:text(stop.appointment||stop.time),
  })).sort((a,b)=>a.sequence-b.sequence);
  return legs.filter(leg=>num(leg.stopSequence)>1 && !/empty return/i.test(text(leg.stopCompany))).map((leg,index)=>({
    sequence:num(leg.stopSequence||index+1), company:text(leg.stopCompany), city:text(leg.toCity), state:upper(leg.toState).slice(0,2), address:text(leg.stopAddress), appointment:text(leg.appointment),
  })).sort((a,b)=>a.sequence-b.sequence);
}
function mileageEvidence(state={},days=[]){
  const manual=state.manualMilesByDay||state.dailyMilesByDay||{};
  return days.some(day=>num(manual[day])>0 || num(manual[day]?.total)>0 || (manual[day]?.segments||[]).length>0);
}
function fuelRowsForLoad(businessStore={},loadNo='',days=[]){
  const target=upper(loadNo);
  return (businessStore.fuel||[]).filter(row=>upper(row.loadNo)===target || (!row.loadNo && days.includes(date(row.date))));
}
function expenseRowsForLoad(businessStore={},loadNo='',days=[]){
  const target=upper(loadNo);
  return (businessStore.expenses||[]).filter(row=>upper(row.loadNo)===target || (!row.loadNo && days.includes(date(row.date))));
}

export function buildLoadFoldersV10969({loads=[],documents=[],state={},businessStore={}}={}){
  const loadMap=new Map();
  for(const load of loads||[]){ const no=upper(load.loadNo||load.canonicalLoadNo); if(no) loadMap.set(no,{...load,loadNo:no}); }
  for(const doc of documents||[]){ const no=docLoad(doc); if(no && !loadMap.has(no)) loadMap.set(no,{id:`load_${no}`,loadNo:no,status:'needs_review'}); }
  for(const legs of Object.values(state.routeLegsByDay||{})) for(const leg of legs||[]){ const no=upper(leg.loadNo||leg.orderNo||leg.shippingDocs); if(no && !loadMap.has(no)) loadMap.set(no,{id:`load_${no}`,loadNo:no,status:'tracked'}); }

  return [...loadMap.values()].map(load=>{
    const loadNo=upper(load.loadNo);
    const docs=(documents||[]).filter(doc=>docLoad(doc)===loadNo);
    const events=loadEvents(state,loadNo);
    const legs=loadRouteLegs(state,loadNo);
    const stops=deliveryStops(load,legs);
    const days=unique([...events.map(e=>e.day),...legs.map(l=>l.day),...docs.map(docDay)]).sort();
    const rateCons=docs.filter(doc=>['rate_confirmation','load_tender'].includes(docType(doc)));
    const bols=docs.filter(doc=>docType(doc)==='bol');
    const pods=docs.filter(doc=>['pod','delivery_receipt'].includes(docType(doc)));
    const fuelDocs=docs.filter(doc=>docType(doc)==='fuel_receipt');
    const fuelRows=fuelRowsForLoad(businessStore,loadNo,days);
    const expenses=expenseRowsForLoad(businessStore,loadNo,days);
    const podByStop=new Map();
    pods.forEach(doc=>{ const seq=docStop(doc); if(seq) podByStop.set(seq,doc); });
    const unassignedPods=pods.filter(doc=>!docStop(doc));
    const missingStops=stops.filter(stop=>!podByStop.has(stop.sequence));
    const podComplete=stops.length ? pods.length>=stops.length && missingStops.length<=unassignedPods.length : pods.length>0;
    const logbookComplete=events.length>0;
    const milesComplete=mileageEvidence(state,days);
    const fuelActivity=fuelRows.length>0;
    const fuelComplete=!fuelActivity || fuelDocs.length>0 || fuelRows.every(row=>row.receiptAttached===true);
    const checklist=[
      {id:'rate',label:'Rate Confirmation',complete:rateCons.length>0,required:true,detail:rateCons.length?`${rateCons.length} saved`:'Required to define the load'},
      {id:'bol',label:'Bill of Lading',complete:bols.length>0,required:true,detail:bols.length?`${bols.length} saved`:'Pickup paperwork missing'},
      {id:'pod',label:'Proof of Delivery',complete:podComplete,required:true,detail:stops.length?`${pods.length} of ${stops.length} stops`:`${pods.length} saved`},
      {id:'logbook',label:'Supporting Logbook',complete:logbookComplete,required:true,detail:logbookComplete?`${days.length} linked day${days.length===1?'':'s'}`:'No exact load events linked'},
      {id:'miles',label:'Daily Driving Miles',complete:milesComplete,required:true,detail:milesComplete?'Mileage saved':'Add total miles for load days'},
      {id:'fuel',label:'Fuel Receipt',complete:fuelComplete,required:fuelActivity,optional:!fuelActivity,detail:fuelActivity?(fuelComplete?'Fuel evidence attached':'Fuel transaction found — receipt missing'):'No fuel activity detected'},
    ];
    const completeCount=checklist.filter(item=>item.complete).length;
    const percent=Math.round((completeCount/checklist.length)*100);
    const missing=checklist.filter(item=>item.required&&!item.complete);
    const origin=text(load.origin)||place(legs[0]?.fromCity,legs[0]?.fromState);
    const destination=text(load.destination)||place(legs.at(-1)?.toCity,legs.at(-1)?.toState);
    const title=[origin,destination].filter(Boolean).join(' → ') || `Load ${loadNo}`;
    return {
      id:load.id||`load_${loadNo}`,loadNo,title,origin,destination,broker:text(load.broker),status:missing.length?'needs_attention':'complete',
      percent,missing,checklist,documents:docs,events,legs,stops,pods,bols,rateCons,fuelDocs,fuelRows,expenses,days,missingStops,unassignedPods,
      counts:{documents:docs.length,stops:stops.length,pods:pods.length,bols:bols.length,rateCons:rateCons.length,fuel:fuelDocs.length},
    };
  }).sort((a,b)=>{
    if(a.status!==b.status) return a.status==='needs_attention'?-1:1;
    return (b.days.at(-1)||'').localeCompare(a.days.at(-1)||'') || b.loadNo.localeCompare(a.loadNo);
  });
}
